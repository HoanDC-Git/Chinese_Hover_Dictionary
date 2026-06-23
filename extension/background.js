let dictionary = null;
let offscreenCreating = null;
const RULE_ID = 1;

// Debug matching rules (available in unpacked dev extension)
if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
    console.log("DNR Rule Matched Debug:", info);
  });
}

// Helper to update the extension icon and badge based on active state
function updateUI(active) {
  const suffix = active ? "" : "_gray";
  chrome.action.setIcon({
    path: {
      "16": `icons/icon16${suffix}.png`,
      "48": `icons/icon48${suffix}.png`,
      "128": `icons/icon128${suffix}.png`
    }
  });
  chrome.action.setBadgeText({ text: "" });
}

// Load dictionary from extension resources in background (CSP safe)
async function loadDictionary() {
  if (dictionary) return dictionary;
  const url = chrome.runtime.getURL("data/dictionary.dat");
  try {
    const response = await fetch(url);
    dictionary = await response.json();

    console.log("Dictionary loaded and cached in background service worker.");
    return dictionary;
  } catch (err) {
    console.error("Failed to load dictionary in background worker:", err);
    throw err;
  }
}

// IndexedDB Database logic for "db" memoryMode
const DB_NAME = "ChineseDictionaryDB";
const DB_VERSION = 5; // Tăng version để lưu decomposition và variants
const STORE_NAME = "words";
const STORE_RADICALS = "radicals";
const STORE_SPECIALS = "specials";
const STORE_DECOMPOSITION = "decomposition";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "word" });
      } else {
        request.transaction.objectStore(STORE_NAME).clear();
      }
      if (!db.objectStoreNames.contains(STORE_RADICALS)) {
        db.createObjectStore(STORE_RADICALS, { keyPath: "character" });
      } else {
        request.transaction.objectStore(STORE_RADICALS).clear();
      }
      if (!db.objectStoreNames.contains(STORE_SPECIALS)) {
        db.createObjectStore(STORE_SPECIALS, { keyPath: "character" });
      } else {
        request.transaction.objectStore(STORE_SPECIALS).clear();
      }
      if (!db.objectStoreNames.contains(STORE_DECOMPOSITION)) {
        db.createObjectStore(STORE_DECOMPOSITION, { keyPath: "character" });
      } else {
        request.transaction.objectStore(STORE_DECOMPOSITION).clear();
      }
    };
  });
}

async function initIndexedDB() {
  try {
    const db = await openDB();
    const count = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const countReq = store.count();
      countReq.onsuccess = () => resolve(countReq.result);
      countReq.onerror = () => reject(countReq.error);
    });

    if (count === 0) {
      console.log("IndexedDB is empty or upgraded. Populating words and decomposition data...");
      
      const fetchWords = fetch(chrome.runtime.getURL("data/dictionary.dat")).then(r => r.json());
      const fetchRadicals = fetch(chrome.runtime.getURL("data/decompostion/radicals.json")).then(r => r.json());
      const fetchSpecials = fetch(chrome.runtime.getURL("data/decompostion/specials.json")).then(r => r.json());
      const fetchDetails = fetch(chrome.runtime.getURL("data/decompostion/details.json")).then(r => r.json());

      const [parsedDict, radicals, specials, details] = await Promise.all([fetchWords, fetchRadicals, fetchSpecials, fetchDetails]);
      
      const tx = db.transaction([STORE_NAME, STORE_RADICALS, STORE_SPECIALS, STORE_DECOMPOSITION], "readwrite");
      
      const storeWords = tx.objectStore(STORE_NAME);
      storeWords.clear();
      for (const [word, defs] of Object.entries(parsedDict)) {
        storeWords.put({ word, defs });
      }

      const storeRadicals = tx.objectStore(STORE_RADICALS);
      storeRadicals.clear();
      for (const rad of radicals) {
        storeRadicals.put(rad);
        if (rad.variants) {
          const variants = rad.variants.split(',').map(v => v.trim()).filter(v => v);
          for (const v of variants) {
            if (v !== rad.character) {
              storeRadicals.put({ ...rad, character: v, is_variant: true, original_character: rad.character });
            }
          }
        }
        if (rad.simplified && typeof rad.simplified === 'string') {
          const simplified = rad.simplified.trim();
          if (simplified && simplified !== rad.character) {
            storeRadicals.put({ ...rad, character: simplified, is_simplified: true, original_character: rad.character });
          }
        }
      }

      const storeSpecials = tx.objectStore(STORE_SPECIALS);
      storeSpecials.clear();
      for (const sp of specials) {
        storeSpecials.put(sp);
      }

      const storeDetails = tx.objectStore(STORE_DECOMPOSITION);
      storeDetails.clear();
      for (const detail of details) {
        storeDetails.put(detail);
      }

      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      console.log("IndexedDB populated successfully.");
    } else {
      console.log(`IndexedDB ready (${count} words).`);
    }
  } catch (err) {
    console.error("Failed to init IndexedDB:", err);
  }
}

