// Load configurations from storage
async function loadSettings() {
  const allKeys = [
    "theme",
    "toggleActiveModifier",
    "enableNudge",
    "enableQuickActions",
    "enableSelectionTranslate",
    ...keys,
    ...dropdowns,
  ];
  const data = await chrome.storage.local.get(allKeys);

  // Set enableNudge switch state
  const nudgeCheckbox = document.getElementById("enableNudge");
  if (nudgeCheckbox) {
    nudgeCheckbox.checked = data["enableNudge"] !== false;
  }

  // Set enableQuickActions switch state
  const quickCheckbox = document.getElementById("enableQuickActions");
  if (quickCheckbox) {
    quickCheckbox.checked = data["enableQuickActions"] !== false;
  }

  // Set enableSelectionTranslate switch state
  const selectionCheckbox = document.getElementById("enableSelectionTranslate");
  if (selectionCheckbox) {
    selectionCheckbox.checked = data["enableSelectionTranslate"] !== false;
  }

  // Set toggleActiveModifier input value
  const toggleActiveModInput = document.getElementById("toggleActiveModifier");
  if (toggleActiveModInput) {
    const modValue =
      data["toggleActiveModifier"] || DEFAULT_SETTINGS.toggleActiveModifier;
    toggleActiveModInput.value = modValue === "alt" ? (isMac ? "OPTION ⌥ +" : "ALT +") : "...";
  }

  // Set regular keys
  keys.forEach((k) => {
    const input = document.getElementById(k);
    if (input) {
      const value = data[k] || DEFAULT_SETTINGS[k];
      input.value = formatKeyDisplay(value);
    }
  });

  // Set dropdowns
  dropdowns.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      if (data[id]) {
        el.value = data[id];
      } else if (DEFAULT_SETTINGS[id]) {
        el.value = DEFAULT_SETTINGS[id];
      }
    }
  });

  // Handle Theme Mockup Selection
  const themeValue = data.theme || DEFAULT_SETTINGS.theme;
  const activeThemeCard = document.getElementById(`theme-${themeValue}`);
  if (activeThemeCard) {
    document
      .querySelectorAll(".theme-card")
      .forEach((c) => c.classList.remove("selected"));
    activeThemeCard.classList.add("selected");
  }

  // Call update once to sync preview with loaded font/size
  if (typeof updateMockups === "function") updateMockups();

  // Update UI row states based on switch positions
  updateUIRowsState();
}
// Initialize options page
document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  bindEvents();
});

