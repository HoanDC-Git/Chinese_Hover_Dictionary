// Core mouse and keyboard event listeners

document.addEventListener("mousemove", (e) => {
  // If watchMouseForGuide is true, it means the mouse entered the webpage after click
  if (watchMouseForGuide) {
    watchMouseForGuide = false;
    // Start a 1-second timer to hide guide after mouse moves in the webpage, allowing ample reading time
    if (guideHideTimer) clearTimeout(guideHideTimer);
    guideHideTimer = setTimeout(hideGuidePanel, 1000);
  }

  const isPopupVisible =
    popupElement && popupElement.classList.contains("zh-visible");
  if (!active && !isPopupVisible) return;

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

  // 0. Toggle Active Status Shortcut (Works even when active is false, and popup is hidden)
  let triggerToggleActive = false;
  if (toggleActiveModifier === "alt") {
    triggerToggleActive = e.altKey && key === keys.toggleActive;
  } else {
    triggerToggleActive =
      !e.altKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey &&
      key === keys.toggleActive;
  }

  if (triggerToggleActive) {
    e.preventDefault();
    chrome.storage.local.set({ active: !active });
    return;
  }

  if (
    !active &&
    !(popupElement && popupElement.classList.contains("zh-visible"))
  )
    return;

  // Check if popup is currently visible
  if (popupElement && popupElement.classList.contains("zh-visible")) {
    // Ignore key events with modifiers (to avoid overriding standard browser shortcuts like Ctrl+C, Ctrl+R, etc.)
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
      return;
    }

    // 2. Custom Nudging Keys
    if (
      enableNudge &&
      [keys.up, keys.left, keys.down, keys.right].includes(key)
    ) {
      e.preventDefault();
      const currentLeft = parseFloat(popupElement.style.left) || 0;
      const currentTop = parseFloat(popupElement.style.top) || 0;
      const offset = 15; // Nudge displacement in pixels

      if (key === keys.up) {
        popupElement.style.top = `${currentTop - offset}px`;
      } else if (key === keys.down) {
        popupElement.style.top = `${currentTop + offset}px`;
      } else if (key === keys.left) {
        popupElement.style.left = `${currentLeft - offset}px`;
      } else if (key === keys.right) {
        popupElement.style.left = `${currentLeft + offset}px`;
      }
    }
    // 3. Custom Copy Key
    else if (enableQuickActions && key === keys.copy) {
      e.preventDefault();
      if (currentLongestMatch) {
        navigator.clipboard
          .writeText(currentLongestMatch)
          .then(() => {
            showToast(`Đã sao chép: "${currentLongestMatch}"`);
          })
          .catch((err) => {
            console.error("Failed to copy text:", err);
          });
      }
    }
    // 4. Speak 1..4
    else if (enableQuickActions && (key === keys.speak1 || key === keys.speak2 || key === keys.speak3 || key === keys.speak4)) {
      e.preventDefault();
      let index = 0;
      if (key === keys.speak2) index = 1;
      else if (key === keys.speak3) index = 2;
      else if (key === keys.speak4) index = 3;

      const speakers = popupElement.querySelectorAll(".zh-hover-speaker");
      if (speakers && speakers[index]) {
        const wordToSpeak = speakers[index].getAttribute("data-word");
        if (wordToSpeak) speakWord(wordToSpeak, speakers[index]);
      }
      return;
    }
  }
});

