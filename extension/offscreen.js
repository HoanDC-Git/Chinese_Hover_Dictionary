const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const GEC_VERSION = "1-133.0.3065.51";

let currentWs = null;
let currentAudio = null;

// Function to generate the Sec-MS-GEC input token
function generateSecMsGec() {
  const unixTime = BigInt(Math.floor(Date.now() / 1000));
  const ticks = (unixTime + 11644473600n) * 10000000n;
  const roundedTicks = ticks - (ticks % 3000000000n);
  return `${roundedTicks}${TRUSTED_CLIENT_TOKEN}`;
}

// Function to calculate SHA-256 hash using Web Crypto API
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Helper to generate a random 32-character hex ID
function generateHexId() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// Warm up the browser AudioContext immediately upon offscreen document load
// This wakes up the OS audio device/output so subsequent playbacks have no delay/cut-offs
function warmUpAudio() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0; // Silent oscillator
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(0);
    osc.stop(0.1); // Play silence for 0.1 seconds
    console.log("AudioContext warmed up successfully.");
  } catch (e) {
    console.warn("Failed to warm up AudioContext:", e);
  }
}

// Warm up audio context on load
warmUpAudio();

// Perform WebSocket synthesis from Edge TTS API
async function connectAndSpeak(text) {
  const gecInput = generateSecMsGec();
  const gec = await sha256(gecInput);
  const connId = generateHexId();
  
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connId}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${GEC_VERSION}`;
  
  return new Promise((resolve, reject) => {
    console.log("Connecting to Edge TTS WebSocket via offscreen document...");
    const ws = new WebSocket(wsUrl);
    currentWs = ws;
    ws.binaryType = "arraybuffer";
    
    let audioChunks = [];
    let isFinished = false;
    
    ws.onopen = () => {
      if (currentWs !== ws) {
        ws.close();
        return;
      }
      
      console.log("WebSocket connected. Sending speech config...");
      const configPayload = 
        "Content-Type:application/json; charset=utf-8\r\n" +
        "Path:speech.config\r\n\r\n" +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "true"
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3"
              }
            }
          }
        });
      ws.send(configPayload);
      
      console.log("Sending SSML payload for text:", text);
      const requestId = generateHexId();
      // Valid SSML for Edge Read Aloud endpoint (only speak, voice, and prosody tags are supported)
      const ssml = 
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>` +
          `<voice name='zh-CN-XiaoxiaoNeural'>` +
            `<prosody pitch='+0Hz' rate='+0%' volume='+0%'>${text}</prosody>` +
          `</voice>` +
        `</speak>`;
      
      const ssmlPayload = 
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Microsoft-OutputFormat:audio-24khz-48kbitrate-mono-mp3\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml;
        
      ws.send(ssmlPayload);
    };
    
    const utf8Decoder = new TextDecoder("utf-8");
    
    ws.onmessage = (event) => {
      if (currentWs !== ws) {
        ws.close();
        return;
      }
      
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          console.log("Edge TTS: turn.end received. Audio chunks count:", audioChunks.length);
          isFinished = true;
          ws.close();
          if (currentWs === ws) {
            currentWs = null;
          }
          if (audioChunks.length === 0) {
            reject(new Error("No audio chunks received from Edge TTS"));
          } else {
            resolve(audioChunks);
          }
        }
      } else if (event.data instanceof ArrayBuffer) {
        const dataView = new DataView(event.data);
        const headerLength = dataView.getUint16(0, false);
        const headerBuffer = new Uint8Array(event.data, 2, headerLength);
        const header = utf8Decoder.decode(headerBuffer);
        
        if (header.includes("Path:audio")) {
          const audioData = new Uint8Array(event.data, 2 + headerLength);
          audioChunks.push(audioData);
        }
      }
    };
    
    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      if (currentWs === ws) {
        currentWs = null;
      }
      reject(new Error("WebSocket connection error. Server might have blocked it (403) or network is offline."));
    };
    
    ws.onclose = (event) => {
      console.log(`WebSocket closed with code: ${event.code}, wasClean: ${event.wasClean}`);
      const wasAborted = (currentWs !== ws);
      if (currentWs === ws) {
        currentWs = null;
      }
      if (!isFinished) {
        if (wasAborted) {
          reject(new Error("Aborted"));
        } else if (audioChunks.length > 0) {
          resolve(audioChunks);
        } else {
          reject(new Error(`WebSocket closed unexpectedly with code ${event.code}`));
        }
      }
    };
  });
}

// Fallback to native browser TTS
async function speakNativeFallback(text) {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      return reject(new Error("Native speech synthesis not supported by this browser."));
    }
    
    window.speechSynthesis.cancel(); // Stop any currently playing native audio
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    
    // Try to find a Chinese voice
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(v => v.lang.startsWith("zh-"));
    if (zhVoice) {
      utterance.voice = zhVoice;
    }
    
    utterance.onend = resolve;
    utterance.onerror = resolve;
    
    if (currentAudioResolve) {
      currentAudioResolve();
    }
    currentAudioResolve = resolve;
    
    utterance.onstart = () => {
      chrome.runtime.sendMessage({ action: "audio_started" });
    };
    
    window.speechSynthesis.speak(utterance);
  });
}

