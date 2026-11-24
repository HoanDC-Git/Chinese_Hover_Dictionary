let dictionary = null;
let t2sMap = null;
let offscreenCreating = null;

// Database seeding state. The word dictionary and the decomposition data are
// seeded independently so a large dictionary write never blocks the
// decomposition panel (and vice versa).
let wordSeedDict = null;
let wordSeedPromise = null;
let wordDbReady = false;
let wordDbChecked = false;
let wordDbSeeding = false;
let wordDbCheckPromise = null;
let wordDbCheckResolve = null;
let wordDbInitPromise = null;
let decompDbReady = false;
let decompDbInitPromise = null;
let decompMemory = null;
let decompDataPromise = null;

async function loadT2S() {
  if (t2sMap) return t2sMap;
  try {
    const response = await fetch(chrome.runtime.getURL("data/t2s.json"));
    t2sMap = await response.json();
    return t2sMap;
  } catch (err) {
    console.error("Failed to load t2s.json", err);
    return {};
  }
}

function convertToSimplified(text, map) {
  return text.split('').map(c => map[c] || c).join('');
}
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

function fetchExtensionJson(path) {
  return fetch(chrome.runtime.getURL(path)).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.status}`);
    }
    return response.json();
  });
}

// Load the dictionary into RAM. In "db" mode this is also used as a temporary
// in-memory fallback while the word store is being seeded for the first time.
async function ensureWordSeed() {
  if (wordSeedDict) return wordSeedDict;
  if (!wordSeedPromise) {
    wordSeedPromise = fetchExtensionJson("data/dictionary.json")
      .then((parsed) => {
        wordSeedDict = parsed;
        return parsed;
      })
      .catch((err) => {
        wordSeedPromise = null;
        throw err;
      });
  }
  return wordSeedPromise;
}

async function loadDictionary() {
  if (dictionary) return dictionary;
  try {
    dictionary = await ensureWordSeed();
    console.log("Dictionary loaded and cached in background service worker.");
    return dictionary;
  } catch (err) {
    console.error("Failed to load dictionary in background worker:", err);
    throw err;
  }
}

function findDictionaryMatches(dict, text, originalText) {
  const matches = [];
  const results = {};
  const originalMatches = {};

  for (let len = text.length; len >= 1; len--) {
    const candidate = text.substring(0, len);
    if (dict[candidate]) {
      matches.push(candidate);
      results[candidate] = dict[candidate];
      originalMatches[candidate] = originalText.substring(0, len);
    }
  }

  return { matches, definitions: results, originalMatches };
}

// IndexedDB Database logic for "db" memoryMode
const DB_NAME = "ChineseDictionaryDB";
// IndexedDB bắt buộc version phải là SỐ NGUYÊN. Hàm này giúp chuyển chuỗi "1.0.4.12" thành số nguyên an toàn.
const API = typeof browser !== 'undefined' ? browser : chrome;
const APP_VERSION = API.runtime.getManifest().version; // Lấy trực tiếp từ manifest.json (Hỗ trợ cả Chrome và Firefox)
function parseVersionString(verStr) {
  const parts = verStr.split('.');
  let num = 0;
  for (let i = 0; i < 4; i++) { // Hỗ trợ tối đa 4 phần (vd: 1.0.4.12), mỗi phần tối đa 2 chữ số (0-99)
    num = num * 100 + (parseInt(parts[i], 10) || 0);
  }
  return num || 1;
}
const DB_VERSION = parseVersionString(APP_VERSION);
const STORE_NAME = "words";
const STORE_RADICALS = "radicals";
const STORE_SPECIALS = "specials";
const STORE_DECOMPOSITION = "decomposition";
// Chunked word seeding is not atomic. This sentinel is written only after the
// final chunk, so an interrupted seed is detected and restarted next time.
const WORD_SEED_SENTINEL = "__vietzhong_word_seed_complete__";

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another connection."));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
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

  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function countStore(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const countReq = tx.objectStore(storeName).count();
    countReq.onsuccess = () => resolve(countReq.result);
    countReq.onerror = () => reject(countReq.error);
  });
}

function getStoreValue(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const getReq = tx.objectStore(storeName).get(key);
    getReq.onsuccess = () => resolve(getReq.result);
    getReq.onerror = () => reject(getReq.error);
  });
}

function markWordSeedComplete(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ word: WORD_SEED_SENTINEL, defs: [] });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Could not write word seed sentinel."));
    tx.onabort = () => reject(tx.error || new Error("Word seed sentinel transaction aborted."));
  });
}

async function seedWordsInChunks(db, parsedDict) {
  const entries = Object.entries(parsedDict);
  const CHUNK_SIZE = 5000;

  for (let start = 0; start < entries.length; start += CHUNK_SIZE) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      if (start === 0) store.clear();

      const end = Math.min(start + CHUNK_SIZE, entries.length);
      for (let i = start; i < end; i++) {
        const [word, defs] = entries[i];
        store.put({ word, defs });
      }

      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Word seed transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("Word seed transaction aborted."));
    });
  }
}

function buildDecompMemory(radicals, specials, details) {
  const detailsMap = new Map();
  for (const detail of details) {
    detailsMap.set(detail.character, detail);
  }

  const radicalsMap = new Map();
  for (const rad of radicals) {
    radicalsMap.set(rad.character, rad);

    if (rad.variants) {
      let variants = [];
      if (Array.isArray(rad.variants)) {
        variants = rad.variants;
      } else if (typeof rad.variants === "string") {
        variants = rad.variants.split(",").map((v) => v.trim()).filter((v) => v);
      }
      for (const v of variants) {
        if (v !== rad.character) {
          radicalsMap.set(v, {
            ...rad,
            character: v,
            is_variant: true,
            original_character: rad.character,
          });
        }
      }
    }

    if (rad.simplified && typeof rad.simplified === "string") {
      const simplified = rad.simplified.trim();
      if (simplified && simplified !== rad.character) {
        radicalsMap.set(simplified, {
          ...rad,
          character: simplified,
          is_simplified: true,
          original_character: rad.character,
        });
      }
    }
  }

  const specialsMap = new Map();
  for (const sp of specials) {
    specialsMap.set(sp.character, sp);
  }

  return { detailsMap, radicalsMap, specialsMap };
}

async function ensureDecompData() {
  if (decompMemory) return decompMemory;
  if (!decompDataPromise) {
    decompDataPromise = Promise.all([
      fetchExtensionJson("data/decompostion/radicals.json"),
      fetchExtensionJson("data/decompostion/specials.json"),
      fetchExtensionJson("data/decompostion/details.json"),
    ])
      .then(([radicals, specials, details]) => {
        decompMemory = buildDecompMemory(radicals, specials, details);
        return decompMemory;
      })
      .catch((err) => {
        decompDataPromise = null;
        throw err;
      });
  }
  return decompDataPromise;
}

async function seedDecompStores(db, memory) {
  await new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORE_RADICALS, STORE_SPECIALS, STORE_DECOMPOSITION],
      "readwrite",
    );

    const storeRadicals = tx.objectStore(STORE_RADICALS);
    storeRadicals.clear();
    for (const rad of memory.radicalsMap.values()) {
      storeRadicals.put(rad);
    }

    const storeSpecials = tx.objectStore(STORE_SPECIALS);
    storeSpecials.clear();
    for (const sp of memory.specialsMap.values()) {
      storeSpecials.put(sp);
    }

    const storeDetails = tx.objectStore(STORE_DECOMPOSITION);
    storeDetails.clear();
    for (const detail of memory.detailsMap.values()) {
      storeDetails.put(detail);
    }

    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error("Decomposition seed transaction failed."));
    tx.onabort = () => reject(tx.error || new Error("Decomposition seed transaction aborted."));
  });
}

function markWordDbChecked() {
  wordDbChecked = true;
  if (wordDbCheckResolve) {
    wordDbCheckResolve();
    wordDbCheckResolve = null;
  }
}

const WORD_DB_CHECK_TIMEOUT_MS = 1000;

function waitForWordDbCheck() {
  if (wordDbChecked || wordDbReady || wordDbSeeding) return Promise.resolve();
  if (!wordDbCheckPromise) {
    wordDbCheckPromise = new Promise((resolve) => {
      wordDbCheckResolve = resolve;
    });
  }
  // Never let a slow/blocked IndexedDB open stall the hover popup.
  return Promise.race([
    wordDbCheckPromise,
    new Promise((resolve) => setTimeout(resolve, WORD_DB_CHECK_TIMEOUT_MS)),
  ]);
}

function initWordDB() {
  if (wordDbReady) return Promise.resolve();
  if (wordDbInitPromise) return wordDbInitPromise;

  wordDbInitPromise = (async () => {
    try {
      const db = await openDB();
      const sentinel = await getStoreValue(db, STORE_NAME, WORD_SEED_SENTINEL);
      markWordDbChecked();

      if (sentinel) {
        wordDbReady = true;
        wordSeedDict = null;
        wordSeedPromise = null;
        console.log("Word database ready (seed sentinel found).");
        return;
      }

      console.log("Word database is empty, incomplete, or just upgraded. Seeding...");
      wordDbSeeding = true;

      // Make sure decomposition loading has started too, but do not wait for
      // its IndexedDB seed. Hover lookups use the in-memory word seed while
      // both stores are being populated.
      if (!decompDbInitPromise && !decompDbReady) {
        initDecompDB().catch(() => {});
      }

      const parsedDict = await ensureWordSeed();
      await seedWordsInChunks(db, parsedDict);
      await markWordSeedComplete(db);

      wordDbReady = true;
      // Free the in-memory copy; lookups now use IndexedDB.
      wordSeedDict = null;
      wordSeedPromise = null;
      console.log("Word database seeded successfully.");
    } finally {
      wordDbSeeding = false;
      markWordDbChecked();
    }
  })().catch((err) => {
    console.error("Failed to init word database:", err);
    wordDbInitPromise = null;
    throw err;
  });

  return wordDbInitPromise;
}

function initDecompDB() {
  if (decompDbReady) return Promise.resolve();
  if (decompDbInitPromise) return decompDbInitPromise;

  decompDbInitPromise = (async () => {
    const db = await openDB();
    const [detailCount, radicalCount, specialCount] = await Promise.all([
      countStore(db, STORE_DECOMPOSITION),
      countStore(db, STORE_RADICALS),
      countStore(db, STORE_SPECIALS),
    ]);

    if (detailCount > 0 && radicalCount > 0 && specialCount > 0) {
      decompDbReady = true;
      console.log(
        `Decomposition database ready (${detailCount} details, ${radicalCount} radicals, ${specialCount} specials).`,
      );
      return;
    }

    console.log("Decomposition database is empty (or just upgraded). Seeding...");
    const memory = await ensureDecompData();
    await seedDecompStores(db, memory);
    decompDbReady = true;
    console.log("Decomposition database seeded successfully.");
  })().catch((err) => {
    console.error("Failed to init decomposition database:", err);
    decompDbInitPromise = null;
    throw err;
  });

  return decompDbInitPromise;
}

function getFromDB(word) {
  return new Promise(async (resolve, reject) => {
    try {
      await initWordDB();
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
          value: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"
        },
        {
          header: "User-Agent",
          operation: "set",
          value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0"
        }
      ]
    },
    condition: {
      urlFilter: "*",
      requestDomains: ["speech.platform.bing.com"],
      resourceTypes: ["websocket"]
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
    // Seed the decomposition stores first so the side panel is usable as
    // soon as possible. Word lookups fall back to the in-memory seed until
    // their (much larger) write finishes.
    initDecompDB().catch(() => {});
    initWordDB().catch(() => {});
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
      initDecompDB().catch(() => {});
      initWordDB().catch(() => {});
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
      const originalText = message.text;
      const t2s = await loadT2S();
      const text = convertToSimplified(originalText, t2s);
      
      try {
        if (mode === "ram") {
          const dict = await loadDictionary();
          sendResponse(findDictionaryMatches(dict, text, originalText));
          return;
        }

        // DB Mode. On first install/update the word store can take a few
        // seconds to seed. Keep hover usable by answering from the in-memory
        // seed dictionary until the write transaction has finished. On a
        // normal cold start the DB check is fast, so we wait for it before
        // deciding whether the 13 MB in-memory fallback is really needed.
        if (!wordDbReady) {
          if (!wordDbInitPromise && !wordDbSeeding) {
            initWordDB().catch(() => {});
          }
          await waitForWordDbCheck();

          if (!wordDbReady) {
            const seedDict = wordSeedDict || (await ensureWordSeed());
            sendResponse(findDictionaryMatches(seedDict, text, originalText));
            return;
          }
        }

        const candidateLookups = [];
        for (let len = text.length; len >= 1; len--) {
          candidateLookups.push({
            simp: text.substring(0, len),
            trad: originalText.substring(0, len)
          });
        }
        const matches = [];
        const results = {};
        const originalMatches = {};
        const dbResults = await Promise.all(candidateLookups.map(c => getFromDB(c.simp)));
        candidateLookups.forEach((c, idx) => {
          if (dbResults[idx]) {
            matches.push(c.simp);
            results[c.simp] = dbResults[idx];
            originalMatches[c.simp] = c.trad;
          }
        });
        sendResponse({ matches, definitions: results, originalMatches });
      } catch (err) {
        console.error("Lookup failed:", err);
        sendResponse(null);
      }
    });
    return true; // Keep message channel open for asynchronous reply
  }
  
  if (message.action === "getDecomposition") {
    (async () => {
      try {
        let char = message.character;
        const t2s = await loadT2S();
        if (t2s[char]) char = t2s[char];

        if (!decompDbInitPromise && !decompDbReady) {
          initDecompDB().catch(() => {});
        }

        // The decomposition dataset is small (about 2 MB). Serving it from
        // memory makes the panel available immediately after the JSON loads,
        // even while its IndexedDB stores are still being seeded.
        try {
          const memory = await ensureDecompData();
          sendResponse({
            ok: true,
            details: memory.detailsMap.get(char) || null,
            radical: memory.radicalsMap.get(char) || null,
            special: memory.specialsMap.get(char) || null,
          });
          return;
        } catch (memoryErr) {
          console.warn("Decomposition memory fallback failed, trying IndexedDB:", memoryErr);
        }

        await initDecompDB();
        const db = await openDB();
        const tx = db.transaction([STORE_DECOMPOSITION, STORE_RADICALS, STORE_SPECIALS], "readonly");
        const getReq = (storeName, key) => new Promise((res) => {
          const req = tx.objectStore(storeName).get(key);
          req.onsuccess = () => res(req.result);
          req.onerror = () => res(null);
        });

        const [details, radical, special] = await Promise.all([
          getReq(STORE_DECOMPOSITION, char),
          getReq(STORE_RADICALS, char),
          getReq(STORE_SPECIALS, char)
        ]);
        sendResponse({ ok: true, details, radical, special });
      } catch (err) {
        console.error("Failed to get decomposition:", err);
        sendResponse({ ok: false, error: err && err.message ? err.message : String(err) });
      }
    })();
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

const FF_TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const FF_GEC_VERSION = "2-143.0.3650.75";
const FF_EDGE_COPYRIGHT = "Copyright (C) Microsoft Corporation. All rights reserved.";
const FF_SWAP_FIRST_WORD = { swappedWord: 0xEF0569FB, swappedSum: 0x76F50F34, swappedProduct: 0xC3EFEA97 };
const FF_SWAP_SECOND_WORD = { swappedWord: 0xC31713DB, swappedSum: 0x1881CE3C, swappedProduct: 0x35BD1EC9 };
const FF_MIX_FIRST_WORD = [0xCF98B111, 0x87085B9F, 0x12CEB96D, 0x257E1D83];
const FF_MIX_SECOND_WORD = [0xA27416F5, 0xD38396FF, 0x7C932B89, 0xBFA49F69];

function ff_swapHalves(value) {
  return ((value << 16) | (value >>> 16)) >>> 0;
}

function ff_swapTerm(word, key, multipliers) {
  const sum = Math.imul(word, key) + Math.imul(ff_swapHalves(word), multipliers.swappedWord);
  const product = Math.imul(ff_swapHalves(sum), multipliers.swappedSum) >>> 0;
  return (Math.imul(ff_swapHalves(product), multipliers.swappedProduct) + product) >>> 0;
}

function ff_swapAndMultiply(value, multipliers) {
  for (const multiplier of multipliers) {
    value = Math.imul(ff_swapHalves(value), multiplier) >>> 0;
  }
  return value;
}

function ff_cs64(message, digest) {
  const digestView = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const firstKey = (digestView.getUint32(0, true) | 1) >>> 0;
  const secondKey = (digestView.getUint32(4, true) | 1) >>> 0;
  const padded = new Uint8Array(Math.ceil(message.length / 8) * 8);
  padded.set(message);
  const words = new DataView(padded.buffer);

  let swapSum = 0;
  let lastSwap = 0;
  let mix = 0;
  let mixSum = 0;

  for (let offset = 0; offset < padded.length; offset += 8) {
    const firstWord = words.getUint32(offset, true);
    const secondWord = words.getUint32(offset + 4, true);

    const firstSwap = ff_swapTerm(firstWord, firstKey, FF_SWAP_FIRST_WORD);
    lastSwap = ff_swapTerm(secondWord, secondKey, FF_SWAP_SECOND_WORD);
    swapSum = (swapSum + firstSwap + lastSwap) >>> 0;

    mix = ff_swapAndMultiply(Math.imul(mix + firstWord, firstKey), FF_MIX_FIRST_WORD);
    mixSum = (mixSum + mix) >>> 0;
    mix = ff_swapAndMultiply(Math.imul(mix + secondWord, secondKey), FF_MIX_SECOND_WORD);
    mixSum = (mixSum + mix) >>> 0;
  }

  const checksum = new Uint8Array(8);
  const checksumView = new DataView(checksum.buffer);
  checksumView.setUint32(0, lastSwap ^ mix, true);
  checksumView.setUint32(4, swapSum ^ mixSum, true);
  return checksum;
}

function ff_toUpperHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function ff_generateSecMsGec() {
  const unixTime = BigInt(Math.floor(Date.now() / 1000));
  const ticks = (unixTime + 11644473600n) * 10000000n;
  const roundedTicks = ticks - (ticks % 3000000000n);
  const message = new TextEncoder().encode(`${FF_EDGE_COPYRIGHT}${roundedTicks}${FF_TRUSTED_CLIENT_TOKEN}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", message));
  return `${ff_toUpperHex(ff_cs64(message, digest))}-${ff_toUpperHex(digest)}`;
}

function ff_generateHexId() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function ff_connectAndSpeak(text) {
  const gec = await ff_generateSecMsGec();
  const connId = ff_generateHexId();
  
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${FF_TRUSTED_CLIENT_TOKEN}&ConnectionId=${connId}&Sec-MS-GEC=${gec}&Sec-MS-GEC-Version=${FF_GEC_VERSION}`;
  
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