// Handle throttled mouse move events
function onMouseMoveThrottled() {
  if (!active) return;
  
  const selection = window.getSelection();
  const isTextSelected = selection && selection.toString().trim().length > 0;
  const isDragging = lastEvent && lastEvent.buttons > 0;
  const isSentenceModalOpen = document.querySelector(".zh-report-overlay.zh-visible") !== null;
  const isDecompPanelOpen = document.querySelector(".zh-decomposition-panel") !== null;
  
  // Hover, popup của hover và highlight sẽ không hoạt động khi đang bôi đen (kéo chuột), có text được chọn, cửa sổ modal đang mở, hoặc panel chiết tự đang mở
  if (isDragging || isTextSelected || isSentenceModalOpen || isDecompPanelOpen) {
    startHideTimer(mouseX, mouseY);
    return;
  }

  // Check if mouse is hovering over the popup itself
  if (
    popupElement &&
    popupElement.contains(document.elementFromPoint(mouseX, mouseY))
  ) {
    return;
  }


  // Check if mouse is hovering over input, textarea, or contenteditable fields
  const elementUnderMouse = getElementUnderMousePiercingShadow(mouseX, mouseY);
  if (elementUnderMouse) {
    if (elementUnderMouse.closest(".zh-sentence-popup") || elementUnderMouse.closest(".zh-report-overlay")) {
      startHideTimer(mouseX, mouseY);
      return;
    }
    
    const tagName = elementUnderMouse.tagName;
    if (
      tagName === "INPUT" ||
      tagName === "TEXTAREA" ||
      elementUnderMouse.isContentEditable ||
      elementUnderMouse.closest("[contenteditable]")
    ) {
      startHideTimer(mouseX, mouseY);
      return;
    }
  }

  // Check if mouse is hovering over the exact character that was hovered
  let isOverHoveredChar = false;
  for (const rect of hoveredCharRects) {
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
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    return; // Keep popup and highlights exactly as is
  }

  if (!active) {
    if (popupElement && popupElement.classList.contains("zh-visible")) {
      startHideTimer(mouseX, mouseY);
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
      startHideTimer(mouseX, mouseY);
      return;
    }

    // Get up to 5 characters from the cursor position to the right (handling node crossing and line breaks)
    const { substring, charMap } = getChineseTextAndMap(textNode, offset);

    // Check if the first character is a Chinese character
    if (substring && /^[\u4e00-\u9fa5]/.test(substring)) {
      // Query the background service worker for dictionary lookup
      chrome.runtime.sendMessage(
        { action: "lookup", text: substring },
        (response) => {
          // Double check active hasn't changed since the lookup message was sent
          if (!active) {
            startHideTimer(mouseX, mouseY);
            return;
          }

          if (
            chrome.runtime.lastError ||
            !response ||
            !response.matches ||
            response.matches.length === 0
          ) {
            startHideTimer(mouseX, mouseY);
            return;
          }

          // Clear hide timer since we found a valid Chinese character
          if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
          }

          const matches = response.matches;
          const definitions = response.definitions;
          const longestMatch = matches[0];

          // NEW OPTIMIZATION: Prevent flickering by not re-rendering if it's the exact same result
          const isPopupVisible = popupElement && popupElement.classList.contains("zh-visible");
          if (currentLongestMatch !== longestMatch || !isPopupVisible) {
            currentLongestMatch = longestMatch; // Save for shortcuts
            
            // Render and position popup only if content changed or popup was hidden
            createUIElements();
            renderPopup(matches, definitions);
          }
          
          highlightTextRange(charMap, longestMatch.length);
          const charRange = document.createRange();
          try {
            charRange.setStart(textNode, offset);
            charRange.setEnd(textNode, offset + 1);
            hoveredCharRects = Array.from(charRange.getClientRects());
            if (hoveredCharRects.length > 0) {
              const r = hoveredCharRects[0];
              hoveredCharCenterX = r.left + r.width / 2 + window.scrollX;
              hoveredCharCenterY = r.top + r.height / 2 + window.scrollY;
            }
          } catch (err) {
            hoveredCharRects = [];
            hoveredCharCenterX = 0;
            hoveredCharCenterY = 0;
          }
          positionPopup();
        },
      );
      return;
    }
  }

  // If no match was found, start the delay timer to hide the popup
  startHideTimer(mouseX, mouseY);
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
    if (popupElement && popupElement.classList.contains("zh-visible")) {
      popupElement.classList.remove("zh-visible");
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    }
  }

  // 2. Hide selection icon if selection is lost
  if (typeof hideSelectionIcon === "function") {
    if (!selection || selection.isCollapsed) {
      hideSelectionIcon();
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

  if (typeof hidePopup === "function") {
    hidePopup();
  }
  if (window.zhDecompositionPopup) {
    window.zhDecompositionPopup.hidePanel();
  }
}, { passive: true, capture: true });

// Click event for opening Decomposition Panel
document.addEventListener("click", (e) => {
  const charEl = e.target.closest('.zh-char');
  if (charEl) {
    const char = charEl.getAttribute('data-char');
    if (char && window.zhDecompositionPopup) {
      // Find the parent popup to use as reference for positioning
      const popupEl = charEl.closest('.zh-hover-popup') || charEl.closest('.zh-sentence-popup') || charEl.closest('.zh-decomposition-panel');
      if (popupEl) {
        window.zhDecompositionPopup.showPanel(char, popupEl);
      }
    }
  }
});
