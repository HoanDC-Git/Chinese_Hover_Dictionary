// --- Report Modal Functions ---
let reportWord = "";

function createReportModal() {
  if (document.getElementById("zh-report-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "zh-report-overlay";
  overlay.className = "zh-report-overlay zh-theme-" + theme;
  overlay.innerHTML = `
    <div class="zh-report-modal">
      <div id="zh-report-form-view">
        <div class="zh-report-header">
          Báo cáo lỗi từ vựng
          <button class="zh-report-close-btn">&times;</button>
        </div>
        <div class="zh-report-body">
        <p>Phản hồi của bạn giúp chúng tôi cải thiện từ điển. Vui lòng cho biết vấn đề của từ: <strong id="zh-report-word-display"></strong></p>
        <div class="zh-report-options">
          <label><input type="checkbox" value="Sai nghĩa"> Sai nghĩa</label>
          <div class="zh-report-textarea-container" id="container-Sai nghĩa">
            <div class="zh-report-textarea-wrapper">
              <textarea class="zh-report-textarea" data-for="Sai nghĩa" placeholder="Ví dụ: Nghĩa của từ này nên là..."></textarea>
            </div>
          </div>

          <label><input type="checkbox" value="Lỗi âm thanh"> Lỗi âm thanh</label>
          <div class="zh-report-textarea-container" id="container-Lỗi âm thanh">
            <div class="zh-report-textarea-wrapper">
              <textarea class="zh-report-textarea" data-for="Lỗi âm thanh" placeholder="Ví dụ: Giọng đọc bị méo tiếng..."></textarea>
            </div>
          </div>

          <label><input type="checkbox" value="Không có hoạt ảnh nét bút"> Không có hoạt ảnh nét bút</label>
          <div class="zh-report-textarea-container" id="container-Không có hoạt ảnh nét bút">
            <div class="zh-report-textarea-wrapper">
              <textarea class="zh-report-textarea" data-for="Không có hoạt ảnh nét bút" placeholder="Nhập thêm chi tiết nếu cần..."></textarea>
            </div>
          </div>

          <label><input type="checkbox" value="Khác"> Khác</label>
          <div class="zh-report-textarea-container" id="container-Khác">
            <div class="zh-report-textarea-wrapper">
              <textarea class="zh-report-textarea" data-for="Khác" placeholder="Mô tả chi tiết vấn đề bạn gặp phải..."></textarea>
            </div>
          </div>
        </div>
        <div id="zh-report-status" class="zh-report-status"></div>
      </div>
      <div class="zh-report-footer">
        <button id="zh-report-cancel" class="zh-report-btn">Hủy</button>
        <button id="zh-report-submit" class="zh-report-btn zh-report-submit-btn">Gửi báo cáo</button>
      </div>
    </div>
    <div id="zh-report-loading-view" style="display: none; height: 100%; width: 100%; flex-direction: column; justify-content: center; align-items: center; text-align: center; background-color: #fdfaf6;">
      <div class="zh-spinner" style="margin-bottom: 24px;"></div>
      <h2 style="margin: 0 0 12px 0; font-size: 24px; font-weight: 700; color: #b91c1c;">Đang gửi báo cáo...</h2>
      <p style="margin: 0; font-size: 16px; color: #475569;">Vui lòng chờ trong giây lát.</p>
    </div>
    <div id="zh-report-success-view" style="display: none; background-color: rgb(254, 239, 220); background-image: url('${chrome.runtime.getURL("icons/success_bg.png")}'); background-size: contain; background-repeat: no-repeat; background-position: center 85%; border-radius: 12px; height: 100%; width: 100%; position: absolute; top: 0; left: 0; flex-direction: column; justify-content: space-between; align-items: center; padding: 10px 30px; box-sizing: border-box; text-align: center;">
      <div class="zh-report-success-top" style="margin-top: 0px;">
        <div class="zh-report-success-icon" style="margin-bottom: 6px; background: #fee2e2; width: 56px; height: 56px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;">
          <svg viewBox="0 0 24 24" width="32" height="32"><path fill="#dc2626" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </div>
        <h2 class="zh-report-success-title" style="margin: 0 0 6px 0; font-size: 24px; font-weight: 700; color: #b91c1c;">Đã gửi báo cáo thành công!</h2>
        <p class="zh-report-success-text" style="margin: 0; font-size: 15px; line-height: 1.5; color: #451a03; font-weight: 500;">Cảm ơn sự đóng góp của bạn!</p>
      </div>
      <div class="zh-report-success-bottom" style="width: 100%; margin-bottom: 0px;">
        <button id="zh-report-success-close" class="zh-report-success-btn" style="background: rgba(220, 38, 38, 0.85); backdrop-filter: blur(4px); color: rgb(254, 239, 220); border: 2px solid rgba(185, 28, 28, 0.6); padding: 12px 12px; border-radius: 20px; font-size: 16px; font-weight: 600; cursor: pointer; width: 60%; min-width: 200px; transition: background 0.2s;">Đóng</button>
      </div>
    </div>
  </div>
  `;
  document.body.appendChild(overlay);

  // Event listeners
  const closeBtn = overlay.querySelector(".zh-report-close-btn");
  const cancelBtn = overlay.querySelector("#zh-report-cancel");
  const successCloseBtn = overlay.querySelector("#zh-report-success-close");
  const submitBtn = overlay.querySelector("#zh-report-submit");
  const checkboxes = overlay.querySelectorAll("input[type='checkbox']");

  closeBtn.addEventListener("click", hideReportModal);
  cancelBtn.addEventListener("click", hideReportModal);
  successCloseBtn.addEventListener("click", hideReportModal);

  function checkEnableSubmit() {
    const anyChecked = Array.from(checkboxes).some((cb) => cb.checked);
    submitBtn.disabled = !anyChecked;
  }

  checkboxes.forEach((cb) => {
    cb.addEventListener("change", (e) => {
      checkEnableSubmit();
      const container = overlay.querySelector(
        `.zh-report-textarea-container[id="container-${e.target.value}"]`,
      );
      if (container) {
        if (e.target.checked) {
          container.classList.add("expanded");
          setTimeout(() => {
            const textarea = container.querySelector(".zh-report-textarea");
            if (textarea) textarea.focus();
          }, 150); // slight delay to allow animation to start
        } else {
          container.classList.remove("expanded");
        }
      }
    });
  });

  submitBtn.addEventListener("click", async () => {
    const selectedIssues = [];
    checkboxes.forEach((cb) => {
      if (cb.checked) {
        const text = overlay
          .querySelector(`.zh-report-textarea[data-for="${cb.value}"]`)
          .value.trim();
        selectedIssues.push(`- ${cb.value}: ${text || "Không có chi tiết"}`);
      }
    });

    if (selectedIssues.length === 0) {
      document.getElementById("zh-report-status").textContent =
        "Vui lòng chọn ít nhất một vấn đề.";
      document.getElementById("zh-report-status").className =
        "zh-report-status zh-status-error";
      return;
    }

    document.getElementById("zh-report-form-view").style.display = "none";
    document.getElementById("zh-report-loading-view").style.display = "flex";
    const statusEl = document.getElementById("zh-report-status");
    statusEl.textContent = "";

    try {
      const message = `Báo cáo lỗi cho từ: ${reportWord}\n\nChi tiết:\n${selectedIssues.join("\n")}`;
      const response = await fetch("https://formspree.io/f/mjgdbdkj", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          source: "Chinese Hover Dictionary (Word Report)",
        }),
      });

      if (!response.ok) throw new Error("Gửi thất bại");

      document.getElementById("zh-report-loading-view").style.display = "none";
      document.getElementById("zh-report-success-view").style.display = "flex";
    } catch (error) {
      document.getElementById("zh-report-loading-view").style.display = "none";
      document.getElementById("zh-report-form-view").style.display = "flex";
      statusEl.textContent = "Gặp lỗi khi gửi, hãy thử lại sau.";
      statusEl.className = "zh-report-status zh-status-error";
      submitBtn.disabled = false;
      submitBtn.textContent = "Gửi báo cáo";
    }
  });

  // Close on outside click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) hideReportModal();
  });
}

function showReportModal(word) {
  createReportModal();
  reportWord = word;
  const overlay = document.getElementById("zh-report-overlay");
  if (overlay) {
    overlay.className = "zh-report-overlay zh-theme-" + theme;
    document.getElementById("zh-report-word-display").textContent = word;

    // Reset form
    document.getElementById("zh-report-form-view").style.display = "flex";
    document.getElementById("zh-report-loading-view").style.display = "none";
    document.getElementById("zh-report-success-view").style.display = "none";
    overlay
      .querySelectorAll("input[type='checkbox']")
      .forEach((cb) => (cb.checked = false));
    overlay
      .querySelectorAll(".zh-report-textarea-container")
      .forEach((c) => c.classList.remove("expanded"));
    overlay
      .querySelectorAll(".zh-report-textarea")
      .forEach((ta) => (ta.value = ""));
    const submitBtn = document.getElementById("zh-report-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Gửi báo cáo";
    document.getElementById("zh-report-status").textContent = "";

    overlay.classList.add("zh-visible");
  }
}

function hideReportModal() {
  const overlay = document.getElementById("zh-report-overlay");
  if (overlay) {
    overlay.classList.remove("zh-visible");
  }
}
