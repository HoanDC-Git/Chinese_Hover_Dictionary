// Main content script entry point
window.VZ = window.VZ || {};

(function() {
  const getCfg = () => window.VZ.config.get();
  
  let mouseX = 0;
  let mouseY = 0;
  let targetX = 0;
  let targetY = 0;
  let lastEvent = null;
  let throttleTimer = null;

  
  // Inject FandolKaiLocal font dynamically
  const fontUrl = chrome.runtime.getURL("fonts/FandolKai-Regular.otf");
  const fontStyle = document.createElement("style");
  fontStyle.textContent = `
    @font-face {
      font-family: "FandolKaiLocal";
      src: url("${fontUrl}") format("opentype");
    }
  `;
  document.head.appendChild(fontStyle);

// Core mouse and keyboard event listeners

document.addEventListener("mousemove", (e) => {
  // If watchMouseForGuide is true, it means the mouse entered the webpage after click
  if (VZ.ui.guide.watchMouseForGuide) {
    VZ.ui.guide.watchMouseForGuide = false;
    // Start a 1-second timer to hide guide after mouse moves in the webpage, allowing ample reading time
    if (VZ.ui.guide.guideHideTimer) clearTimeout(VZ.ui.guide.guideHideTimer);
    VZ.ui.guide.guideHideTimer = setTimeout(VZ.ui.guide.hide, 1000);
  }

  const isPopupVisible =
    VZ.ui.hoverPopup.popupElement && VZ.ui.hoverPopup.popupElement.classList.contains("zh-visible");
  if (!getCfg().active && !isPopupVisible) return;

  lastEvent = e; // Save mouse event to access composedPath() later
  mouseX = e.clientX;
  mouseY = e.clientY;
  targetX = e.pageX;
  targetY = e.pageY;

  if (!throttleTimer) {
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      onMouseMoveThrottled();
    }, 200); // 200ms throttle for fast response and low CPU overhead
  }
});

// Bind keyboard shortcuts (WASD, C, Q, E/Z) based on custom configs
window.addEventListener("keydown", (e) => {
  if (isTypingInInput()) {
    return;
  }

  const key = e.key.toLowerCase();

  // 0. Toggle Active Status Shortcut (Works even when getCfg().active is false, and popup is hidden)
  let triggerToggleActive = false;
  if (getCfg().toggleActiveModifier === "alt") {
    triggerToggleActive = e.altKey && key === getCfg().keys.toggleActive;
  } else {
    triggerToggleActive =
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey &&
      key === getCfg().keys.toggleActive;
  }

  if (triggerToggleActive) {
    e.preventDefault();
    chrome.storage.local.set({ active: !getCfg().active });
    return;
  }

  if (
    !getCfg().active &&
    !(VZ.ui.hoverPopup.popupElement && VZ.ui.hoverPopup.popupElement.classList.contains("zh-visible"))
  )
    return;

  // Check if popup is currently visible
  if (VZ.ui.hoverPopup.popupElement && VZ.ui.hoverPopup.popupElement.classList.contains("zh-visible")) {
    // Ignore key events with modifiers (to avoid overriding standard browser shortcuts like Ctrl+C, Ctrl+R, etc.)
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
      return;
    }

    // 2. Custom Nudging Keys
    if (
      getCfg().enableNudge &&
      [getCfg().keys.up, getCfg().keys.left, getCfg().keys.down, getCfg().keys.right].includes(key)
    ) {
      e.preventDefault();
      const currentLeft = parseFloat(VZ.ui.hoverPopup.popupElement.style.left) || 0;
      const currentTop = parseFloat(VZ.ui.hoverPopup.popupElement.style.top) || 0;
      const offset = 15; // Nudge displacement in pixels

      if (key === getCfg().keys.up) {
        VZ.ui.hoverPopup.popupElement.style.top = `${currentTop - offset}px`;
      } else if (key === getCfg().keys.down) {
        VZ.ui.hoverPopup.popupElement.style.top = `${currentTop + offset}px`;
      } else if (key === getCfg().keys.left) {
        VZ.ui.hoverPopup.popupElement.style.left = `${currentLeft - offset}px`;
      } else if (key === getCfg().keys.right) {
        VZ.ui.hoverPopup.popupElement.style.left = `${currentLeft + offset}px`;
      }
    }
    // 3. Custom Copy Key
    else if (getCfg().enableQuickActions && key === getCfg().keys.copy) {
      e.preventDefault();
      if (VZ.ui.hoverPopup.currentLongestMatch) {
        navigator.clipboard
          .writeText(VZ.ui.hoverPopup.currentLongestMatch)
          .then(() => {
            VZ.ui.hoverPopup.showToast(`Đã sao chép: "${VZ.ui.hoverPopup.currentLongestMatch}"`);
          })
          .catch((err) => {
            console.error("Failed to copy text:", err);
          });
      }
    }
    // 4. Speak 1..4
    else if (getCfg().enableQuickActions && (key === getCfg().keys.speak1 || key === getCfg().keys.speak2 || key === getCfg().keys.speak3 || key === getCfg().keys.speak4)) {
      e.preventDefault();
      let index = 0;
      if (key === getCfg().keys.speak2) index = 1;
      else if (key === getCfg().keys.speak3) index = 2;
      else if (key === getCfg().keys.speak4) index = 3;

      const speakers = VZ.ui.hoverPopup.popupElement.querySelectorAll(".zh-hover-speaker");
      if (speakers && speakers[index]) {
        const wordToSpeak = speakers[index].getAttribute("data-word");
        if (wordToSpeak) VZ.services.tts.speakWord(wordToSpeak, speakers[index]);
      }
      return;
    }
  }
});

