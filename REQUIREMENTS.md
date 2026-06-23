# Yêu Cầu Bắt Buộc Của Dự Án (Strict Requirements)

Tài liệu này ghi lại những quy tắc và thiết lập cốt lõi của tiện ích mà **KHÔNG BAO GIỜ ĐƯỢC PHÉP THAY ĐỔI** trong bất kỳ lần nâng cấp hay chỉnh sửa nào sau này (trừ khi người dùng có yêu cầu bằng văn bản chỉ định rõ ràng việc thay đổi chúng).

## 1. Logic Tọa Độ và Hiển Thị (Hover Popup)

- **Khoảng cách đệm (Offset):** Luôn giữ khoảng cách chuẩn là `4px` giữa mép của popup và đối tượng ký tự đang được trỏ chuột.
- **Không che khuất ký tự cùng hàng:**
  - Vị trí ưu tiên theo chiều ngang của Popup luôn là `left = charRight - 8` (khi còn đủ chỗ bên phải màn hình) hoặc `left = charLeft - popupWidth + 8` (khi phải hiển thị sang bên trái).
  - Không được dùng bất cứ thuật toán "canh giữa" (center alignment) nào làm thay đổi logic này, vì việc canh giữa sẽ khiến popup đè lên các ký tự khác trên cùng một hàng văn bản đang đọc. Điều này đặc biệt quan trọng để người dùng có thể dễ dàng rê chuột tới các ký tự kế tiếp mà không bị popup chắn đường.

## 2. Màu Sắc Giao Diện (Color Theme)

- Các mã màu hiện tại (cả Light mode và Dark mode) đã được hiệu chỉnh chính xác theo nhu cầu người dùng.
- Đặc biệt, mã màu nền Dark Mode của các popup (Hover popup, Stroke popup, v.v.) phải luôn được thiết lập đồng bộ là `#1b1b1d` (hoặc `rgba(27, 27, 29, 0.96)`) cho nền và viền sáng dịu `rgba(255, 255, 255, 0.12)`.
- Tuyệt đối không tự ý thay đổi bảng màu, độ bo góc (`border-radius`), hay các lớp đổ bóng (`box-shadow`) có sẵn để giữ nguyên "Aesthetics" cao cấp của tiện ích.

## 3. Quản Lý Dữ Liệu Từ Điển

- Hệ thống luôn ưu tiên sử dụng `IndexedDB` làm cơ sở dữ liệu ngầm để lưu trữ từ điển, giúp tiết kiệm bộ nhớ RAM (0MB) ở chế độ chạy nền.
- Khi cập nhật cấu trúc dữ liệu, phải đảm bảo quá trình nâng cấp cơ sở dữ liệu trên máy khách diễn ra mượt mà và tự động dọn dẹp bộ nhớ cũ.
- Dữ liệu luôn sử dụng file chuẩn `.dat` thay vì `.json` ở môi trường production theo yêu cầu của Store (Google/Firefox).

## 4. Xử Lý Phát Âm Âm Thanh (Audio/TTS)

- Mọi logic liên quan đến phát âm (TTS) và WebSocket cần có fallback logic cụ thể cho trình duyệt Firefox (chạy trực tiếp trong Background Event Pages bằng `new Audio()` thay vì sử dụng API `chrome.offscreen` do Firefox không hỗ trợ).
- Hiệu ứng Fade out (giảm dần âm lượng trước khi dừng) khi bấm stop phải luôn được duy trì mượt mà và không gây gián đoạn.

## 5. Vùng đệm chuột (Bridge)

- Vùng đệm trong suốt (`::before`) kết nối giữa chữ cái và popup luôn phải duy trì diện tích đủ lớn (đặc biệt theo đường chéo) để con trỏ chuột không bị "rơi" ra ngoài khi di chuyển từ chữ cái sang popup.
