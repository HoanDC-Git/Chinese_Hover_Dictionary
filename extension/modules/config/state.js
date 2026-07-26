window.VZ = window.VZ || {};

window.VZ.config = (function() {
  let settings = {
    active: false,
    fontFamily: "system",
    theme: "light",
    fontSize: "medium",
    toggleActiveModifier: "alt",
    strokeModifier: "ctrl",
    enableNudge: true,
    enableQuickActions: true,
    enableSelectionTranslate: true,
    strokeSpeed: "0.5",
    showDecompStroke: true,
    keys: {
      up: "w",
      down: "s",
      left: "a",
      right: "d",
      copy: "c",
      speak1: "1",
      speak2: "2",
      speak3: "3",
      speak4: "4",
      toggleActive: "x"
    }
  };

  const listeners = [];

  function init(callback) {
    chrome.storage.local.get([
      "active", "keyUp", "keyDown", "keyLeft", "keyRight", "keyCopy", 
      "keySpeak1", "keySpeak2", "keySpeak3", "keySpeak4", "keyToggleActive",
      "fontFamily", "fontSize", "theme", "toggleActiveModifier", "strokeModifier",
      "enableNudge", "enableQuickActions", "enableSelectionTranslate", "strokeSpeed", "showDecompStroke"
    ], (data) => {
      settings.active = data.active !== false; // Default true
      
      if (data.keyUp) settings.keys.up = data.keyUp;
      if (data.keyDown) settings.keys.down = data.keyDown;
      if (data.keyLeft) settings.keys.left = data.keyLeft;
      if (data.keyRight) settings.keys.right = data.keyRight;
      if (data.keyCopy) settings.keys.copy = data.keyCopy;
      if (data.keySpeak1) settings.keys.speak1 = data.keySpeak1;
      if (data.keySpeak2) settings.keys.speak2 = data.keySpeak2;
      if (data.keySpeak3) settings.keys.speak3 = data.keySpeak3;
      if (data.keySpeak4) settings.keys.speak4 = data.keySpeak4;
      if (data.keyToggleActive) settings.keys.toggleActive = data.keyToggleActive;
      
      if (data.fontFamily) settings.fontFamily = data.fontFamily;
      if (data.fontSize) settings.fontSize = data.fontSize;
      if (data.theme) settings.theme = data.theme;
      if (data.toggleActiveModifier) settings.toggleActiveModifier = data.toggleActiveModifier;
      if (data.strokeModifier) settings.strokeModifier = data.strokeModifier;
      if (data.strokeSpeed) settings.strokeSpeed = data.strokeSpeed;
      if (data.showDecompStroke !== undefined) settings.showDecompStroke = data.showDecompStroke;
      if (data.enableNudge !== undefined) settings.enableNudge = data.enableNudge;
      if (data.enableQuickActions !== undefined) settings.enableQuickActions = data.enableQuickActions;
      if (data.enableSelectionTranslate !== undefined) settings.enableSelectionTranslate = data.enableSelectionTranslate;
      
      if (typeof callback === 'function') callback();
    });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
      let changedKeys = [];

      if (changes.active) { settings.active = !!changes.active.newValue; changedKeys.push('active'); }
      
      if (changes.keyUp) { settings.keys.up = changes.keyUp.newValue; changedKeys.push('keys'); }
      if (changes.keyDown) { settings.keys.down = changes.keyDown.newValue; changedKeys.push('keys'); }
      if (changes.keyLeft) { settings.keys.left = changes.keyLeft.newValue; changedKeys.push('keys'); }
      if (changes.keyRight) { settings.keys.right = changes.keyRight.newValue; changedKeys.push('keys'); }
      if (changes.keyCopy) { settings.keys.copy = changes.keyCopy.newValue; changedKeys.push('keys'); }
      if (changes.keySpeak1) { settings.keys.speak1 = changes.keySpeak1.newValue; changedKeys.push('keys'); }
      if (changes.keySpeak2) { settings.keys.speak2 = changes.keySpeak2.newValue; changedKeys.push('keys'); }
      if (changes.keySpeak3) { settings.keys.speak3 = changes.keySpeak3.newValue; changedKeys.push('keys'); }
      if (changes.keySpeak4) { settings.keys.speak4 = changes.keySpeak4.newValue; changedKeys.push('keys'); }
      if (changes.keyToggleActive) { settings.keys.toggleActive = changes.keyToggleActive.newValue; changedKeys.push('keys'); }
      
      if (changes.fontFamily) { settings.fontFamily = changes.fontFamily.newValue; changedKeys.push('appearance'); }
      if (changes.fontSize) { settings.fontSize = changes.fontSize.newValue; changedKeys.push('appearance'); }
      if (changes.theme) { settings.theme = changes.theme.newValue; changedKeys.push('appearance'); }
      if (changes.showDecompStroke) { settings.showDecompStroke = changes.showDecompStroke.newValue; changedKeys.push('appearance'); }
      
      if (changes.toggleActiveModifier) { settings.toggleActiveModifier = changes.toggleActiveModifier.newValue; changedKeys.push('modifiers'); }
      if (changes.strokeModifier) { settings.strokeModifier = changes.strokeModifier.newValue; changedKeys.push('modifiers'); }
      if (changes.strokeSpeed) { settings.strokeSpeed = changes.strokeSpeed.newValue; changedKeys.push('stroke'); }
      if (changes.enableNudge) { settings.enableNudge = changes.enableNudge.newValue !== false; changedKeys.push('options'); }
      if (changes.enableQuickActions) { settings.enableQuickActions = changes.enableQuickActions.newValue !== false; changedKeys.push('options'); }
      if (changes.enableSelectionTranslate) { settings.enableSelectionTranslate = changes.enableSelectionTranslate.newValue; changedKeys.push('options'); }

      if (changedKeys.length > 0) {
        listeners.forEach(cb => cb(settings, changedKeys));
      }
    });

    // Listen for fallback messages
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "toggle") {
        settings.active = !!message.active;
        listeners.forEach(cb => cb(settings, ['active']));
      }
    });
  }

  function get() {
    return settings;
  }

  function subscribe(callback) {
    listeners.push(callback);
  }

  return { init, get, subscribe };
})();
