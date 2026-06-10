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
const DB_VERSION = 1;
const STORE_NAME = "words";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "word" });
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
      console.log("IndexedDB is empty. Populating 95k words...");
      const url = chrome.runtime.getURL("data/dictionary.dat");
      const response = await fetch(url);
      const jsonDict = await response.json();
      
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const [word, defs] of Object.entries(jsonDict)) {
        store.put({ word, defs });
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
    keyUp: "w",
    keyDown: "s",
    keyLeft: "a",
    keyRight: "d",
    keyCopy: "c",
    keySpeak: "v",
    keyStroke: "z",
    keyToggleActive: "x",
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
      if (typeof playText === "function") {
        playText(message.text)
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
        console.error("playText fallback function not found!");
        sendResponse({ error: "playText fallback function not found." });
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
