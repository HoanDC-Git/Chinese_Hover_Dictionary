// Render the guide panel content dynamically using the current active key bindings
function renderGuidePanelContent() {
  if (!guideElement) return;

  const upKey = keys.up.toUpperCase();
  const downKey = keys.down.toUpperCase();
  const leftKey = keys.left.toUpperCase();
  const rightKey = keys.right.toUpperCase();
  const copyKey = keys.copy.toUpperCase();
  const speak1 = keys.speak1.toUpperCase();
  const speak2 = keys.speak2.toUpperCase();
  const speak3 = keys.speak3.toUpperCase();
  const speak4 = keys.speak4.toUpperCase();
  const toggleActiveKey = keys.toggleActive.toUpperCase();
  const toggleActiveText =
    toggleActiveModifier === "alt"
      ? `ALT + ${toggleActiveKey}`
      : toggleActiveKey;

  let nudgeHtml = "";
  if (enableNudge) {
    nudgeHtml = `
      <div class="zh-guide-shortcut">
        <div class="zh-guide-key-group">
          <span class="zh-guide-key">${upKey}</span>
          <span class="zh-guide-key">${leftKey}</span>
          <span class="zh-guide-key">${downKey}</span>
          <span class="zh-guide-key">${rightKey}</span>
        </div>
        <span>Di chuyển Popup</span>
      </div>
    `;
  }

  let copyHtml = "";
  let speakHtml = "";
  if (enableQuickActions) {
    copyHtml = `
      <div class="zh-guide-shortcut">
        <span class="zh-guide-key">${copyKey}</span>
        <span>Sao chép chữ</span>
      </div>
    `;
    speakHtml = `
      <div class="zh-guide-shortcut">
        <div class="zh-guide-key-group">
          <span class="zh-guide-key">${speak1}</span>
          <span class="zh-guide-key">${speak2}</span>
          <span class="zh-guide-key">${speak3}</span>
          <span class="zh-guide-key">${speak4}</span>
        </div>
        <span>Phát âm</span>
      </div>
    `;
  }
  const isMac = navigator.userAgent.toLowerCase().includes("mac");
  const optionsKeyText = isMac ? "Option ⌥ + W" : "Alt + W";

  guideElement.innerHTML = `
    <div class="zh-guide-title">Tiện ích Tra Từ Chữ Hán</div>
    <div class="zh-guide-section">
      <div style="display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
        <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor" style="flex-shrink: 0; margin-top: 2px; color: #38bdf8;"><path d="M440-280h80v-240h-80v240Zm68.5-331.5Q520-623 520-640t-11.5-28.5Q497-680 480-680t-28.5 11.5Q440-657 440-640t11.5 28.5Q463-600 480-600t28.5-11.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm0-320Z"/></svg>
        <div><b>Cách dùng:</b> Di chuột qua chữ Hán trên trang để dịch từ vựng.</div>
      </div>
    <div class="zh-guide-shortcut">
      <span>Giữ chuột ở hán tự trên popup để xem nét bút</span>
    </div>
      ${copyHtml}
      <div class="zh-guide-shortcut">
        <span class="zh-guide-key">${toggleActiveText}</span>
        <span>Bật/Tắt tiện ích</span>
      </div>
      ${speakHtml}
      ${nudgeHtml}
      <div class="zh-guide-hint">
        💡 Nhấn <b>${optionsKeyText}</b> (hoặc chuột phải vào icon ➔ Tùy chọn) để mở trang cài đặt.
      </div>
    </div>
  `;
}

// Create and show guide panel on the left
function createGuidePanel() {
  if (!guideElement) {
    guideElement = document.createElement("div");
    guideElement.className = "zh-guide-panel";
    document.body.appendChild(guideElement);

    // Keep guide open on hover
    guideElement.addEventListener("mouseenter", () => {
      if (guideHideTimer) {
        clearTimeout(guideHideTimer);
        guideHideTimer = null;
      }
    });

    // Hide guide 0.75s after leaving it
    guideElement.addEventListener("mouseleave", () => {
      if (!guideHideTimer) {
        guideHideTimer = setTimeout(hideGuidePanel, 750);
      }
    });
  }

  // Render content with current keybindings
  renderGuidePanelContent();
}

function showGuidePanel() {
  createGuidePanel();
  guideElement.classList.add("zh-visible");
  watchMouseForGuide = true; // Wait for mouse to move into viewport to hide it

  if (guideHideTimer) {
    clearTimeout(guideHideTimer);
    guideHideTimer = null;
  }
}

function hideGuidePanel() {
  if (guideElement) {
    guideElement.classList.remove("zh-visible");
  }
  if (guideHideTimer) {
    clearTimeout(guideHideTimer);
    guideHideTimer = null;
  }
}
