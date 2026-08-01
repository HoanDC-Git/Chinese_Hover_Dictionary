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

## 4. Xử Lý Phát Âm Âm Thanh (Audio/TTS)

- Mọi logic liên quan đến phát âm (TTS) và WebSocket cần có fallback logic cụ thể cho trình duyệt Firefox (chạy trực tiếp trong Background Event Pages bằng `new Audio()` thay vì sử dụng API `chrome.offscreen` do Firefox không hỗ trợ).
- Hiệu ứng Fade out (giảm dần âm lượng trước khi dừng) khi bấm stop phải luôn được duy trì mượt mà và không gây gián đoạn.

## 5. Vùng đệm chuột (Bridge)

- Vùng đệm trong suốt (`::before`) kết nối giữa chữ cái và popup luôn phải duy trì diện tích đủ lớn (đặc biệt theo đường chéo) để con trỏ chuột không bị "rơi" ra ngoài khi di chuyển từ chữ cái sang popup.

## 6. Đóng gói zip
- Đóng gói zip trong versions/VietZhong-v<version>.zip, version lấy trong file extension/manifest.json. chuyển các file json 1 dòng sau đó mới nén để giảm dung lượng.
- Chỉ nén khi được yêu cầu.

## 7. Quy tắc cấu trúc dữ liệu Hán tự

### 7.1. `extension/data/decompostion/details.json`
- **Mục đích:** Chứa các Hán tự phổ biến, thường là các chữ Hán có thể chiết tự (tách) ra thành các thành phần nhỏ hơn.
- **Quy tắc chiết tự (Decomposition):**
  - **Chỉ tách thành 1 bậc (Single-level decomposition):** Mỗi Hán tự chỉ được chiết tự thông qua 1 cấu trúc hình học duy nhất liên kết 2 (hoặc tối đa 3) thành phần trực tiếp tạo nên nó.
  - *Ví dụ:* Chữ 兹 được ghép từ `䒑` và `𢆶`, vì vậy chiết tự sẽ là `⿱䒑𢆶` (1 bậc). Tuyệt đối không chiết tự lồng ghép thành `⿱䒑⿰幺幺` (2 bậc) vì bản thân cụm bên dưới đã là một thành phần hợp nhất hình thành nên chữ đó.
  - **Kiểm tra tính toàn vẹn đến tận ngọn (Root Check):** Bất kỳ ký tự nào được sử dụng làm thành phần trong chuỗi `decomposition` thì bản thân nó cũng phải là một chữ đã được định nghĩa. Quá trình chiết tự phải có khả năng đệ quy (tách liên tục) cho đến khi tất cả các thành phần cuối cùng đều nằm trong danh sách các bộ thủ hoặc biến thể gốc của file `radicals.json`.
  - *Ví dụ:* Chữ 兹 tách ra `𢆶` thì `𢆶` phải tiếp tục có mặt trong hệ thống và được tách thành `⿰幺幺`. Lúc này `幺` là bộ thủ gốc trong `radicals.json`, quá trình phân tích ngọn ngành mới được tính là thành công.

### 7.2. `extension/data/decompostion/radicals.json`
- **Mục đích:** Lưu trữ các khối xây dựng cơ bản gốc (building blocks) của Hán tự.
- **Quy tắc cốt lõi:** Ký tự trong này phải là ký tự **KHÔNG THỂ tách nhỏ hơn nữa**. Bất kỳ ký tự nào còn có khả năng chiết tự (có decomposition) thì tuyệt đối không được đưa vào đây trừ trường hợp yêu cầu của người dùng.
- **Bao gồm:**
  - 214 Bộ thủ Khang Hy truyền thống.
  - Các chữ độc thể gốc (ngọn).
  - Các biến thể của bộ thủ (variants) (ví dụ: `丷` là biến thể của `八`).
  - Giản thể của bộ thủ.

### 7.3. `extension/data/decompostion/specials.json`
- **Mục đích:** Chuyên biệt lưu trữ các ký tự không thể hiển thị đúng ở bộ mã Unicode phổ biến (thường là các ký tự nằm trong vùng PUA - Private Use Area).
- **Đặc điểm:** Các ký tự trong file này thường không render được trên các font chữ mặc định, do đó cần được định nghĩa riêng kèm theo thông tin chiết tự (decomposition) để hệ thống biết cách mô phỏng lại nét vẽ hoặc hiển thị các font chữ nhúng (embedded fonts) khi cần. Không đưa các ký tự hiển thị bình thường vào file này.

