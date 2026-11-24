window.VZ = window.VZ || {};
window.VZ.ui = window.VZ.ui || {};

window.VZ.ui.stroke = (function() {
  const getCfg = () => window.VZ.config.get();

  let strokePopupElement = null;
  let hanziWriterInstance = null;
  let strokeHideTimer = null;
  let strokeHoverTimer = null;
  let strokeStateTimer = null;
  let strokeShowSeq = 0;

  function setStrokeState(state, char = "") {
    if (!strokePopupElement) return;
    const stateEl = strokePopupElement.querySelector("#zh-stroke-state");
    if (!stateEl) return;

    if (state === "ready" || state === "idle") {
      stateEl.hidden = true;
      stateEl.innerHTML = "";
      return;
    }

    stateEl.hidden = false;
    if (state === "loading") {
      stateEl.innerHTML = `
        <div class="zh-decomp-spinner"></div>
        <div class="zh-stroke-state-text">Đang tải nét bút…</div>
      `;
      return;
    }

    stateEl.innerHTML = `
      <div class="zh-no-stroke">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 8h.01M11.5 11.5H12V16h.5"></path>
        </svg>
        <span>Không có dữ liệu nét bút${char ? ` cho ${char}` : ""}</span>
      </div>
    `;
  }

// Create and show stroke order popup
function show(char, anchorEl) {
  if (!strokePopupElement) {
    strokePopupElement = document.createElement("div");
    strokePopupElement.className = `zh-stroke-popup zh-theme-${getCfg().theme}`;
    strokePopupElement.innerHTML = `
      <div class="zh-stroke-target" id="zh-stroke-target"></div>
      <div class="zh-stroke-state" id="zh-stroke-state" hidden></div>
    `;
    document.body.appendChild(strokePopupElement);

    strokePopupElement.addEventListener("mouseenter", () => {
      if (strokeHideTimer) {
        clearTimeout(strokeHideTimer);
        strokeHideTimer = null;
      }
    });
    strokePopupElement.addEventListener("mouseleave", () => {
      if (!strokeHideTimer) {
        strokeHideTimer = setTimeout(VZ.ui.stroke.hide, 200);
      }
    });
  }

  strokePopupElement.className = `zh-stroke-popup zh-theme-${getCfg().theme}`;

  if (strokeStateTimer) {
    clearTimeout(strokeStateTimer);
    strokeStateTimer = null;
  }

  const strokeTarget = strokePopupElement.querySelector("#zh-stroke-target");
  const seq = ++strokeShowSeq;
  const failStroke = () => {
    if (seq !== strokeShowSeq) return;
    if (strokeStateTimer) {
      clearTimeout(strokeStateTimer);
      strokeStateTimer = null;
    }
    setStrokeState("error", char);
  };

  setStrokeState("loading", char);

  if (typeof HanziWriter === "undefined") {
    console.error("HanziWriter library is not loaded.");
    failStroke();
    return;
  }

  strokeTarget.innerHTML = "";

  const rect = anchorEl.getBoundingClientRect();
  let top = rect.bottom + window.scrollY + 8;
  let left = rect.left + window.scrollX - 60 + rect.width / 2;

  // Keep stroke popup within viewport (use the rendered size so CSS
  // breakpoints or user zoom can change it without breaking positioning).
  const popupWidth = strokePopupElement.offsetWidth || 140;
  const popupHeight = strokePopupElement.offsetHeight || 140;
  if (left + popupWidth > window.innerWidth + window.scrollX) {
    left = window.innerWidth + window.scrollX - popupWidth - 10;
  }
  if (left < window.scrollX + 10) {
    left = window.scrollX + 10;
  }

  // Check bottom overflow
  if (top + popupHeight > window.innerHeight + window.scrollY) {
    top = rect.top + window.scrollY - popupHeight - 8;
  }
  if (top < window.scrollY + 10) {
    top = window.scrollY + 10;
  }

  strokePopupElement.style.top = `${top}px`;
  strokePopupElement.style.left = `${left}px`;
  strokePopupElement.classList.add("zh-visible");

  const strokeColor = getCfg().theme === "dark" ? "#38bdf8" : "#000000";
  const outlineColor = "#DDDDDD";

  try {
    strokeStateTimer = setTimeout(failStroke, 8000);
    hanziWriterInstance = HanziWriter.create(strokeTarget, char, {
      width: 120,
      height: 120,
      padding: 5,
      strokeColor: strokeColor,
      radicalColor: strokeColor,
      outlineColor: outlineColor,
      strokeAnimationSpeed: parseFloat(getCfg().strokeSpeed) || 1,
      delayBetweenStrokes: 150,
      delayBetweenLoops: 500,
      showOutline: true,
      onLoadCharDataSuccess: () => {
        if (seq !== strokeShowSeq) return;
        if (strokeStateTimer) {
          clearTimeout(strokeStateTimer);
          strokeStateTimer = null;
        }
        setStrokeState("ready");
      },
      onLoadCharDataError: failStroke,
    });

    hanziWriterInstance.loopCharacterAnimation();
  } catch (err) {
    console.log("Could not load HanziWriter for character:", char);
    failStroke();
  }
}

function hide() {
  strokeShowSeq++;
  if (strokeStateTimer) {
    clearTimeout(strokeStateTimer);
    strokeStateTimer = null;
  }
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

  return {
    show,
    hide,
    get strokeHideTimer() { return strokeHideTimer; },
    set strokeHideTimer(v) { strokeHideTimer = v; },
    get strokeHoverTimer() { return strokeHoverTimer; },
    set strokeHoverTimer(v) { strokeHoverTimer = v; }
  };
})();