function getFromDB(word) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(word);
      req.onsuccess = () => resolve(req.result ? req.result.defs : null);
      req.onerror = () => reject(req.error);
    } catch (err) {
      reject(err);
    }
  });
}

// Register dynamic rule for declarativeNetRequest to spoof Origin and User-Agent headers for Edge TTS
async function registerDNRRule() {
  const rule = {
    id: RULE_ID,
    priority: 1,
    action: {
      type: "modifyHeaders",
      requestHeaders: [
        {
          header: "Origin",
          operation: "set",
          value: "chrome-extension://jdiccldimpdaamigaceacjbojkocclih"
        },
        {
          header: "User-Agent",
          operation: "set",
          value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0"
        }
      ]
    },
    condition: {
      urlFilter: "*",
      requestDomains: ["speech.platform.bing.com"]
    }
  };

  try {
    // Always overwrite the rule to make sure it's the latest structure
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [RULE_ID],
      addRules: [rule]
    });
    console.log("Edge TTS DNR rule (Origin & User-Agent) updated successfully.");
  } catch (err) {
    console.error("Failed to update DNR rule:", err);
  }
}

// Preload dictionary and register DNR rules on startup
chrome.storage.local.get("memoryMode", (data) => {
  const mode = data.memoryMode || "db";
  if (mode === "ram") {
    loadDictionary().catch(() => {});
  } else {
    initIndexedDB().catch(() => {});
  }
});
registerDNRRule().catch(() => {});

// Listen to extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  const data = await chrome.storage.local.get("active");
  const active = !data.active; // Toggle state
  await chrome.storage.local.set({ active });
  updateUI(active);
  
  // Send active status to current tab directly in case storage listener lags
  if (tab.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "toggle", active });
    } catch (e) {
      // Ignore errors for tabs where content script isn't loaded (e.g. internal chrome:// pages)
    }
  }
});

// Listen to keyboard shortcuts (e.g. Alt+C to open options)
chrome.commands.onCommand.addListener((command) => {
  if (command === "open_options") {
    chrome.runtime.openOptionsPage();
  }
});

// Initialize state on installation
chrome.runtime.onInstalled.addListener(async () => {
  // Default to active state (ON) and setup default keys & feature toggles
  await chrome.storage.local.set({ 
    active: true,
    enableNudge: true,
    enableQuickActions: true,
    enableSelectionTranslate: true,
    keyUp: "w",
    keyDown: "s",
    keyLeft: "a",
    keyRight: "d",
    keyCopy: "c",
    keySpeak: "v",
    keyStroke: "z",
    keyToggleActive: "q",
    fontFamily: "system",
    fontSize: "medium",
    theme: "light",
    strokeModifier: "alt",
    toggleActiveModifier: "alt"
  });
  updateUI(true);
  await registerDNRRule();
});

// Initialize state on browser startup
chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get("active");
  updateUI(!!data.active);
  await registerDNRRule();
});

// Sync active status changes to update extension icon and badge in real time
chrome.storage.onChanged.addListener((changes) => {
  if (changes.active) {
    updateUI(!!changes.active.newValue);
  }
  if (changes.memoryMode) {
    const mode = changes.memoryMode.newValue;
    if (mode === "db") {
      dictionary = null; // Clear RAM
      initIndexedDB();
    } else if (mode === "ram") {
      loadDictionary();
    }
  }
});

