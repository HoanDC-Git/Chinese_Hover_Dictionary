window.VZ = window.VZ || {};
window.VZ.services = window.VZ.services || {};

window.VZ.services.tts = (function() {
  async function speakWord(word, buttonElement) {
    if (buttonElement) {
      buttonElement.classList.add("zh-loading");
    }

    try {
      console.log("Yêu cầu phát âm từ vựng:", word);
      chrome.runtime.sendMessage({ action: "speak", text: word }, (response) => {
        if (buttonElement) {
          buttonElement.classList.remove("zh-loading");
        }

        if (chrome.runtime.lastError) {
          console.error("Lỗi giao tiếp Extension:", chrome.runtime.lastError.message);
        } else if (!response) {
          console.error("Lỗi phát âm Edge TTS: Không nhận được phản hồi.");
        } else if (response.error) {
          console.error("Lỗi phát âm Edge TTS:", response.error);
        } else {
          console.log("Phát âm Edge TTS thành công:", word);
        }
      });
    } catch (err) {
      if (buttonElement) buttonElement.classList.remove("zh-loading");
      if (err.message && err.message.includes("context invalidated")) {
        alert("Tiện ích mở rộng đã được cập nhật. Vui lòng tải lại (F5) trang này để tiếp tục sử dụng tính năng phát âm!");
      } else {
        console.error("Lỗi hệ thống khi phát âm:", err);
      }
    }
  }

  return { speakWord };
})();