// Handle throttled mouse move events
function onMouseMoveThrottled() {
  if (!getCfg().active) return;
  
  const selection = window.getSelection();
  const isTextSelected = selection && selection.toString().trim().length > 0;
  const isDragging = lastEvent && lastEvent.buttons > 0;
  const isSentenceModalOpen = document.querySelector(".zh-report-overlay.zh-visible") !== null;
  const isDecompPanelOpen = document.querySelector(".zh-decomposition-panel") !== null;
  
  // Hover, popup của hover và highlight sẽ không hoạt động khi đang bôi đen (kéo chuột), có text được chọn, cửa sổ modal đang mở, hoặc panel chiết tự đang mở
  if (isDragging || isTextSelected || isSentenceModalOpen || isDecompPanelOpen) {
    VZ.ui.hoverPopup.startHideTimer(mouseX, mouseY);
    return;
  }

  // Check if mouse is hovering over the popup itself
  if (
    VZ.ui.hoverPopup.popupElement &&
    VZ.ui.hoverPopup.popupElement.contains(document.elementFromPoint(mouseX, mouseY))
  ) {
    return;
  }


  // Check if mouse is hovering over input, textarea, or contenteditable fields
  const elementUnderMouse = getElementUnderMousePiercingShadow(mouseX, mouseY);
  if (elementUnderMouse) {
    if (elementUnderMouse.closest(".zh-sentence-popup") || elementUnderMouse.closest(".zh-report-overlay")) {
      VZ.ui.hoverPopup.startHideTimer(mouseX, mouseY);
      return;
    }
    
    const tagName = elementUnderMouse.tagName;
    if (
      tagName === "INPUT" ||
      tagName === "TEXTAREA" ||
      elementUnderMouse.isContentEditable ||
      elementUnderMouse.closest("[contenteditable]")
    ) {
      VZ.ui.hoverPopup.startHideTimer(mouseX, mouseY);
      return;
    }
  }

  // Check if mouse is hovering over the exact character that was hovered
  let isOverHoveredChar = false;
  for (const rect of VZ.ui.hoverPopup.hoveredCharRects) {
    if (
      mouseX >= rect.left &&
      mouseX <= rect.right &&
      mouseY >= rect.top &&
      mouseY <= rect.bottom
    ) {
      isOverHoveredChar = true;
      break;
    }
  }

  if (isOverHoveredChar) {
    VZ.ui.hoverPopup.clearHideTimer();
    return; // Keep popup and highlights exactly as is
  }

  if (!getCfg().active) {
    if (VZ.ui.hoverPopup.popupElement && VZ.ui.hoverPopup.popupElement.classList.contains("zh-visible")) {
      VZ.ui.hoverPopup.startHideTimer(mouseX, mouseY);
    }
    return;
  }

  // Get character range under mouse coordinates (piercing Shadow DOM)
  let range = null;
  const shadowRoots =
    lastEvent && lastEvent.composedPath
      ? lastEvent.composedPath().filter((node) => node instanceof ShadowRoot)
      : [];

  if (document.caretPositionFromPoint) {
    try {
      const pos = document.caretPositionFromPoint(mouseX, mouseY, {
        shadowRoots,
      });
      if (pos) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.setEnd(pos.offsetNode, pos.offset);
      }
    } catch (err) {
      console.debug(
        "caretPositionFromPoint failed, trying legacy fallback:",
        err,
      );
    }
  }

  // Fallback to legacy caretRangeFromPoint if standard API is unavailable or failed
  if (!range && document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(mouseX, mouseY);
  }

  if (range && range.startContainer.nodeType === Node.TEXT_NODE) {
    const textNode = range.startContainer;
    const offset = range.startOffset;

    // Check if the cursor is actually hovering on or very close to this character
    const testRange = document.createRange();
    let isPhysicallyClose = false;
    try {
      const textLen = textNode.textContent.length;
      const safeOffset = Math.min(offset, textLen - 1);
      if (safeOffset >= 0) {
        testRange.setStart(textNode, safeOffset);
        testRange.setEnd(textNode, safeOffset + 1);
        const rects = testRange.getClientRects();
        for (const rect of rects) {
          // Check vertical alignment (on the same line) and horizontal proximity (within 50px of character)
          if (
            mouseY >= rect.top - 5 &&
            mouseY <= rect.bottom + 5 &&
            mouseX >= rect.left - 50 &&
            mouseX <= rect.right + 50
          ) {
            isPhysicallyClose = true;
            break;
          }
        }
      }
    } catch (err) {
      isPhysicallyClose = false;
    }

    if (!isPhysicallyClose) {
      VZ.ui.hoverPopup.startHideTimer(mouseX, mouseY);
      return;
    }

    // Get up to 5 characters from the cursor position to the right (handling node crossing and line breaks)
    const { substring, charMap } = VZ.utils.dom.getChineseTextAndMap(textNode, offset);

    // Check if the first character is a Chinese character
    if (substring && /^[\u4e00-\u9fa5]/.test(substring)) {
      // Query the background service worker for dictionary lookup
      chrome.runtime.sendMessage(
        { action: "lookup", text: substring },
        (response) => {
          // Double check getCfg().active hasn't changed since the lookup message was sent
          if (!getCfg().active) {
            VZ.ui.hoverPopup.startHideTimer(mouseX, mouseY);
            return;
          }

          if (
            chrome.runtime.lastError ||
            !response ||
            !response.matches ||
            response.matches.length === 0
          ) {
            VZ.ui.hoverPopup.startHideTimer(mouseX, mouseY);
            return;
          }

          // Clear hide timer since we found a valid Chinese character
          VZ.ui.hoverPopup.clearHideTimer();

          const matches = response.matches;
          const definitions = response.definitions;
          const longestMatch = matches[0];

          // NEW OPTIMIZATION: Prevent flickering by not re-rendering if it's the exact same result
          const isPopupVisible = VZ.ui.hoverPopup.popupElement && VZ.ui.hoverPopup.popupElement.classList.contains("zh-visible");
          const originalMatch = response.originalMatches ? (response.originalMatches[response.matches[0]] || response.matches[0]) : response.matches[0];
          
          if (VZ.ui.hoverPopup.currentLongestMatch !== originalMatch || !isPopupVisible) {
            const { matches, definitions, originalMatches } = response;
            VZ.ui.hoverPopup.currentLongestMatch = originalMatch; // Save for shortcuts
            
            // Render and position popup only if content changed or popup was hidden
            VZ.ui.hoverPopup.createUIElements();
            VZ.ui.hoverPopup.renderPopup(matches, definitions, originalMatches);
          }
          
          VZ.ui.hoverPopup.highlightTextRange(charMap, originalMatch.length);
          const charRange = document.createRange();
          try {
            charRange.setStart(textNode, offset);
            charRange.setEnd(textNode, offset + 1);
            VZ.ui.hoverPopup.hoveredCharRects = Array.from(charRange.getClientRects());
            if (VZ.ui.hoverPopup.hoveredCharRects.length > 0) {
              const r = VZ.ui.hoverPopup.hoveredCharRects[0];
              VZ.ui.hoverPopup.hoveredCharCenterX = r.left + r.width / 2 + window.scrollX;
              VZ.ui.hoverPopup.hoveredCharCenterY = r.top + r.height / 2 + window.scrollY;
            }
          } catch (err) {
            VZ.ui.hoverPopup.hoveredCharRects = [];
            VZ.ui.hoverPopup.hoveredCharCenterX = 0;
            VZ.ui.hoverPopup.hoveredCharCenterY = 0;
          }
          VZ.ui.hoverPopup.updatePopupPosition(mouseX, mouseY);
        },
      );
      return;
    }
  }

  // If no match was found, start the delay timer to hide the popup
  VZ.ui.hoverPopup.startHideTimer(mouseX, mouseY);
}

