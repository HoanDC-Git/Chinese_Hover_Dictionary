// Create and show stroke order popup
function showStrokePopup(char, anchorEl) {
  if (!strokePopupElement) {
    strokePopupElement = document.createElement("div");
    strokePopupElement.className = `zh-stroke-popup zh-theme-${theme}`;
    strokePopupElement.innerHTML = `<div class="zh-stroke-target" id="zh-stroke-target"></div>`;
    document.body.appendChild(strokePopupElement);

    strokePopupElement.addEventListener("mouseenter", () => {
      if (strokeHideTimer) {
        clearTimeout(strokeHideTimer);
        strokeHideTimer = null;
      }
    });
    strokePopupElement.addEventListener("mouseleave", () => {
      if (!strokeHideTimer) {
        strokeHideTimer = setTimeout(hideStrokePopup, 200);
      }
    });
  }

  strokePopupElement.className = `zh-stroke-popup zh-theme-${theme}`;

  if (typeof HanziWriter === "undefined") {
    console.error("HanziWriter library is not loaded.");
    return;
  }

  document.getElementById("zh-stroke-target").innerHTML = "";

  const rect = anchorEl.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 8;
  let left = rect.left + window.scrollX - 60 + rect.width / 2;

  // Keep stroke popup within viewport
  const popupWidth = 140;
  const popupHeight = 140;
  if (left + popupWidth > window.innerWidth + window.scrollX) {
    left = window.innerWidth + window.scrollX - popupWidth - 10;
  }
  if (left < window.scrollX + 10) {
    left = window.scrollX + 10;
  }

  // Check bottom overflow
  if (top + popupHeight > window.innerHeight + window.scrollY) {
    strokePopupElement.style.top = `${rect.top + window.scrollY - popupHeight - 8}px`;
  } else {
    strokePopupElement.style.top = `${top}px`;
  }

  strokePopupElement.style.left = `${left}px`;
  strokePopupElement.classList.add("zh-visible");

  const strokeColor = theme === "dark" ? "#38bdf8" : "#000000";
  const outlineColor = "#DDDDDD";

  hanziWriterInstance = HanziWriter.create("zh-stroke-target", char, {
    width: 120,
    height: 120,
    padding: 5,
    strokeColor: strokeColor,
    radicalColor: strokeColor,
    outlineColor: outlineColor,
    strokeAnimationSpeed: parseFloat(strokeSpeed) || 1,
    delayBetweenStrokes: 150,
    delayBetweenLoops: 500,
    showOutline: true,
  });

  hanziWriterInstance.loopCharacterAnimation();
}

function hideStrokePopup() {
  if (strokePopupElement) {
    strokePopupElement.classList.remove("zh-visible");
  }
  if (
    hanziWriterInstance &&
    typeof hanziWriterInstance.cancelAnimation === "function"
  ) {
    hanziWriterInstance.cancelAnimation();
  }
}