### 7.4 `extension/data/dictionary.json`
- **Mục đích** Chứa các mục từ để sử dụng cho các chức năng hover popup, tra cứu, dịch nhanh
- **Đặc điểm** Gồm các thành phần gồm chữ Hán, pinyin, loại từ (động từ, danh từ, trạng từ,...), nghĩa tiếng Việt, nghĩa tiếng Anh, HSK level
- **Quy tắc** Một mục từ có thể có nhiều nghĩa, có thể gộp thành một trường nếu đáp ứng đủ các tiêu chí sau: cùng pinyin, các nghĩa có mối liên quan. Trong các trường hợp sau bắt buộc không được gộp: khác pinyin hoặc các nghĩa thể hiện hai tầng nghĩa không liên quan hoặc việc gộp khiến cho một trong các trường loại từ, nghĩa tiếng Việt, nghĩa tiếng Anh quá dài; HSK level là trường không bắt buộc. ngăn cách cách từ loại bằng "/" ví dụ : noun/verb; Ngăn cách các lớp nghĩa của cùng một từ loại bằng ",", nghĩa của khác từ loại bằng ";". Ví dụ: chữ 对 có từ loại là adjective/verb và nghĩa tương ứng correct, right; to face, to answer

### 7.5 `extension/data/t2s.json`
- **Mục đích** chứa danh sách chữ phồn thể và dạng giản thể để khi dịch tự động chuyển đổi linh hoạt giữa hai dạng
- **Quy tắc** dictionary.json và details.json sẽ không chứa từ dạng phồn thể. Khi xử lý một chữ ở dạng phồn thể, kiểm tra xem đã có chữ này và dạng giản thể trong t2s.json, dictionary.json, details.json chưa, thêm vào 3 file nếu chưa có, xóa các chữ dạng phồn thể trong 02 file dictionaryy.json và details.json, chỉ giữ lại phần mapping trong t2s.json. Khi xử lý một từ giản thể, kiểm tra xem chữ này có dạng phồn thể không. Nếu có và trong t2s.json chưa có mapping thì thêm vào.

## 8. Quy tắc về Thông tin Ngữ nghĩa (Meaning & Pinyin)
- **Tính xác thực:** Tuyệt đối không tự sáng tạo ra âm đọc (pinyin) hay ý nghĩa (meaning/definition) cho các ký tự không chắc chắn hoặc chỉ đóng vai trò là thành phần cấu trúc hình học thuần túy (ví dụ: `䒑`).
- **Cách xử lý:** Nếu một ký tự không có âm đọc hoặc ý nghĩa độc lập chuẩn xác trong từ điển, bắt buộc phải gán `pinyin: null` và `definition_vi: "Thành phần Hán tự"` (hoặc `null`).


## 9. Quy tắc Cập nhật Ký tự Đặc biệt (PUA)
- **Kiểm tra tác động chéo:** Trước khi thay đổi cấu trúc (decomposition) của một ký tự đặc biệt trong `specials.json`, BẮT BUỘC phải kiểm tra xem có bất kỳ Hán tự nào khác đang sử dụng ký tự này làm thành phần chiết tự hay không.
- **Xử lý:**
  - Nếu KHÔNG có chữ nào khác dùng: Được phép sửa trực tiếp hoặc xóa bỏ ký tự đó.
  - Nếu CÓ chữ khác dùng chung: Phải DỪNG LẠI và thông báo cho người dùng để kiểm tra thủ công, tuyệt đối không tự ý sửa đổi vì có thể làm hỏng chiết tự của hàng loạt chữ liên quan.

## 10. Quy tắc Viết Gợi ý (Hint)
- **Truy xuất ý nghĩa gốc:** Khi viết gợi ý (hint_vi) cho một chữ, phải căn cứ vào ý nghĩa thực sự của các thành phần con cấu tạo nên nó (đã được định nghĩa trong hệ thống). Không được tự ý gán nghĩa theo hình dáng bề ngoài nếu thành phần đó đã có nghĩa cụ thể.
  - *Ví dụ:* Chữ `圭` mang nghĩa là "ngọc khuê" (chứ không phải là "đất bùn" chỉ vì nó ghép từ hai chữ `土`).
- **Tránh nhắc đến mã/ký hiệu kỹ thuật:** Không được đưa các ký tự đặc tả bố cục (như `⿼`, `⿱`, `⿰`, v.v...) hoặc mã PUA vào trong câu chữ của gợi ý (hint), vì các ký hiệu này có thể gây lỗi font hoặc gây khó hiểu trên giao diện người dùng. Hãy dùng văn xuôi để mô tả sự sắp xếp (ví dụ: "ôm trọn lấy", "nằm bên trên", "bao bọc").
- **Ngắn gọn và gợi hình:** Các câu chuyện trong Gợi ý (hint) phải được viết súc tích, mang tính gợi hình cao để người học dễ dàng liên tưởng và ghi nhớ. Tuyệt đối tránh việc giải thích từ nguyên quá chi tiết, dông dài hoặc nhồi nhét các thông tin học thuật thừa thãi làm loãng trọng tâm của người đọc.
