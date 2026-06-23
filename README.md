# VietZhong - Từ điển tiếng Trung (Hover Dictionary)

**VietZhong** là một tiện ích mở rộng (Extension) dành cho trình duyệt Chrome, Edge và Firefox, giúp bạn tra cứu từ vựng tiếng Trung (giản thể & phồn thể) một cách nhanh chóng và tiện lợi nhất. Chỉ cần di chuột qua bất kỳ ký tự tiếng Trung nào trên trang web, một popup hiện đại sẽ lập tức hiển thị Pinyin, Hán Việt, và nghĩa chi tiết (Việt/Anh).

## Tính năng nổi bật

*   **Tra cứu bằng cách di chuột (Hover-to-Translate):** Không cần bôi đen hay click, chỉ cần di chuột qua chữ Hán. Popup từ điển sẽ xuất hiện mượt mà ngay bên cạnh chữ đó.
*   **Dữ liệu phong phú:** Cung cấp Pinyin chuẩn, cấp độ HSK, và nghĩa chi tiết bằng cả tiếng Việt và tiếng Anh.
*   **Phát âm giọng thực (Edge TTS):** Nghe phát âm chuẩn giọng người bản xứ thông qua hệ thống Text-to-Speech chất lượng cao của Microsoft Edge, bao gồm cả khả năng điều chỉnh tốc độ nói.
*   **Hiệu suất siêu tốc:** Sử dụng công nghệ **IndexedDB** giúp tải và truy xuất hàng chục ngàn từ vựng ngoại tuyến gần như tức thì mà không tiêu tốn tài nguyên bộ nhớ (RAM).
*   **Giao diện cao cấp (Glassmorphism):** Thiết kế popup hiện đại với hiệu ứng kính mờ (backdrop-filter), tự động tương thích hoàn hảo với giao diện Sáng/Tối (Light/Dark mode) của hệ thống. 
*   **Vùng đệm thông minh:** Popup được thiết kế kèm vùng đệm ẩn giúp bạn dễ dàng di chuột từ chữ cái vào bên trong popup để tương tác (nghe phát âm) mà popup không bị biến mất.

## Cách cài đặt (Dành cho nhà phát triển / Bản giải nén)

Vì tiện ích này chưa được tải lên Cửa hàng Chrome trực tuyến (Chrome Web Store), bạn có thể cài đặt thủ công thông qua chế độ Developer Mode:

### Dành cho Google Chrome / Microsoft Edge / Cốc Cốc:
1. Tải về máy phiên bản file `.zip` mới nhất của tiện ích.
2. Giải nén file `.zip` vào một thư mục trên máy tính.
3. Mở trình duyệt, truy cập vào trang quản lý tiện ích:
   * Chrome: `chrome://extensions/`
   * Edge: `edge://extensions/`
4. Bật chế độ **"Developer mode"** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
5. Nhấn vào nút **"Load unpacked"** (Tải tiện ích đã giải nén) và chọn thư mục `extension` (hoặc thư mục bạn vừa giải nén).

### Dành cho Mozilla Firefox:
1. Tải và giải nén file `.zip` như trên.
2. Mở Firefox, truy cập vào: `about:debugging#/runtime/this-firefox`
3. Nhấn vào nút **"Load Temporary Add-on..."** (Tải Tiện ích Tạm thời...).
4. Tìm đến thư mục bạn vừa giải nén và chọn file `manifest.json`.

## Cách sử dụng

1. Sau khi cài đặt, bạn sẽ thấy biểu tượng chữ **译** (Dịch) xuất hiện ở thanh công cụ góc trên bên phải của trình duyệt.
2. Truy cập vào bất kỳ trang web nào có văn bản tiếng Trung (ví dụ: Weibo, Baidu, các trang đọc truyện chữ...).
3. Nhấp vào biểu tượng tiện ích để bật (chuyển sang màu đỏ) hoặc tắt (chuyển sang màu xám).
4. Di chuột qua một chữ Hán trên trang web và tận hưởng trải nghiệm!

## Cấu trúc thư mục mã nguồn

*   `extension/`: Thư mục chính chứa mã nguồn của tiện ích.
    *   `manifest.json`: Tệp cấu hình bắt buộc cho mọi trình duyệt.
    *   `background/`: Script chạy ngầm, quản lý vòng đời, cập nhật dữ liệu vào IndexedDB và xử lý âm thanh Edge TTS.
    *   `content/`: Script chạy trực tiếp trên trang web, bắt sự kiện di chuột và bôi đen chữ Hán.
    *   `modules/`: Các module tái sử dụng, chia nhỏ logic để dễ quản lý.
    *   `css/`: Định dạng giao diện popup (Light/Dark theme, hiệu ứng mờ).
    *   `icons/`: Các biểu tượng trạng thái bật/tắt của tiện ích.

## Yêu cầu đối với lập trình viên (REQUIREMENTS.md)

Các thông số về trải nghiệm người dùng cốt lõi (tọa độ popup, logic chọn vị trí tránh che khuất, màu sắc...) được quy định nghiêm ngặt trong file `REQUIREMENTS.md`. Nếu muốn đóng góp vào dự án, vui lòng tham khảo file này trước khi thay đổi các giá trị mặc định.
