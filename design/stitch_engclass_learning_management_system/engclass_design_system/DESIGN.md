---
name: EngClass Design System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#464555'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#9d4300'
  on-secondary: '#ffffff'
  secondary-container: '#fd761a'
  on-secondary-container: '#5c2400'
  tertiary: '#005338'
  on-tertiary: '#ffffff'
  tertiary-container: '#006e4b'
  on-tertiary-container: '#67f4b7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#ffdbca'
  secondary-fixed-dim: '#ffb690'
  on-secondary-fixed: '#341100'
  on-secondary-fixed-variant: '#783200'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 3rem
    fontWeight: '700'
    lineHeight: 3.75rem
    letterSpacing: -0.025em
  headline-lg:
    fontFamily: Inter
    fontSize: 2.25rem
    fontWeight: '700'
    lineHeight: 2.75rem
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: '700'
    lineHeight: 2.25rem
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '400'
    lineHeight: 1.75rem
  body-md:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: 1.5rem
  body-sm:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '400'
    lineHeight: 1.25rem
  label-lg:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: '600'
    lineHeight: 1.25rem
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 0.75rem
    fontWeight: '600'
    lineHeight: 1rem
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 0.6875rem
    fontWeight: '500'
    lineHeight: 0.875rem
    letterSpacing: 0.025em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

Hệ thống thiết kế này phục vụ nền tảng học tập trực tuyến (LMS) và phiếu bài tập tương tác (interactive worksheets) dành riêng cho giáo viên và học sinh tại Việt Nam.

### Tính cách thương hiệu
- **Hiện đại và Thân thiện (Modern & Approachable):** Giảm thiểu áp lực học tập bằng giao diện sáng sủa, ấm áp, giàu tính tương tác và dễ tiếp cận cho cả học sinh nhỏ tuổi lẫn giáo viên trung niên.
- **Tập trung và Hiệu quả (Focused & Productive):** Không gian lớp học và công cụ làm bài tập được tinh gọn, hỗ trợ tối đa việc giảng dạy ngữ pháp, từ vựng và luyện tập bốn kỹ năng tiếng Anh (Nghe, Nói, Đọc, Viết).
- **Đáng tin cậy và Sôi nổi (Trustworthy yet Energetic):** Kết hợp nền tảng xanh chàm (Indigo) vững chãi với các điểm nhấn cam rực rỡ để kích thích sự hào hứng, tính chủ động và cảm giác đạt thành tích.

### Phong cách thiết kế
Giao diện kết hợp giữa **Modern Clean EdTech** và **Tactile/Card-based UI**:
- Sử dụng các khối thẻ trắng mềm mại trên nền xám sáng nhạt (`#F8FAFC`).
- Viền mảnh mờ tinh tế kết hợp đổ bóng phân tầng cực êm (soft ambient shadows), tạo cảm giác bề mặt nổi nhẹ nhàng, mời gọi click và kéo thả (drag & drop) bài tập.
- Huy hiệu (badges), nhãn đánh giá và nút công cụ mang tính tương tác xúc giác cao, phản hồi trực quan rõ ràng bằng tiếng Việt.

## Colors

Bảng màu được xây dựng dựa trên tiêu chuẩn tương phản WCAG 2.1 AA/AAA, tối ưu hóa cho màn hình giảng dạy trong lớp học và học tập cá nhân tại nhà.

### Bảng màu cốt lõi
- **Primary (Xanh Chàm - Indigo):** `#4F46E5` (Active: `#4338CA`, Hover: `#3B82F6`). Đại diện cho không gian lớp học chính quy, các thanh điều hướng, nút hành động chính (Nộp bài, Bắt đầu làm bài, Xuất bản bài giảng).
- **Secondary (Cam Năng Lượng - Amber Orange):** `#F97316` (Deep: `#EA580C`, Light Tint: `#FFEDD5`). Dùng cho điểm nhấn khích lệ học tập, huy hiệu thành tích, đồng hồ bấm giờ (timer), streak luyện tập và thẻ điểm số.
- **Tertiary (Xanh Lá Khích Lệ - Success Mint):** `#10B981`. Dùng cho phản hồi câu trả lời đúng, trạng thái hoàn thành bài học, tỷ lệ điểm đạt.
- **Neutral (Slate Gray):** `#64748B` cho text phụ trợ, `#0F172A` cho văn bản chính để đạt độ tương phản cao tuyệt đối trên nền trắng.