// Helper to get element under coordinates, piercing Shadow DOM
function getElementUnderMousePiercingShadow(x, y) {
  let el = document.elementFromPoint(x, y);
  while (el && el.shadowRoot) {
    const innerEl = el.shadowRoot.elementFromPoint(x, y);
    if (innerEl === el || !innerEl) break;
    el = innerEl;
  }
  return el;
}

// Helper to detect if user is typing in a text input field
function isTypingInInput() {
  const activeEl = document.activeElement;
  if (!activeEl) return false;
  const tagName = activeEl.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    activeEl.isContentEditable ||
    activeEl.closest?.("[contenteditable]")
  );
}

// Bind selection events
document.addEventListener("mouseup", (e) => {
  if (typeof handleMouseUpSelection === "function") {
    // Add a slight delay to allow double-click selection to resolve
    setTimeout(() => handleMouseUpSelection(e), 50);
  }
});
document.addEventListener("selectionchange", () => {
  const selection = window.getSelection();
  
  // 1. Hide normal dictionary popup immediately when user starts dragging/selecting
  if (selection && !selection.isCollapsed) {
    if (VZ.ui.hoverPopup.popupElement && VZ.ui.hoverPopup.popupElement.classList.contains("zh-visible")) {
      VZ.ui.hoverPopup.popupElement.classList.remove("zh-visible");
      VZ.ui.hoverPopup.clearHideTimer();
    }
  }

  // 2. Hide selection icon if selection is lost
  if (typeof VZ.ui.sentence.hideSelectionIcon === "function") {
    if (!selection || selection.isCollapsed) {
      VZ.ui.sentence.hideSelectionIcon();
    }
  }
});