// Create offscreen document if it doesn't exist
async function setupOffscreen() {
  const offscreenUrl = chrome.runtime.getURL("offscreen.html");
  
  try {
    // Check if offscreen document is already open
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"]
    });
    
    if (contexts.length > 0) {
      console.log("setupOffscreen: Offscreen document already exists.");
      return;
    }
  } catch (e) {
    console.warn("setupOffscreen: chrome.runtime.getContexts failed, checking creating promise instead:", e);
  }
  
  if (offscreenCreating) {
    console.log("setupOffscreen: Offscreen document is already in the process of being created.");
    await offscreenCreating;
    return;
  }
  
  console.log("setupOffscreen: Creating new offscreen document...");
  try {
    offscreenCreating = chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: ["AUDIO_PLAYBACK"],
      justification: "Synthesizing and playing Edge TTS pronunciation"
    });
    await offscreenCreating;
    console.log("setupOffscreen: Offscreen document created successfully.");
  } catch (err) {
    console.error("setupOffscreen: Failed to create offscreen document:", err);
    throw err;
  } finally {
    offscreenCreating = null;
  }
}

// Function to send message to offscreen document with retries
async function sendMessageToOffscreen(message) {
  console.log("Sending message to offscreen document, message:", message);
  for (let i = 0; i < 10; i++) {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res);
          }
        });
      });
      console.log("Received response from offscreen document:", response);
      return response;
    } catch (err) {
      console.warn(`Attempt ${i + 1} to send message to offscreen failed: ${err.message}. Retrying in 100ms...`);
      await new Promise(r => setTimeout(r, 100));
    }
  }
  throw new Error("Failed to communicate with offscreen document after multiple attempts.");
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "speak") {
    console.log("Background received speak request for text:", message.text);
    
    // Firefox fallback (no offscreen API support yet, but background scripts can play audio directly)
    if (!chrome.offscreen) {
      console.log("chrome.offscreen is undefined. Falling back to direct playback (Firefox).");
      if (typeof ff_playText === "function") {
        ff_playText(message.text)
          .then(() => {
            console.log("Fallback speech finished playing.");
            sendResponse({ success: true });
          })
          .catch(err => {
            console.error("Fallback speech failed:", err);
            sendResponse({ error: err.message });
          });
        return true;
      } else {
        console.error("ff_playText fallback function not found!");
        sendResponse({ error: "ff_playText fallback function not found." });
        return false;
      }
    }

    // Chrome logic using offscreen document
    setupOffscreen()
      .then(() => sendMessageToOffscreen({
        action: "speak_offscreen",
        text: message.text
      }))
      .then((response) => {
        sendResponse(response);
      })
      .catch(err => {
        console.error("Background speak orchestration failed:", err);
        sendResponse({ error: err.message });
      });
    return true; // Keep message channel open for asynchronous reply
  }
  
  if (message.action === "preloadTTS") {
    if (chrome.offscreen) {
      setupOffscreen()
        .then(() => sendMessageToOffscreen({
          action: "preloadTTS_offscreen",
          text: message.text
        }))
        .catch(err => console.warn("Background preload TTS failed:", err));
    } else {
      if (typeof ff_preloadText === "function") ff_preloadText(message.text);
    }
    return true;
  }
  
  if (["pause_audio", "resume_audio", "seek_audio", "stop_audio"].includes(message.action)) {
    if (chrome.offscreen) {
      // Don't setup offscreen if it doesn't exist, just send if it might be there
      sendMessageToOffscreen({ 
        action: message.action + "_offscreen", 
        seconds: message.seconds 
      }).catch(err => console.warn(`Background ${message.action} failed:`, err));
    } else {
      if (message.action === "pause_audio" && typeof ff_pauseAudio === "function") ff_pauseAudio();
      if (message.action === "resume_audio" && typeof ff_resumeAudio === "function") ff_resumeAudio();
      if (message.action === "seek_audio" && typeof ff_seekAudio === "function") ff_seekAudio(message.seconds);
      if (message.action === "stop_audio" && typeof ff_stopAudio === "function") ff_stopAudio();
    }
    return true;
  }
  
  if (message.action === "audio_started") {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {action: "audio_started"}).catch(() => {});
      }
    });
    return true;
  }
  
  if (message.action === "lookup") {
    chrome.storage.local.get("memoryMode", async (data) => {
      const mode = data.memoryMode || "db";
      const text = message.text;
      const matches = [];
      const results = {};
      
      try {
        if (mode === "ram") {
          const dict = await loadDictionary();
          for (let len = text.length; len >= 1; len--) {
            const candidate = text.substring(0, len);
            if (dict[candidate]) {
              matches.push(candidate);
              results[candidate] = dict[candidate];
            }
          }
        } else {
          // DB Mode
          const candidateLookups = [];
          for (let len = text.length; len >= 1; len--) {
            candidateLookups.push(text.substring(0, len));
          }
          const dbResults = await Promise.all(candidateLookups.map(w => getFromDB(w)));
          candidateLookups.forEach((candidate, idx) => {
            if (dbResults[idx]) {
              matches.push(candidate);
              results[candidate] = dbResults[idx];
            }
          });
        }
        sendResponse({ matches, definitions: results });
      } catch (err) {
        console.error("Lookup failed:", err);
        sendResponse(null);
      }
    });
    return true; // Keep message channel open for asynchronous reply
  }
  
  if (message.action === "getDecomposition") {
    openDB().then(db => {
      const tx = db.transaction([STORE_DECOMPOSITION, STORE_RADICALS, STORE_SPECIALS], "readonly");
      const getReq = (storeName, key) => new Promise((res) => {
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => res(req.result);
        req.onerror = () => res(null);
      });

      Promise.all([
        getReq(STORE_DECOMPOSITION, message.character),
        getReq(STORE_RADICALS, message.character),
        getReq(STORE_SPECIALS, message.character)
      ]).then(([details, radical, special]) => {
        sendResponse({ details, radical, special });
      });
    }).catch(err => {
      console.error("Failed to get decomposition:", err);
      sendResponse(null);
    });
    return true;
  }

  if (message.action === "getDictionary") {
    chrome.storage.local.get("memoryMode", async (data) => {
      if (data.memoryMode === "db") {
        sendResponse(null); // Not supported in DB mode to transfer entire DB to content script
      } else {
        loadDictionary()
          .then(dict => sendResponse(dict))
          .catch(err => {
            console.error("Failed to supply dictionary:", err);
            sendResponse(null);
          });
      }
    });
    return true; // Keep message channel open for asynchronous reply
  }
});

