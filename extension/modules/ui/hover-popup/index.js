window.VZ = window.VZ || {};
window.VZ.ui = window.VZ.ui || {};

window.VZ.ui.hoverPopup = (function() {
  let popupElement = null;
  let hideTimer = null;
  let toastElement = null;
  let activeHighlights = [];
  
  const getCfg = () => window.VZ.config.get();
  const showReportModal = (w) => window.VZ.ui.report?.show(w);
  const showStrokePopup = (c, e) => window.VZ.ui.stroke?.show(c, e);
  const hideStrokePopup = () => window.VZ.ui.stroke?.hide();

  let currentLongestMatch = "";
  let hoveredCharRects = [];
  let hoveredCharCenterX = 0;
  let hoveredCharCenterY = 0;
// Create popup and highlight overlay container elements
function createUIElements() {
  if (!popupElement) {
    popupElement = document.createElement("div");
    popupElement.className = `zh-hover-popup zh-theme-${getCfg().theme} zh-font-${getCfg().fontFamily} zh-size-${getCfg().fontSize}`;
    document.body.appendChild(popupElement);

    // Keep popup open when mouse is over it
    popupElement.addEventListener("mouseenter", () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    });

    // Start hide timer when mouse leaves popup
    popupElement.addEventListener("mouseleave", () => {
      if (!hideTimer) {
        hideTimer = setTimeout(hidePopup, 150); // 150ms delay
      }
    });

    // Event delegation for speaker and report button clicks inside popup
    popupElement.addEventListener("click", (e) => {
      const speaker = e.target.closest(".zh-hover-speaker");
      if (speaker) {
        const word = speaker.getAttribute("data-word");
        if (word) VZ.services.tts.speakWord(word, speaker);
        return;
      }

      const reportBtn = e.target.closest(".zh-hover-report-btn");
      if (reportBtn) {
        const word = reportBtn.getAttribute("data-word");
        if (word) showReportModal(word);
        return;
      }
    });

    // Event delegation for stroke order hover
    popupElement.addEventListener("mouseover", (e) => {
      const charSpan = e.target.closest(".zh-char");
      if (charSpan) {
        const char = charSpan.getAttribute("data-char");
        if (/[\u4e00-\u9fa5]/.test(char)) {
          if (VZ.ui.stroke.strokeHideTimer) {
            clearTimeout(VZ.ui.stroke.strokeHideTimer);
            VZ.ui.stroke.strokeHideTimer = null;
          }
          if (VZ.ui.stroke.strokeHoverTimer) clearTimeout(VZ.ui.stroke.strokeHoverTimer);
          VZ.ui.stroke.strokeHoverTimer = setTimeout(() => {
            showStrokePopup(char, charSpan);
          }, 500);
        }
      }
    });

    popupElement.addEventListener("mouseout", (e) => {
      const charSpan = e.target.closest(".zh-char");
      if (charSpan) {
        if (VZ.ui.stroke.strokeHoverTimer) {
          clearTimeout(VZ.ui.stroke.strokeHoverTimer);
          VZ.ui.stroke.strokeHoverTimer = null;
        }
        if (!VZ.ui.stroke.strokeHideTimer) {
          VZ.ui.stroke.strokeHideTimer = setTimeout(hideStrokePopup, 200);
        }
      }
    });
  }
}

// Update popup classes when settings change
function updatePopupClasses() {
  if (popupElement) {
    const isVisible = popupElement.classList.contains("zh-visible");
    popupElement.className = `zh-hover-popup zh-theme-${getCfg().theme} zh-font-${getCfg().fontFamily} zh-size-${getCfg().fontSize}`;
    if (isVisible) {
      popupElement.classList.add("zh-visible");
    }
  }
}

// Render lookup matches inside popup
function renderPopup(matches, definitions) {
  let html = "";
  let matchIndex = 0;

  for (const word of matches) {
    const wordDefs = definitions[word];
    if (!wordDefs) continue;

    for (const def of wordDefs) {
      const [pinyin, pos, meaning_vi, meaning_en, hsk_level] = def;
      const formattedPinyin = VZ.utils.text.formatPinyin(pinyin);

      // Determine HSK level class
      const hskClass = hsk_level
        ? `zh-hsk-${hsk_level.toLowerCase().replace(/\s+/g, "")}`
        : "";

      let speakKeyHint = "";
      if (matchIndex === 0) speakKeyHint = getCfg().keys.speak1.toUpperCase();
      else if (matchIndex === 1) speakKeyHint = getCfg().keys.speak2.toUpperCase();
      else if (matchIndex === 2) speakKeyHint = getCfg().keys.speak3.toUpperCase();
      else if (matchIndex === 3) speakKeyHint = getCfg().keys.speak4.toUpperCase();

      html += `
        <div class="zh-hover-item">
          <div class="zh-hover-header">
            <div class="zh-hover-header-top">
              <span class="zh-hover-word">${word
                .split("")
                .map(
                  (char) =>
                    `<span class="zh-char" data-char="${char}"${char === '仓' ? ' style="font-family: sans-serif !important;"' : ''}>${char}</span>`,
                )
                .join("")}</span>
              ${
                getCfg().enableQuickActions
                  ? `
              <button class="zh-hover-speaker" data-word="${word}" title="Phát âm${speakKeyHint ? ` (Phím tắt: ${speakKeyHint})` : ""}">
                <svg viewBox="0 0 24 24"><path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zm-3 0L5 8H1v8h4l6 4.77V3.23zM16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
                ${speakKeyHint ? `<span class="zh-hover-speaker-key">(${speakKeyHint})</span>` : ""}
              </button>
              `
                  : ""
              }
            </div>
            <div class="zh-hover-header-bottom">
              <span class="zh-hover-pinyin">${formattedPinyin}</span>
              ${pos ? `<span class="zh-hover-pos">${pos}</span>` : ""}
              ${hsk_level ? `<span class="zh-hover-hsk ${hskClass}">HSK ${hsk_level}</span>` : ""}
            </div>
          </div>
          <div class="zh-hover-meanings" style="position: relative; padding-right: 28px;">
            <button class="zh-hover-report-btn" style="position: absolute; top: 0; right: 0; margin: 0;" data-word="${word}" title="Báo lỗi từ này">
              <svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240ZM330-120 120-330v-300l210-210h300l210 210v300L630-120H330Zm34-80h232l164-164v-232L596-760H364L200-596v232l164 164Zm116-280Z"/></svg>
            </button>
            ${
              meaning_vi
                ? `
              <div class="zh-hover-meaning-row">
                <span class="zh-hover-lang-label">vi</span>
                <span class="zh-hover-meaning-text">${meaning_vi}</span>
              </div>
            `
                : ""
            }
            ${
              meaning_en
                ? `
              <div class="zh-hover-meaning-row">
                <span class="zh-hover-lang-label">en</span>
                <span class="zh-hover-meaning-text">${meaning_en}</span>
              </div>
            `
                : ""
            }
          </div>
        </div>
      `;
    }
    matchIndex++;
  }

  popupElement.innerHTML = html;
}
// Hide popup and remove highlights
function hidePopup() {
  if (popupElement) {
    popupElement.classList.remove("zh-visible");
  }
  hideStrokePopup();
  clearHighlights();
  currentLongestMatch = "";
  hoveredCharRects = [];
  hoveredCharCenterX = 0;
  hoveredCharCenterY = 0;
}

// Highlight the matched text span (handles multiple client rects for wrapped text)
function highlightTextRange(charMap, length) {
  clearHighlights();
  if (!charMap || charMap.length === 0 || length === 0) return;

  try {
    // Collect all character rects individually to bypass Firefox Range bugs
    let allRects = [];
    for (let i = 0; i < length; i++) {
      if (i >= charMap.length) break;
      const charInfo = charMap[i];
      const range = document.createRange();
      range.setStart(charInfo.node, charInfo.offset);
      range.setEnd(charInfo.node, charInfo.offset + 1);

      const rects = range.getClientRects();
      for (const rect of rects) {
        if (rect.width > 0 && rect.height > 0) {
          allRects.push({
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            width: rect.width,
            height: rect.height,
          });
        }
      }
    }

    if (allRects.length === 0) return;

    // Merge adjacent rects on the same line to form continuous highlight blocks
    let mergedRects = [];
    let currentRect = { ...allRects[0] };

    for (let i = 1; i < allRects.length; i++) {
      const rect = allRects[i];
      // If rect is on the same line (top and bottom within 5px) and horizontally adjacent
      if (
        Math.abs(rect.top - currentRect.top) < 5 &&
        Math.abs(rect.bottom - currentRect.bottom) < 5 &&
        rect.left <= currentRect.right + 5
      ) {
        // Merge
        currentRect.right = Math.max(currentRect.right, rect.right);
        currentRect.width = currentRect.right - currentRect.left;
        currentRect.top = Math.min(currentRect.top, rect.top);
        currentRect.bottom = Math.max(currentRect.bottom, rect.bottom);
        currentRect.height = currentRect.bottom - currentRect.top;
      } else {
        mergedRects.push(currentRect);
        currentRect = { ...rect };
      }
    }
    mergedRects.push(currentRect);

    // Render the merged highlight overlays
    for (const rect of mergedRects) {
      const el = document.createElement("div");
      el.className = "zh-highlight-overlay";
      // Using position: fixed, so we use viewport coordinates directly
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      document.body.appendChild(el);
      activeHighlights.push(el);
    }
  } catch (err) {
    console.error("Failed to highlight text range:", err);
  }
}

// Clear all active highlight overlay elements
function clearHighlights() {
  for (const el of activeHighlights) {
    el.remove();
  }
  activeHighlights = [];
}
// Display toast notification
function showToast(text) {
  if (!toastElement) {
    toastElement = document.createElement("div");
    toastElement.className = "zh-copied-toast";
    document.body.appendChild(toastElement);
  }
  toastElement.innerText = text;
  toastElement.classList.add("zh-visible");

  if (toastElement._timer) {
    clearTimeout(toastElement._timer);
  }
  toastElement._timer = setTimeout(() => {
    toastElement.classList.remove("zh-visible");
  }, 1500);
}

// Helper to start the delay timer to hide the popup
function startHideTimer(x, y) {
  if (!hideTimer) {
    hideTimer = setTimeout(() => {
      hideTimer = null;
      // Double check if mouse didn't enter the popup during the delay
      const elementUnderMouse = document.elementFromPoint(x, y);
      if (popupElement && popupElement.contains(elementUnderMouse)) {
        return;
      }
      hidePopup();
    }, 150); // 150ms transition buffer
  }
}

// Position popup near hovered character center and do boundary checks
function updatePopupPosition(targetX, targetY) {
  if (!popupElement) return;

  // Temporarily show popup to compute width/height
  popupElement.style.visibility = "hidden";
  popupElement.style.display = "flex";
  popupElement.classList.add("zh-visible");

  const popupWidth = popupElement.offsetWidth || 300;
  const popupHeight = popupElement.offsetHeight || 150;

  popupElement.style.display = "";
  popupElement.style.visibility = "";

  let left, top;

  if (hoveredCharRects && hoveredCharRects.length > 0) {
    const rect = hoveredCharRects[0];
    // With position: fixed, we use viewport coordinates directly
    const charTop = rect.top;
    const charBottom = rect.bottom;
    const charLeft = rect.left;
    const charRight = rect.right;

    const offset = 4; // Giữ nguyên khoảng cách cũ là 4px

    // Check if popup fits below character bottom in the viewport
    const viewportBottom = window.innerHeight;
    const fitBelow = charBottom + offset + popupHeight <= viewportBottom - 10;
    let tailClass = "";

    if (fitBelow) {
      // Normal: Top edge of popup is slightly below bottom edge of character
      top = charBottom + offset;
      tailClass = "zh-tail-top-";
    } else {
      // Near viewport bottom: Bottom edge of popup is slightly above top edge of character
      top = charTop - offset - popupHeight;
      tailClass = "zh-tail-bottom-";
    }

    // Position horizontally: prefer right, fallback to left if it overflows viewport right margin
    const viewportRight = charRight;
    if (viewportRight + 10 + popupWidth <= window.innerWidth) {
      // Place completely to the right of the character
      left = charRight - 8;
      tailClass += "left";
    } else {
      // Place completely to the left of the character
      left = charLeft - popupWidth + 8;
      tailClass += "right";
    }

    // Clean up old tail classes
    popupElement.classList.remove(
      "zh-tail-top-left",
      "zh-tail-top-right",
      "zh-tail-bottom-left",
      "zh-tail-bottom-right",
    );
    popupElement.classList.add(tailClass);
  } else {
    // Fallback to mouse coordinates if character rect is not available
    left = targetX + 15;
    top = targetY - popupHeight / 2;
    popupElement.classList.remove(
      "zh-tail-top-left",
      "zh-tail-top-right",
      "zh-tail-bottom-left",
      "zh-tail-bottom-right",
    );
  }

  // Prevent popup from extending beyond viewport left/right edges
  const minLeft = 10;
  const maxLeft = window.innerWidth - popupWidth - 10;

  if (left < minLeft) left = minLeft;
  if (left > maxLeft) left = maxLeft;

  // Prevent popup from extending beyond viewport top/bottom edges
  const minTop = 10;
  const maxTop = window.innerHeight - popupHeight - 10;

  if (top < minTop) top = minTop;
  if (top > maxTop) top = maxTop;

  popupElement.style.left = `${left}px`;
  popupElement.style.top = `${top}px`;
  popupElement.classList.add("zh-visible");

  // Remove focus from input elements to remove typing caret when popup appears
  if (
    document.activeElement &&
    (document.activeElement.tagName === "INPUT" ||
      document.activeElement.tagName === "TEXTAREA" ||
      document.activeElement.isContentEditable)
  ) {
    document.activeElement.blur();
  }
}

  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  return {
    createUIElements,
    updatePopupClasses,
    renderPopup,
    hidePopup,
    highlightTextRange,
    clearHighlights,
    showToast,
    startHideTimer,
    clearHideTimer,
    updatePopupPosition,
    get popupElement() { return popupElement; },
    get currentLongestMatch() { return currentLongestMatch; },
    set currentLongestMatch(v) { currentLongestMatch = v; },
    get hoveredCharRects() { return hoveredCharRects; },
    set hoveredCharRects(v) { hoveredCharRects = v; },
    get hoveredCharCenterX() { return hoveredCharCenterX; },
    set hoveredCharCenterX(v) { hoveredCharCenterX = v; },
    get hoveredCharCenterY() { return hoveredCharCenterY; },
    set hoveredCharCenterY(v) { hoveredCharCenterY = v; }
  };
})();