// Hide popups and highlights when scrolling (works for both window scroll and inner element scroll)
window.addEventListener("scroll", (e) => {
  const target = e.target;
  
  // Ignore scroll events originating from inside our popups
  if (target && target.nodeType === 1) {
    if (target.closest(".zh-hover-popup") || 
        target.closest(".zh-sentence-popup") || 
        target.closest(".zh-report-overlay") || 
        target.closest(".zh-stroke-popup") || 
        target.closest(".zh-decomposition-panel") ||
        target.closest(".zh-guide-overlay")) {
      return;
    }
  }

  if (typeof VZ.ui.hoverPopup.hidePopup === "function") {
    VZ.ui.hoverPopup.hidePopup();
  }
  if (VZ.ui.decompPopup) {
    VZ.ui.decompPopup.hidePanel();
  }
}, { passive: true, capture: true });

// Click event for opening Decomposition Panel
document.addEventListener("click", (e) => {
  const charEl = e.target.closest('.zh-char');
  if (charEl) {
    const char = charEl.getAttribute('data-sim-char') || charEl.getAttribute('data-char');
    if (char && window.VZ.ui.decompPopup) {
      // Find the parent popup to use as reference for positioning
      const popupEl = charEl.closest('.zh-hover-popup') || charEl.closest('.zh-sentence-popup') || charEl.closest('.zh-decomposition-panel');
      if (popupEl) {
        window.VZ.ui.decompPopup.showPanel(char, popupEl);
      }
    }
  }
});

  // Initialize config and bindings
  window.VZ.config.init(() => {
    // Bind selection event from sentence popup
    document.addEventListener("mouseup", VZ.ui.sentence.handleMouseUpSelection);
  });

  // Re-render guide if keys change
  window.VZ.config.subscribe((newCfg, changedKeys) => {
    if (changedKeys.includes('active')) {
      if (newCfg.active) {
        window.VZ.ui.guide.show();
      } else {
        window.VZ.ui.guide.hide();
      }
    }
    if (changedKeys.includes('keys')) {
      window.VZ.ui.guide.renderContent();
    }
    if (changedKeys.includes('appearance')) {
      window.VZ.ui.hoverPopup.updatePopupClasses();
    }
  });

})();