### Bề mặt & Nền
- Nền trang (Canvas): `#F8FAFC`
- Nền thẻ học tập / Bảng tương tác (Surface): `#FFFFFF`
- Viền mỏng phân tách (Border/Divider): `#E2E8F0`
- Nền khối bài tập nghe / Đọc hiểu (Container Level 1): `#F1F5F9`
- Trạng thái báo lỗi câu trả lời sai: `#EF4444` với nền nhạt `#FEF2F2`

## Typography

Bộ chữ **Inter** được áp dụng toàn diện nhờ khả năng hiển thị dấu thanh tiếng Việt (diacritics) chuẩn xác, chiều cao x-height lớn giúp tối ưu khả năng đọc bài tập dài và các đoạn hội thoại tiếng Anh kèm chú giải tiếng Việt.

### Quy tắc triển khai
- **Ngôn ngữ hiển thị:** Toàn bộ nhãn hệ thống (System labels), thông báo và chỉ dẫn thao tác sử dụng tiếng Việt tiêu chuẩn (ví dụ: *Phiếu bài tập số 03*, *Nộp bài*, *Học sinh đang trực tuyến*, *Đáp án chính xác*).
- **Văn bản bài thi / Đọc hiểu:** Dùng `body-lg` với `lineHeight: 1.75rem` nhằm giãn dòng thoải mái cho mắt học sinh, ngăn ngừa tình trạng mỏi mắt khi làm bài tập trực tuyến liên tục.
- **Tiêu đề số bài:** `headline-md` hoặc `headline-sm` luôn đi kèm trọng lượng `fontWeight: 600` để phân cấp rõ ràng cấu trúc bài học.

## Layout & Spacing

Hệ thống layout tối ưu hóa trải nghiệm giáo viên và học sinh trên màn hình máy tính bàn, laptop và máy tính bảng trong lớp học.

### Mô hình bố cục (Grid System)
- **Desktop (1024px trở lên):** Hệ thống 12 cột linh hoạt (fluid grid) với `max-width: 1440px`. Lề trang chuẩn `margin: 2rem` và khoảng hở cột `gutter: 1.5rem`.
  - Cột điều hướng bài học (Sidebar): 3 cột cố định hoặc có thể thu gọn.
  - Vùng làm bài tương tác (Worksheet Canvas): 6 đến 7 cột trung tâm rộng rãi.
  - Bảng hỗ trợ / Từ điển / Chat lớp học: 2 đến 3 cột phụ trợ bên phải.
- **Tablet (768px - 1023px):** Lưới 8 cột, thanh công cụ chuyển thành dạng cuộn ngang hoặc thanh bottom floating bar.
- **Mobile (< 768px):** Lưới 4 cột, `margin: 1rem`, các khối câu hỏi xếp chồng theo chiều dọc một cột duy nhất (single-column flow).

### Nhịp điệu khoảng cách (Spatial Rhythm)
- Các phần tử tương tác liền kề trong câu hỏi (khoảng cách giữa các ô điền từ, nút nghe audio): `space-sm` (8px) đến `space-md` (16px).
- Khoảng cách giữa các câu hỏi độc lập trong phiếu bài tập: `space-xl` (40px) để tạo sự phân tách nhận thức rõ ràng cho học sinh.

## Elevation & Depth

Giao diện áp dụng cơ chế chiều sâu đa tầng mềm mại (Soft Multi-tier Depth) kết hợp viền mỏng chống bệt màu.

### Các tầng cao độ
- **Mức nền 0 (Background):** `#F8FAFC`, hoàn toàn phẳng.
- **Mức bề mặt 1 (Cards, Worksheets):** Nền `#FFFFFF`, viền `1px solid #E2E8F0`, đổ bóng:
  `box-shadow: 0 1px 3px 0 rgba(15, 23, 42, 0.04), 0 1px 2px -1px rgba(15, 23, 42, 0.04)`.
- **Mức tương tác nổi 2 (Hover cards, Active questions, Menus):** Nền `#FFFFFF`, viền `1px solid #CBD5E1`, đổ bóng ấm áp pha sắc xanh:
  `box-shadow: 0 10px 25px -5px rgba(79, 70, 229, 0.08), 0 8px 10px -6px rgba(15, 23, 42, 0.03)`.
- **Mức thanh công cụ (Classroom Sticky Toolbar):** Nền trắng mờ đục với hiệu ứng kính nhẹ (`backdrop-filter: blur(12px); background-color: rgba(255, 255, 255, 0.9)`), viền đáy `#E2E8F0` và đổ bóng mềm:
  `box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05)`.
- **Mức cửa sổ modal / Hộp thoại kết quả:** Đổ bóng sâu với viền mềm:
  `box-shadow: 0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 10px 10px -5px rgba(15, 23, 42, 0.04)`.

