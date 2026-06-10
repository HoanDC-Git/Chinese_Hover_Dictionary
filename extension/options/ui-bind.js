// Show status toast notification
let toastTimer = null;
function showToast() {
  const toast = document.getElementById("toast");
  if (toast) {
    toast.classList.add("visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("visible");
    }, 1500);
  }
}

// Format the modifier key display text
function formatModifierDisplay(val) {
  if (isMac) {
    const macMap = {
      shift: "SHIFT ⇧",
      alt: "OPTION ⌥",
      control: "CONTROL ⌃",
      meta: "CMD ⌘",
    };
    return macMap[val] || val.toUpperCase();
  }
  const map = {
    shift: "SHIFT",
    alt: "ALT",
    control: "CTRL",
    meta: "WIN",
  };
  return map[val] || val.toUpperCase();
}
// Function to update disabled/dimmed states of key rows
function updateUIRowsState() {
  const nudgeEnabled =
    document.getElementById("enableNudge")?.checked !== false;
  const quickEnabled =
    document.getElementById("enableQuickActions")?.checked !== false;

  // Nudge keys: keyUp, keyDown, keyLeft, keyRight
  ["keyUp", "keyDown", "keyLeft", "keyRight"].forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.disabled = !nudgeEnabled;
      const row = input.closest(".key-row");
      if (row) {
        if (nudgeEnabled) {
          row.classList.remove("disabled");
        } else {
          row.classList.add("disabled");
        }
      }
    }
  });

  // Quick action keys: keyCopy, keySpeak1..4
  ["keyCopy", "keySpeak1", "keySpeak2", "keySpeak3", "keySpeak4"].forEach(
    (id) => {
      const input = document.getElementById(id);
      if (input) {
        input.disabled = !quickEnabled;
        const row = input.closest(".key-row");
        if (row) {
          if (quickEnabled) {
            row.classList.remove("disabled");
          } else {
            row.classList.add("disabled");
          }
        }
      }
    },
  );
}

// Format the key string to display neatly in uppercase
function formatKeyDisplay(keyStr) {
  if (keyStr.startsWith("arrow")) {
    return keyStr.replace("arrow", "↓ ").toUpperCase();
  }
  return keyStr.toUpperCase();
}

