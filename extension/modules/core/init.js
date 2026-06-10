// Entry point and event orchestration for Chinese Hover Dictionary

// Initialize content script
function init() {
  // Inject FandolKaiLocal font dynamically to support all browsers (Chrome/Firefox)
  const fontUrl = chrome.runtime.getURL("fonts/FandolKai-Regular.otf");
  const fontStyle = document.createElement("style");
  fontStyle.textContent = `
    @font-face {
      font-family: "FandolKaiLocal";
      src: url("${fontUrl}") format("opentype");
    }
  `;
  document.head.appendChild(fontStyle);

  // Read initial active state and custom key bindings
  chrome.storage.local.get(
    [
      "active",
      "keyUp",
      "keyDown",
      "keyLeft",
      "keyRight",
      "keyCopy",
      "keySpeak1",
      "keySpeak2",
      "keySpeak3",
      "keySpeak4",
      "keyToggleActive",
      "fontFamily",
      "fontSize",
      "theme",
      "toggleActiveModifier",
      "enableNudge",
      "enableQuickActions",
      "strokeSpeed",
    ],
    (data) => {
      active = data.active !== false; // Default is true (ON)

      // Load custom key configs if they exist in storage
      if (data.keyUp) keys.up = data.keyUp;
      if (data.keyDown) keys.down = data.keyDown;
      if (data.keyLeft) keys.left = data.keyLeft;
      if (data.keyRight) keys.right = data.keyRight;
      if (data.keyCopy) keys.copy = data.keyCopy;
      if (data.keySpeak1) keys.speak1 = data.keySpeak1;
      if (data.keySpeak2) keys.speak2 = data.keySpeak2;
      if (data.keySpeak3) keys.speak3 = data.keySpeak3;
      if (data.keySpeak4) keys.speak4 = data.keySpeak4;
      if (data.keyToggleActive) keys.toggleActive = data.keyToggleActive;
      if (data.fontFamily) fontFamily = data.fontFamily;
      if (data.fontSize) fontSize = data.fontSize;
      if (data.theme) theme = data.theme;
      if (data.toggleActiveModifier)
        toggleActiveModifier = data.toggleActiveModifier;
      if (data.strokeSpeed) strokeSpeed = data.strokeSpeed;

      if (data.enableNudge !== undefined) enableNudge = data.enableNudge;
      if (data.enableQuickActions !== undefined)
        enableQuickActions = data.enableQuickActions;

      // Update guide panel content if it is rendered
      renderGuidePanelContent();
    },
  );

  // Listen to storage changes (toggle extension and update key configurations)
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.active) {
      active = !!changes.active.newValue;
      if (active) {
        showGuidePanel(); // Show guide panel on the left when turned ON
      } else {
        hidePopup();
        hideGuidePanel();
      }
    }

    // Dynamically sync updated shortcut keys from options page
    let keyChanged = false;
    if (changes.keyUp) {
      keys.up = changes.keyUp.newValue;
      keyChanged = true;
    }
    if (changes.keyDown) {
      keys.down = changes.keyDown.newValue;
      keyChanged = true;
    }
    if (changes.keyLeft) {
      keys.left = changes.keyLeft.newValue;
      keyChanged = true;
    }
    if (changes.keyRight) {
      keys.right = changes.keyRight.newValue;
      keyChanged = true;
    }
    if (changes.keyCopy) {
      keys.copy = changes.keyCopy.newValue;
      keyChanged = true;
    }
    if (changes.keySpeak1) { keys.speak1 = changes.keySpeak1.newValue; keyChanged = true; }
    if (changes.keySpeak2) { keys.speak2 = changes.keySpeak2.newValue; keyChanged = true; }
    if (changes.keySpeak3) { keys.speak3 = changes.keySpeak3.newValue; keyChanged = true; }
    if (changes.keySpeak4) { keys.speak4 = changes.keySpeak4.newValue; keyChanged = true; }
    if (changes.keyToggleActive) {
      keys.toggleActive = changes.keyToggleActive.newValue;
      keyChanged = true;
    }
    if (changes.toggleActiveModifier) {
      toggleActiveModifier = changes.toggleActiveModifier.newValue;
      keyChanged = true;
    }
    if (changes.strokeSpeed) {
      strokeSpeed = changes.strokeSpeed.newValue;
    }
    if (changes.enableNudge) {
      enableNudge = changes.enableNudge.newValue !== false;
      keyChanged = true;
    }
    if (changes.enableQuickActions) {
      enableQuickActions = changes.enableQuickActions.newValue !== false;
      keyChanged = true;
    }

    // Sync font and theme preferences and update active popup styling dynamically
    let appearanceChanged = false;
    if (changes.fontFamily) {
      fontFamily = changes.fontFamily.newValue;
      appearanceChanged = true;
    }
    if (changes.fontSize) {
      fontSize = changes.fontSize.newValue;
      appearanceChanged = true;
    }
    if (changes.theme) {
      theme = changes.theme.newValue;
      appearanceChanged = true;
    }
    if (appearanceChanged) {
      updatePopupClasses();
    }
    if (keyChanged) {
      renderGuidePanelContent();
    }
  });

  // Listen for messages from background script as fallback
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "toggle") {
      active = !!message.active;
      if (active) {
        showGuidePanel();
      } else {
        hidePopup();
        hideGuidePanel();
      }
    }
  });
}

// Start execution
init();