## Shapes

Hệ thống sử dụng ngôn ngữ bo góc lớn, thân thiện và năng động để xua tan cảm giác hình thức, khô khan của các bài kiểm tra truyền thống.

### Quy tắc áp dụng góc bo
- **Khối phiếu bài tập lớn & Khung nội dung (Main Panels, Cards):** `rounded-2xl` (1.5rem / 24px) tạo cảm giác như một mặt giấy vẽ thông minh hoặc bảng tương tác cao cấp.
- **Thanh công cụ giáo viên, Hộp câu hỏi con:** `rounded-xl` (1rem / 16px).
- **Nút bấm (Buttons), Ô nhập từ (Input Fields), Thẻ câu hỏi trắc nghiệm:** Bo tròn `rounded-xl` (0.75rem - 1rem / 12px - 16px) đem lại trải nghiệm chạm thân thiện.
- **Huy hiệu điểm số (Badges), Thẻ đếm thời gian (Timers), Nhãn phân loại kỹ năng:** Sử dụng dạng viên thuốc hoàn chỉnh `rounded-full` (9999px).

## Components

### 1. Nút bấm (Buttons)
- **Nút chính (Primary - "Nộp bài", "Bắt đầu làm bài"):** Nền `#4F46E5`, chữ trắng `#FFFFFF`, góc bo `rounded-xl`, chiều cao 44px (chuẩn Desktop) và 48px (Touch). Trạng thái hover đổi sang `#4338CA` kèm hiệu ứng nâng nhẹ `translate-y-[-1px]`.
- **Nút phụ (Secondary - "Xem lời giải", "Làm lại"):** Nền trắng, viền `1.5px solid #E2E8F0`, chữ `#0F172A`. Hover: viền `#CBD5E1`, nền `#F8FAFC`.
- **Nút khích lệ / Kêu gọi đặc biệt (Accent - "Đổi quà", "Nhận thưởng"):** Nền `#F97316`, chữ trắng. Hover: `#EA580C`.

### 2. Thẻ câu hỏi & Phiếu bài tập (Interactive Worksheet Cards)
- Thẻ câu hỏi độc lập được bọc trong nền trắng với viền `1px solid #E2E8F0` và bo góc `rounded-2xl`.
- Trạng thái khi học sinh đang trả lời (Focus State): Viền chuyển sang màu `#4F46E5` dày 2px cùng vòng sáng nhẹ `ring-4 ring-indigo-50`.
- Hiển thị kết quả: Nền chuyển thành `#F0FDF4` viền `#86EFAC` cho đáp án đúng, `#FEF2F2` viền `#FCA5A5` cho đáp án sai.

### 3. Huy hiệu & Thẻ trạng thái (Badges & Chips)
- Luôn hiển thị chữ in đậm vừa `label-md` với bo tròn `rounded-full` và padding `4px 12px`.
- **Kỹ năng Tiếng Anh:**
  - *Reading (Đọc):* Nền xanh lơ nhạt `#E0F2FE`, chữ `#0369A1`.
  - *Listening (Nghe):* Nền tím nhạt `#EDE9FE`, chữ `#6D28D9`.
  - *Speaking (Nói):* Nền cam nhạt `#FFEDD5`, chữ `#C2410C`.
  - *Writing (Viết):* Nền ngọc bích nhạt `#DCFCE7`, chữ `#15803D`.
- **Trạng thái phiếu bài tập:** "Chưa nộp" (xám), "Đang chấm" (vàng cam), "Hoàn thành" (xanh lá).

### 4. Ô điền từ & Khối trắc nghiệm (Inputs & Quiz Choices)
- **Ô điền khuyết (Fill-in-the-blank):** Ô input inline nằm ngay trong câu văn, viền đáy đậm hoặc viền hộp bo góc `rounded-lg`, nền trắng `#FFFFFF`. Font chữ rõ ràng, tự động căn giữa chữ điền.
- **Thẻ lựa chọn trắc nghiệm (A/B/C/D):** Các thẻ lớn nằm tách biệt, có chữ cái đại diện bo tròn bên trái. Nhấn chọn sẽ đổi màu nền sang `#EEF2FF`, viền `#4F46E5`.

### 5. Thanh công cụ giáo dục (Educational Toolbar)
- Cố định ở đầu hoặc đáy không gian làm bài: Chứa bộ đếm thời gian (Đồng hồ đếm ngược với icon màu `#F97316`), thanh tiến độ bài thi (Progress Bar màu `#4F46E5` bo tròn), nút phóng to bài giảng, và menu danh sách câu hỏi để nhảy nhanh đến câu chưa làm.