// ==========================================
// FIREFOX FALLBACK AUDIO LOGIC (NO OFFSCREEN)
// ==========================================
let ff_currentWs = null;
let ff_currentAudio = null;
let ff_preloadedAudioBlobUrl = null;
let ff_preloadedText = null;
let ff_currentAudioResolve = null;

async function ff_sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function ff_generateHexId() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function ff_connectAndSpeak(text) {
  const unixTime = BigInt(Math.floor(Date.now() / 1000));
  const ticks = (unixTime + 11644473600n) * 10000000n;
  const roundedTicks = ticks - (ticks % 3000000000n);
  const gecInput = `${roundedTicks}6A5AA1D4EAFF4E9FB37E23D68491D6F4`;
  const gec = await ff_sha256(gecInput);
  const connId = ff_generateHexId();
  
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connId}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=1-133.0.3065.51`;
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ff_currentWs = ws;
    ws.binaryType = "arraybuffer";
    let audioChunks = [];
    let isFinished = false;
    
    ws.onopen = () => {
      if (ff_currentWs !== ws) { ws.close(); return; }
      const configPayload = "Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n" + JSON.stringify({context:{synthesis:{audio:{metadataoptions:{sentenceBoundaryEnabled:"false",wordBoundaryEnabled:"true"},outputFormat:"audio-24khz-48kbitrate-mono-mp3"}}}});
      ws.send(configPayload);
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'><voice name='zh-CN-XiaoxiaoNeural'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${text}</prosody></voice></speak>`;
      const ssmlPayload = `X-RequestId:${ff_generateHexId()}\r\nContent-Type:application/ssml+xml\r\nX-Microsoft-OutputFormat:audio-24khz-48kbitrate-mono-mp3\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlPayload);
    };
    
    const utf8Decoder = new TextDecoder("utf-8");
    ws.onmessage = (event) => {
      if (ff_currentWs !== ws) { ws.close(); return; }
      if (typeof event.data === "string") {
        if (event.data.includes("Path:turn.end")) {
          isFinished = true; ws.close();
          if (ff_currentWs === ws) ff_currentWs = null;
          if (audioChunks.length === 0) reject(new Error("No audio")); else resolve(audioChunks);
        }
      } else if (event.data instanceof ArrayBuffer) {
        const dataView = new DataView(event.data);
        const headerLength = dataView.getUint16(0, false);
        const headerBuffer = new Uint8Array(event.data, 2, headerLength);
        if (utf8Decoder.decode(headerBuffer).includes("Path:audio")) {
          audioChunks.push(new Uint8Array(event.data, 2 + headerLength));
        }
      }
    };
    ws.onerror = () => { if (ff_currentWs === ws) ff_currentWs = null; reject(new Error("WS error")); };
    ws.onclose = () => {
      const wasAborted = (ff_currentWs !== ws);
      if (ff_currentWs === ws) ff_currentWs = null;
      if (!isFinished) { if (wasAborted) reject(new Error("Aborted")); else if (audioChunks.length > 0) resolve(audioChunks); else reject(new Error("WS closed")); }
    };
  });
}

async function ff_preloadText(text) {
  if (text === ff_preloadedText) return;
  try {
    const audioChunks = await ff_connectAndSpeak(text);
    const blob = new Blob(audioChunks, { type: "audio/mpeg" });
    if (ff_preloadedAudioBlobUrl) URL.revokeObjectURL(ff_preloadedAudioBlobUrl);
    ff_preloadedAudioBlobUrl = URL.createObjectURL(blob);
    ff_preloadedText = text;
  } catch (e) {}
}

async function ff_playText(text) {
  if (text === ff_preloadedText && ff_preloadedAudioBlobUrl) {
    if (ff_currentAudio) { try { ff_currentAudio.pause(); } catch (e) {} }
    if (ff_currentAudioResolve) { ff_currentAudioResolve(); ff_currentAudioResolve = null; }
    ff_currentAudio = new Audio(ff_preloadedAudioBlobUrl);
    await ff_currentAudio.play();
    chrome.tabs.query({active: true, currentWindow: true}, t => { if (t[0]) chrome.tabs.sendMessage(t[0].id, {action: "audio_started"}).catch(()=>{}); });
    await new Promise(resolve => {
      ff_currentAudioResolve = resolve;
      ff_currentAudio.onended = () => { if (ff_currentAudioResolve === resolve) { ff_currentAudioResolve(); ff_currentAudioResolve = null; } };
      ff_currentAudio.onerror = ff_currentAudio.onended;
    });
    return;
  }
  
  if (ff_currentWs) { try { ff_currentWs.close(); } catch (e) {} ff_currentWs = null; }
  if (ff_currentAudio) { try { ff_currentAudio.pause(); } catch (e) {} ff_currentAudio = null; }
  if (ff_currentAudioResolve) { ff_currentAudioResolve(); ff_currentAudioResolve = null; }
  
  const audioChunks = await Promise.race([
    ff_connectAndSpeak(text),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000))
  ]);
  const blob = new Blob(audioChunks, { type: "audio/mpeg" });
  ff_currentAudio = new Audio(URL.createObjectURL(blob));
  await ff_currentAudio.play();
  chrome.tabs.query({active: true, currentWindow: true}, t => { if (t[0]) chrome.tabs.sendMessage(t[0].id, {action: "audio_started"}).catch(()=>{}); });
  
  await new Promise(resolve => {
    ff_currentAudioResolve = resolve;
    ff_currentAudio.onended = () => { if (ff_currentAudioResolve === resolve) { ff_currentAudioResolve(); ff_currentAudioResolve = null; } };
    ff_currentAudio.onerror = ff_currentAudio.onended;
  });
}

function ff_pauseAudio() { if (ff_currentAudio && !ff_currentAudio.paused) ff_currentAudio.pause(); }
function ff_resumeAudio() { if (ff_currentAudio && ff_currentAudio.paused) ff_currentAudio.play(); }
function ff_seekAudio(sec) { if (ff_currentAudio) ff_currentAudio.currentTime = Math.max(0, ff_currentAudio.currentTime + sec); }
function ff_stopAudio() {
  if (ff_currentAudio && !ff_currentAudio.paused) {
    const fadeOut = setInterval(() => {
      if (!ff_currentAudio) { clearInterval(fadeOut); return; }
      if (ff_currentAudio.volume > 0.1) ff_currentAudio.volume -= 0.1;
      else { clearInterval(fadeOut); ff_currentAudio.pause(); ff_currentAudio.volume = 1.0; }
    }, 50);
  } else if (ff_currentAudio) {
    ff_currentAudio.pause();
  }
}
