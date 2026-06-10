// Call Edge TTS via background script message passing
async function speakWord(word, buttonElement) {
  if (buttonElement) {
    buttonElement.classList.add("zh-loading");
  }

  try {
    console.log("Yêu cầu phát âm từ vựng:", word);
    // Send message to background service worker to synthesize and play speech
    chrome.runtime.sendMessage({ action: "speak", text: word }, (response) => {
      if (buttonElement) {
        buttonElement.classList.remove("zh-loading");
      }

      if (chrome.runtime.lastError) {
        console.error(
          "Lỗi giao tiếp Extension (runtime.lastError):",
          chrome.runtime.lastError.message,
        );
      } else if (!response) {
        console.error(
          "Lỗi phát âm Edge TTS: Không nhận được phản hồi từ background service worker.",
        );
      } else if (response.error) {
        console.error(
          "Lỗi phát âm Edge TTS (phía Background/Offscreen):",
          response.error,
        );
      } else {
        console.log("Phát âm Edge TTS thành công:", word);
      }
    });
  } catch (err) {
    if (buttonElement) {
      buttonElement.classList.remove("zh-loading");
    }
    if (err.message && err.message.includes("context invalidated")) {
      alert(
        "Tiện ích mở rộng đã được cập nhật. Vui lòng tải lại (F5) trang này để tiếp tục sử dụng tính năng phát âm!",
      );
    } else {
      console.error("Lỗi hệ thống khi phát âm:", err);
    }
  }
}