let preloadedAudioBlobUrl = null;
let preloadedText = null;
let currentAudioResolve = null;

async function preloadText(text) {
  if (text === preloadedText) return;
  try {
    const audioChunks = await connectAndSpeak(text);
    const blob = new Blob(audioChunks, { type: "audio/mpeg" });
    if (preloadedAudioBlobUrl) URL.revokeObjectURL(preloadedAudioBlobUrl);
    preloadedAudioBlobUrl = URL.createObjectURL(blob);
    preloadedText = text;
    console.log("Preloaded TTS for:", text);
  } catch (e) {
    console.warn("Preload failed", e);
  }
}

// Function to synthesize and play text
async function playText(text) {
  console.log("playText called with:", text);
  
  if (text === preloadedText && preloadedAudioBlobUrl) {
    console.log("Playing preloaded audio...");
    if (currentAudio) {
      try { currentAudio.pause(); } catch (e) {}
    }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    
    if (currentAudioResolve) {
      currentAudioResolve();
      currentAudioResolve = null;
    }
    
    currentAudio = new Audio(preloadedAudioBlobUrl);
    await currentAudio.play();
    chrome.runtime.sendMessage({ action: "audio_started" });
    await new Promise(resolve => {
      currentAudioResolve = resolve;
      currentAudio.onended = () => {
        if (currentAudioResolve === resolve) {
          currentAudioResolve();
          currentAudioResolve = null;
        }
      };
      currentAudio.onerror = currentAudio.onended;
    });
    return;
  }
  
  // Cancel previous WebSocket if any
  if (currentWs) {
    try {
      console.log("Cancelling previous WebSocket connection...");
      currentWs.close();
    } catch (e) {}
    currentWs = null;
  }
  
  // Cancel previous audio if playing
  if (currentAudio) {
    try {
      console.log("Pausing previous audio playback...");
      currentAudio.pause();
    } catch (e) {}
    currentAudio = null;
  }
  
  if (currentAudioResolve) {
    currentAudioResolve();
    currentAudioResolve = null;
  }
  
  // Also cancel native speech if any
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  try {
    const TIMEOUT_MS = 10000;
    const audioChunks = await Promise.race([
      connectAndSpeak(text),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Edge_TTS_Timeout")), TIMEOUT_MS))
    ]);

    console.log("Successfully gathered audio chunks. Assembling Blob...");
    
    const blob = new Blob(audioChunks, { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);
    
    currentAudio = new Audio(url);
    console.log("Playing audio...");
    await currentAudio.play();
    console.log("Audio started playing successfully.");
    chrome.runtime.sendMessage({ action: "audio_started" });
    
    await new Promise(resolve => {
      currentAudioResolve = resolve;
      currentAudio.onended = () => {
        if (currentAudioResolve === resolve) {
          currentAudioResolve();
          currentAudioResolve = null;
        }
      };
      currentAudio.onerror = currentAudio.onended;
    });
  } catch (err) {
    if (err.message === "Aborted") {
      console.log("Speech request aborted due to a new incoming request.");
      return;
    }
    console.warn("Edge TTS failed or timed out. Falling back to native TTS. Error:", err.message);
    await speakNativeFallback(text);
  }
}

// Listen for play messages from background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Offscreen received message:", message);
  if (message.action === "speak_offscreen") {
    playText(message.text)
      .then(() => {
        console.log("Speech finished playing, sending success response...");
        sendResponse({ success: true });
      })
      .catch(err => {
        console.error("Speech failed, sending error response:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keeps the message channel open for async response
  }
  
  if (message.action === "preloadTTS_offscreen") {
    preloadText(message.text);
    sendResponse({ success: true });
    return false;
  }
  
  if (message.action === "pause_audio_offscreen") {
    if (currentAudio && !currentAudio.paused) currentAudio.pause();
    if (window.speechSynthesis) window.speechSynthesis.pause();
    sendResponse({ success: true });
    return false;
  }
  
  if (message.action === "resume_audio_offscreen") {
    if (currentAudio && currentAudio.paused) currentAudio.play();
    if (window.speechSynthesis) window.speechSynthesis.resume();
    sendResponse({ success: true });
    return false;
  }
  
  if (message.action === "seek_audio_offscreen") {
    if (currentAudio) {
      currentAudio.currentTime = Math.max(0, currentAudio.currentTime + message.seconds);
    }
    sendResponse({ success: true });
    return false;
  }
  
  if (message.action === "stop_audio_offscreen") {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    
    if (currentAudio && !currentAudio.paused) {
      const fadeOut = setInterval(() => {
        if (!currentAudio) {
          clearInterval(fadeOut);
          return;
        }
        if (currentAudio.volume > 0.1) {
          currentAudio.volume -= 0.1;
        } else {
          clearInterval(fadeOut);
          currentAudio.pause();
          currentAudio.volume = 1.0;
        }
      }, 50);
    } else if (currentAudio) {
      currentAudio.pause();
    }
    sendResponse({ success: true });
    return false;
  }
});