// Bind events on elements
function bindEvents() {
  // Bind Enable Nudge switch change
  const nudgeCheckbox = document.getElementById("enableNudge");
  if (nudgeCheckbox) {
    nudgeCheckbox.addEventListener("change", async () => {
      await chrome.storage.local.set({ enableNudge: nudgeCheckbox.checked });
      updateUIRowsState();
      showToast();
    });
  }

  // Bind Enable Quick Actions switch change
  const quickCheckbox = document.getElementById("enableQuickActions");
  if (quickCheckbox) {
    quickCheckbox.addEventListener("change", async () => {
      await chrome.storage.local.set({
        enableQuickActions: quickCheckbox.checked,
      });
      updateUIRowsState();
      showToast();
    });
  }

  // Bind key capture events on regular key inputs
  keys.forEach((k) => {
    const input = document.getElementById(k);
    if (!input) return;

    input.addEventListener("keydown", async (e) => {
      e.preventDefault();
      const key = e.key.toLowerCase();

      // Ignore alone modifier key presses
      if (
        [
          "alt",
          "control",
          "shift",
          "meta",
          "capslock",
          "tab",
          "escape",
          "enter",
        ].includes(key)
      ) {
        return;
      }

      // Filter valid alphanumeric keys or arrow keys
      const isValidKey =
        /^[a-z0-9]$/.test(key) ||
        ["arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key);

      if (isValidKey) {
        const update = {};
        update[k] = key;
        await chrome.storage.local.set(update);

        input.value = formatKeyDisplay(key);
        input.blur();
        showToast();
      }
    });

    input.addEventListener("focus", () => {
      input.value = "...";
    });

    input.addEventListener("blur", async () => {
      const data = await chrome.storage.local.get(k);
      const value = data[k] || DEFAULT_SETTINGS[k];
      input.value = formatKeyDisplay(value);
    });
  });

  // Bind toggleActiveModifier input events
  const toggleActiveModInput = document.getElementById("toggleActiveModifier");
  if (toggleActiveModInput) {
    toggleActiveModInput.addEventListener("focus", () => {
      toggleActiveModInput.value = "...";
    });

    toggleActiveModInput.addEventListener("keydown", async (e) => {
      e.preventDefault();
      const key = e.key;
      // Capture Alt key
      if (key === "Alt") {
        await chrome.storage.local.set({ toggleActiveModifier: "alt" });
        toggleActiveModInput.value = isMac ? "OPTION ⌥ +" : "ALT +";
        toggleActiveModInput.blur();
        showToast();
      }
    });

    toggleActiveModInput.addEventListener("blur", async () => {
      // If still "...", user blurred without pressing Alt, so treat it as single key mode
      if (toggleActiveModInput.value === "...") {
        await chrome.storage.local.set({ toggleActiveModifier: "none" });
        toggleActiveModInput.value = "...";
        showToast();
      } else {
        const data = await chrome.storage.local.get("toggleActiveModifier");
        const value =
          data["toggleActiveModifier"] || DEFAULT_SETTINGS.toggleActiveModifier;
        toggleActiveModInput.value = value === "alt" ? (isMac ? "OPTION ⌥ +" : "ALT +") : "...";
      }
    });
  }

  // Bind change events to select dropdowns
  dropdowns.forEach((d) => {
    const select = document.getElementById(d);
    if (select) {
      select.addEventListener("change", async () => {
        const update = {};
        update[d] = select.value;
        await chrome.storage.local.set(update);
        showToast();
      });
    }
  });

  // Bind Restore Defaults button event
  const btnRestore = document.getElementById("btnRestore");
  if (btnRestore) {
    btnRestore.addEventListener("click", async () => {
      if (
        confirm(
          "Bạn có chắc chắn muốn khôi phục tất cả cài đặt về mặc định không?",
        )
      ) {
        await chrome.storage.local.clear();
        await chrome.storage.local.set(DEFAULT_SETTINGS);
        await loadSettings();
        showToast();
      }
    });
  }

  // --- Feedback Form Handling ---
  const btnSubmitFeedback = document.getElementById("btnSubmitFeedback");
  const feedbackText = document.getElementById("feedbackText");
  const feedbackStatus = document.getElementById("feedbackStatus");

  if (btnSubmitFeedback && feedbackText) {
    btnSubmitFeedback.addEventListener("click", async () => {
      const text = feedbackText.value.trim();
      if (!text) {
        feedbackText.focus();
        return;
      }

      btnSubmitFeedback.disabled = true;
      btnSubmitFeedback.textContent = "Đang gửi...";
      feedbackStatus.textContent = "";

      try {
        const FORMSPREE_URL = "https://formspree.io/f/mjgdbdkj";
        const response = await fetch(FORMSPREE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            source: "Chinese Hover Dictionary",
          }),
        });
        if (!response.ok) throw new Error("Gửi thất bại");

        feedbackStatus.textContent = "Gửi thành công! Cảm ơn bạn.";
        feedbackStatus.className = "feedback-status status-success";
        feedbackText.value = "";
      } catch (error) {
        feedbackStatus.textContent = "Gặp lỗi khi gửi, hãy thử lại sau.";
        feedbackStatus.className = "feedback-status status-error";
        } finally {
          btnSubmitFeedback.disabled = false;
          btnSubmitFeedback.textContent = "Gửi phản hồi";
          setTimeout(() => {
            feedbackStatus.textContent = "";
          }, 5000);
        }
      });
    }

    // --- Theme Picker and Mockup Live Updates ---
  const fontSelect = document.getElementById("fontFamily");
  const sizeSelect = document.getElementById("fontSize");

  function updateMockups() {
    if (!fontSelect || !sizeSelect) return;
    const font = fontSelect.value;
    const size = sizeSelect.value;
    document.querySelectorAll(".theme-mockup").forEach((m) => {
      m.className = `theme-mockup ${m.classList.contains("light-mockup") ? "light-mockup" : "dark-mockup"} size-${size}`;
      m.querySelectorAll(".mockup-header").forEach((header) => {
        header.className = `mockup-header ${font}`;
      });
    });
  }

  if (fontSelect) fontSelect.addEventListener("change", updateMockups);
  if (sizeSelect) sizeSelect.addEventListener("change", updateMockups);

  document.querySelectorAll(".theme-card").forEach((card) => {
    card.addEventListener("click", () => {
      document
        .querySelectorAll(".theme-card")
        .forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      const selectedTheme = card.getAttribute("data-theme");
      chrome.storage.local.set({ theme: selectedTheme }, showToast);
    });
  });

  updateMockups();
}
