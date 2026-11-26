# Pivora — Nền tảng LMS Đa môn học & Khảo thí tương tác

Nền tảng LMS dành cho giáo viên, học sinh, phụ huynh và quản trị viên, hỗ trợ giảng dạy **11 môn học** (Tiếng Anh, Toán, Vật lý, Hóa học, Sinh học, Ngữ văn, Lịch sử, Địa lý, GDCD, Tin học, Chung): **Worksheet PDF tương tác** (Overlay trên PDF, Phiếu trả lời nhanh, hoặc kết hợp A + B), **tự động tạo bài điền từ từ file Word (`.docx`)**, **Công thức toán LaTeX/KaTeX**, **Chế độ Đọc hiểu chia đôi màn hình**, **Chế độ tập trung 1 câu/màn hình**, **File nghe giới hạn số lần nghe**, **Chép chính tả chấm theo % số từ đúng**, **Chấm Rubric & Chấm theo câu / Ẩn danh**, **Gia hạn & giao bài theo nhóm học sinh**, **Lưu tạm ngoại tuyến (Offline Draft)**, **Cổng Phụ huynh**, và **Chống gian lận 2 lớp (Trình duyệt + Camera AI)**.

Tên hiển thị sản phẩm đổi được qua biến môi trường `NEXT_PUBLIC_APP_NAME` (mặc định: `Pivora`). Hỗ trợ chuyển đổi nhanh giao diện **Sáng / Tối (Light / Dark)** và **Tiếng Việt / Tiếng Anh (VI / EN)**.

---

## Tính năng chính

### 1. Worksheet Studio, Đa môn học, Tạo từ Word & Chia sẻ / Backup
- **Hỗ trợ 11 môn học:** Tiếng Anh, Toán, Vật lý, Hóa học, Sinh học, Ngữ văn, Lịch sử, Địa lý, GDCD, Tin học, và Chung — tự động phân loại & gợi ý công cụ phù hợp cho từng môn.
- **3 chế độ biên tập:** Chế độ A (vẽ ô nhập trực tiếp trên PDF với toạ độ chuẩn hoá `0..1`, kéo/resize bằng `react-rnd`, bám lưới, căn hàng nhiều ô), Chế độ B (Phiếu trả lời + nhập đáp án hàng loạt), hoặc kết hợp A + B.
- **11 loại câu hỏi:** `TEXT` (điền từ), `NUMBER`, `MULTIPLE_CHOICE`, `MULTI_SELECT`, `TRUE_FALSE`, `TRUE_FALSE_GROUP` (nhóm Đúng/Sai nhiều ý), `DROPDOWN`, `CHECKBOX`, `ESSAY` (tự luận hỗ trợ thang Rubric), `DICTATION` (Chép chính tả), và `PHOTO_UPLOAD` (học sinh chụp/tải ảnh bài làm giấy + hỗ trợ chấm Rubric).
- **Công thức Toán học & Ký hiệu khoa học (KaTeX):** Render trực tiếp LaTeX `$...$` và `$$...$$` trong đề bài, đoạn văn đọc hiểu, lựa chọn đáp án và giải thích chi tiết.
- **Đoạn văn Đọc hiểu (Passages) & Chế độ Focus Mode:** Gắn đoạn đọc hiểu vào từng nhóm câu hỏi (hiển thị dạng chia đôi hoặc thẻ đọc hiểu) và bật **"Hiển thị từng câu một trên màn hình"** (hoặc preset **Bài học thuộc**) để gộp các ô trống `7a`, `7b` về đúng 1 câu hoàn chỉnh, nhấn `Enter` sang ô/câu kế tiếp.
- **Tự động tạo bài điền từ từ file Word (`.docx`) / văn bản:**
  - Giáo viên soạn bài trong Word theo cú pháp gạch dưới kép `__đáp án__`, hỗ trợ nhiều đáp án đúng ngăn cách bằng dấu `/` hoặc `|`, ví dụ:
    ```text
    Câu 1: How many __planets are there in the universe/stars are there in the universe__?
    Câu 2: (1) __Find a hill__. Climb __a hill so that you can see over the top of the trees__.
    ```
  - Hệ thống tự động loại bỏ đánh số trùng (`Câu 1: 1.`), chuẩn hoá khoảng trắng, tách nhiều chỗ trống trong cùng 1 câu thành `2a`, `2b` và hiển thị xem trước trước khi lưu.
  - Có sẵn nút **Tải file Word mẫu (`.docx`)** ngay trong hộp thoại nhập.
- **Backup, Export & Chia sẻ giáo viên:**
  - **Xuất gói Backup đầy đủ (`.engclass.zip`):** Đóng gói toàn bộ phiếu (câu hỏi, Rubric, đáp án, cấu hình chấm, đoạn văn, file PDF và tất cả file nghe MP3/WAV) để sao lưu hoặc gửi cho đồng nghiệp.
  - **Sao lưu toàn bộ thư viện (`Sao lưu tất cả .zip`):** Xuất tất cả worksheet của giáo viên trong một file `.zip` duy nhất.
  - **Xuất file Word (`.docx`):** Chọn xuất **bản có đáp án** (giữ nguyên định dạng `__đáp án__` + bảng đáp án cuối bài) hoặc **bản đề học sinh** (chỉ chỗ trống để in ấn).
  - **Nhập Backup 1 chạm:** Hỗ trợ nhập `.engclass.zip`, file backup toàn thư viện `.zip`, `.json`, `.docx` hoặc `.txt`.
  - **Chia sẻ trực tiếp giữa các giáo viên trong hệ thống:** Bật công tắc **Chia sẻ GV** trên bất kỳ phiếu nào để giáo viên khác xem trong tab **Giáo viên khác chia sẻ**, **Sao chép về kho của mình (Clone)** (sao chép đủ PDF + audio + câu hỏi) hoặc **Giao trực tiếp cho lớp mình**.

### 2. Bài nghe (Listening), Giới hạn số lần nghe & Chép chính tả (`DICTATION`)
- **Quản lý file nghe ngay trong Worksheet:** Tải lên nhiều file âm thanh (`MP3`, `WAV`, `OGG`, `M4A`, `WebM`) và gắn trực tiếp vào từng câu hỏi nếu cần.
- **Cấu hình phát âm thanh theo từng lần giao bài:**
  - Mặc định: **nghe không giới hạn, cho phép dừng (Pause), cho phép tua (Seek)**.
  - Giáo viên tích chọn nếu muốn siết chặt cho bài kiểm tra: **Giới hạn số lần nghe** (1–20 lần/file), **Không cho dừng**, **Không cho tua**.
  - **Bảo mật lượt nghe ở server:** Mỗi lần bấm phát gọi `POST /api/submissions/:id/audio/:audioId/play` kiểm tra trong transaction và cấp token ký HMAC ngắn hạn cho route stream. Học sinh không thể tải file trực tiếp qua `/api/files/*`, reload trang vẫn giữ đúng số lượt đã nghe.
  - **Quy tắc reset lượt nghe:** Lượt làm bài mới (`Attempt` mới) được nghe lại đủ số lần từ đầu; riêng trường hợp bị `RESTART` do vi phạm thì **không** được nghe thêm.
- **Chấm Chép chính tả (`DICTATION`) tự động theo từng từ:**
  - Dùng thuật toán so khớp **Levenshtein mức từ**, mặc định chấm theo **% số từ đúng** (ví dụ đúng 8/10 từ của câu 2 điểm được `1,6` điểm; có chống gian lận nhồi từ thừa) hoặc chọn chế độ đúng hết mới có điểm.
  - Hiển thị đối chiếu tô màu từng từ: **xanh** (đúng), **đỏ** (sai kèm đáp án chuẩn khi được phép mở), **gạch ngang** (từ thừa), **`[ngoặc]`** (từ thiếu).
  - Luôn chặn dán, kéo thả và tắt kiểm tra chính tả/tự sửa/Grammarly trên ô nhập. Không bao giờ lộ `transcript` trước khi nộp hoặc khi học sinh còn lượt làm tiếp.

### 3. Số lượt làm bài & Chặn Copy/Paste nâng cao
- **Số lượt làm bài linh hoạt:** Chọn giới hạn `1–50` lượt hoặc tích **Không giới hạn lượt làm (`∞`)**.
- **Chặn Copy/Paste hoạt động độc lập (dùng được cả khi tắt chế độ thi):**
  - Chặn `copy`, `cut`, `paste`, menu chuột phải, phím tắt `Ctrl/Cmd + C/V/X/P/U/A`.
  - Chặn **kéo thả (`drop` / `dragover` / `dragstart`)** (ngăn kéo script từ cửa sổ Google Drive sang).
  - Chặn ở tầng `beforeinput` (`insertFromPaste`, `insertFromDrop`, `insertFromYank`, `insertReplacementText`).
  - Tắt `spellCheck`, `autoComplete`, `autoCorrect`, `autoCapitalize` và Grammarly (`data-gramm="false"`) trên ô nhập liệu.
  - Phát hiện dán gián tiếp (`PASTE_SUSPECTED` — chỉ gắn cờ nghi vấn, không tự khoá bài).
  - Có sẵn 2 preset nhanh khi giao bài: **Preset: Chép chính tả** và **Preset: Học thuộc (1 câu/màn + Khoá màn)**.

### 4. Chống gian lận 2 lớp (Trình duyệt + Camera AI)
- **Lớp 1 — Giám sát trình duyệt:**
  - 4 mức độ: `OFF`, `MONITOR`, `LOCKDOWN`, `SEB` (kiểm tra header `X-SafeExamBrowser-ConfigKeyHash`).
  - 4 hành động xử lý ở server trong cùng transaction: `WARN`, `LOCK`, `RESTART` (xoá đáp án, tăng `attemptVersion` chặn autosave cũ, giữ nguyên đồng hồ), `AUTO_SUBMIT`.
  - Màn hình nội quy bắt buộc `/student/assignments/[id]/rules` lưu `rulesAcceptedAt`.
  - Phòng giám sát trực tiếp `/teacher/assignments/[id]/live` qua **SSE realtime** (toast + chuông cảnh báo, timeline, thao tác Nhắc nhở / Mở khoá / Khoá / Thu bài / Đánh dấu nghi vấn).
- **Lớp 2 — Giám sát bằng Camera AI (Webcam):**
  - Sử dụng [`@mediapipe/tasks-vision`](https://github.com/google-ai-edge/mediapipe) (`FaceLandmarker` + `ObjectDetector` EfficientDet-Lite0), chạy **100% cục bộ trên trình duyệt** (WASM + WebGL/GPU tự động fallback CPU) — **không stream video lên server**.
  - Bộ runtime WASM và 2 file model (~8 MB) được tự động copy/tải vào `public/mediapipe/` trong bước `postinstall` để tự host (chạy tốt cả trong mạng LAN).
  - Các sự kiện phát hiện (kèm 3 giây hiệu chuẩn tư thế đầu giờ, bộ lọc debounce & cooldown 15 giây mặc định):
    - `CAMERA_NO_FACE`: không thấy mặt liên tục ≥ 3 giây.
    - `CAMERA_MULTI_FACE`: có từ 2 khuôn mặt trở lên ≥ 1,5 giây.
    - `CAMERA_LOOK_AWAY`: quay ngang > 25° hoặc cúi đầu > 20° liên tục ≥ 2,5 giây (luôn ở mức *nghi vấn*, không tự khoá để tránh báo nhầm khi viết nháp).
    - `CAMERA_PHONE`: phát hiện điện thoại (`cell phone` ≥ 0,35 trong 2 khung hình liên tiếp).
    - `CAMERA_OFF`: tắt/rút/chặn camera — luôn che đề thi và ghi nhận vi phạm.
  - Mặc định các sự kiện AI chỉ đánh dấu **nghi vấn** (`cameraEnforce = false`); giáo viên có thể bật `cameraEnforce` nếu muốn tính vào ngưỡng vi phạm.
  - **Quyền riêng tư (Nghị định 13/2023):** Bước kiểm tra camera + hộp đồng ý xử lý hình ảnh riêng trên trang nội quy (lưu `cameraConsentAt`); ảnh bằng chứng nhỏ `320×240` JPEG (≤ 120 KB) chỉ giáo viên lớp được xem (và phụ huynh nếu bật chia sẻ), tự động xoá định kỳ sau 30 ngày bằng `pnpm proctor:purge-snapshots`.
  - *Lưu ý:* Trình duyệt chỉ cho phép bật webcam trên **HTTPS** (hoặc `localhost`). Khi dùng chung với Safe Exam Browser (SEB), cần bật quyền camera trong cấu hình `.seb`.

### 5. Lớp học, Giao bài linh hoạt, Chấm nâng cao, Trải nghiệm làm bài & Admin
- **Lớp học & Tham gia nhanh:** Quản lý lớp học, mã tham gia 6 ký tự, **mã QR & link mời vào lớp**, duyệt học sinh, import danh sách từ Excel, bảng tin, bài giảng đa phương tiện (PDF/Video/YouTube/Audio/Link).
- **Giao bài linh hoạt & Nhắc hạn tự động:**
  - Giao cho **cả lớp hoặc chọn đích danh từng học sinh** (phân hóa theo nhóm, kiểm tra bù).
  - **Điều chỉnh / Gia hạn riêng từng học sinh (`Override`):** Cho phép mở rộng hạn nộp, cộng thêm thời gian làm bài hoặc cấp thêm lượt làm bài cho từng cá nhân mà không ảnh hưởng cả lớp.
  - **Thang điểm quy đổi & Hệ số:** Cấu hình thang quy đổi (`Thang 10`, `Thang 100`, `IELTS 0–9.0`, `Điểm gốc`) và hệ số điểm (`×1`, `×2`, `×3`…) ngay khi giao bài; tự động gửi thông báo nhắc trước hạn 24h cho học sinh chưa nộp.
- **Chấm điểm nâng cao:**
  - Đồng hồ server, tự nộp khi hết giờ, chấm tự động + chấm tay câu tự luận (`ESSAY`) & ảnh chụp bài làm (`PHOTO_UPLOAD`).
  - **Chấm theo tiêu chí (`Rubric`):** Chia câu tự luận thành nhiều tiêu chí có điểm tối đa riêng, tự cộng tổng và hiển thị chi tiết từng tiêu chí cho học sinh sau khi công bố.
  - **Chấm theo câu (`Grade by Question`) & Chấm ẩn danh (`Blind Grading`):** Chấm lần lượt toàn bộ bài nộp cho cùng một câu hỏi trên một màn hình, bật chế độ ẩn tên học sinh để tránh thiên vị, kèm **Ngân hàng nhận xét nhanh** (`Comment Presets`).
  - Thống kê tỉ lệ đúng từng câu & đáp án sai phổ biến, xuất Excel bảng điểm (`exceljs`).
- **Trải nghiệm làm bài tin cậy:**
  - **Lưu tạm ngoại tuyến (`Offline Queue`):** Tự động lưu bản nháp câu trả lời vào máy khi mất mạng và đồng bộ lại ngay khi có kết nối.
  - **Gắn cờ xem lại (Flag):** Đánh dấu các câu chưa chắc chắn, bộ lọc "Đã gắn cờ / Chưa trả lời" và giữ trạng thái cờ qua lần tải lại trang.
- **Bảng xếp hạng, Phụ huynh & Quản trị:**
  - Bảng xếp hạng lớp & bài tập bằng SQL `RANK()` kèm ẩn danh tuỳ chọn, loại bài bị đánh dấu nghi vấn.
  - Cổng Phụ huynh liên kết qua mã 8 ký tự dùng một lần (không bao giờ lộ dữ liệu học sinh khác).
  - Quản trị Admin: thống kê hệ thống, quản lý tài khoản (đổi vai trò, khoá/mở), liên kết phụ huynh thủ công, **Nhật ký kiểm tra (`/admin/audit`)**, và **Theo dõi lỗi hệ thống (`/admin/errors`)**.

### 6. Lưu bài tập trên Google Drive (tuỳ chọn)
- Admin kết nối **Drive dùng chung** ở `/admin`; mỗi giáo viên có thể kết nối **Drive riêng** ở `/teacher/settings`. Thứ tự ưu tiên khi lưu file: Drive riêng → Drive dùng chung → máy chủ (`local` / `s3`).
- PDF đề, file nghe, file Word gốc, bản backup `.engclass.zip` và file học sinh nộp được xếp theo thư mục `Pivora/<Tên GV>/Worksheets | Backups | Lớp …`. Mọi file **riêng tư**; học sinh chỉ xem qua app (có kiểm tra quyền, hỗ trợ tua audio/video).
- Nút **Lưu lên Drive**, **Sao lưu tất cả lên Drive**, **Nhập từ Drive** (Google Picker) ở `/teacher/worksheets`; tuỳ chọn tự động sao lưu hằng ngày lúc 02:00 (giữ 14 bản).
- Cấu hình Google Cloud (OAuth client, redirect URI, biến môi trường): xem [`docs/GOOGLE_DRIVE.md`](docs/GOOGLE_DRIVE.md).

### 7. Cấp tài khoản (không cho tự đăng ký)
- Trang `/register` và API `POST /api/auth/register` đã **tắt** (trả 403, trang tự chuyển về `/login`).
- **Admin** tạo tài khoản mọi vai trò ở `/admin` (mục "Tạo tài khoản").
- **Giáo viên** tạo tài khoản **Học sinh** (tự vào lớp) và **Phụ huynh** (tự liên kết với học sinh được chọn) ở tab **Học sinh** của lớp, hoặc nhập học sinh hàng loạt từ Excel.
- Bỏ trống mật khẩu → hệ thống sinh mật khẩu tạm và **chỉ hiện một lần** cho người tạo.

### 8. Bài tập tạo từ Word không cần PDF
- Bài tạo từ Word chỉ dùng **Phiếu trả lời**: mỗi thẻ câu hiện **nội dung câu hỏi** (sửa trực tiếp trên thẻ) và **đáp án**; câu có nhiều chỗ trống được tách `3a`, `3b` và chỗ trống đang hỏi được tô nổi bật.
- Khi bài không có PDF, học sinh làm trên phiếu trả lời rộng giữa màn hình (không bị dồn vào cột phải).

---

## Tech Stack

- **Next.js 15 (App Router) + TypeScript (strict)**
- **PostgreSQL + Prisma ORM**
- **Auth.js (NextAuth v5)** — Credentials (`bcryptjs`) + tuỳ chọn Google OAuth
- **Tailwind CSS + shadcn/ui** — Thiết kế theo Pivora Design System (Stitch) kèm Dark Mode
- **katex** — Hiển thị công thức Toán học & Khoa học (`$...$`, `$$...$$`)
- **qrcode** — Tạo mã QR chia sẻ & mời học sinh tham gia lớp nhanh
- **pdfjs-dist** & **pdf-lib** — Render PDF bằng `<canvas>` (lazy-load, không dùng `<iframe>`/`<embed>`)
- **react-rnd** — Vẽ, kéo và resize ô nhập liệu chuẩn hoá toạ độ `0..1`
- **@mediapipe/tasks-vision** — Camera AI Proctoring chạy cục bộ trên trình duyệt
- **mammoth** & **jszip** — Đọc/xuất Word (`.docx`) và đóng gói Backup/Import (`.engclass.zip`)
- **zod** + **TanStack Query** + **exceljs**
- **StorageProvider** — `LocalStorageProvider` (`./uploads`) hoặc `S3StorageProvider` (S3 / R2 / MinIO) chọn qua `STORAGE_DRIVER`
- **Vitest** (unit & integration) + **Playwright** (E2E)

---

## Hướng dẫn cài đặt và chạy từ máy trắng

### 1. Chuẩn bị biến môi trường

```bash
cp .env.example .env
```

Các biến môi trường quan trọng trong `.env`:

| Biến | Mặc định | Mô tả |
|---|---|---|
| `DATABASE_URL` | `postgresql://engclass:...` | Chuỗi kết nối PostgreSQL |
| `AUTH_SECRET` | *(tự sinh ≥ 32 ký tự)* | Khoá ký phiên đăng nhập & stream token audio |
| `NEXT_PUBLIC_APP_NAME` | `Pivora` | Tên hiển thị trên giao diện |
| `STORAGE_DRIVER` | `local` | `drive` (khuyên dùng cho production: Google Drive là ổ lưu file chính), `local` (`./uploads`) hoặc `s3` (S3/R2/MinIO) |
| `MAX_UPLOAD_SIZE_MB` | `20` | Giới hạn dung lượng upload PDF / Audio (MB) |
| `PROCTOR_SNAPSHOT_RETENTION_DAYS` | `30` | Số ngày lưu ảnh bằng chứng camera trước khi xoá |
| `SKIP_MEDIAPIPE_MODEL_DOWNLOAD` | `0` | Đặt `1` nếu cài đặt trong môi trường offline không tải model |

### 2. Khởi chạy PostgreSQL

```bash
docker compose up -d
```

*(Nếu dùng MinIO cho `STORAGE_DRIVER=s3`, chạy `docker compose --profile s3 up -d`.)*

### 3. Cài dependencies, migrate & seed dữ liệu mẫu

```bash
pnpm i
pnpm prisma migrate dev
pnpm db:seed
```

> Trong bước `pnpm i`, script `postinstall` sẽ tự động:
> 1. Copy `pdf.worker.min.mjs` vào `public/`
> 2. Copy MediaPipe WASM runtime và tải 2 model AI (`face_landmarker.task`, `efficientdet_lite0.tflite`) vào `public/mediapipe/` để tự host.

### 4. Chạy ứng dụng

```bash
pnpm dev
```

Mở trình duyệt tại [http://localhost:3000](http://localhost:3000).

---

## Tài khoản & Dữ liệu mẫu (sau khi chạy `pnpm db:seed`)

Mật khẩu chung cho tất cả tài khoản mẫu: **`password123`**

| Vai trò | Email | Ghi chú |
|---|---|---|
| **Admin** | `admin@engclass.vn` | Quản lý user, khoá tài khoản, liên kết phụ huynh |
| **Giáo viên 1** | `teacher1@engclass.vn` | Cô Mai Phương — Lớp 12A1 (Mã lớp: `ENG12A`) |
| **Giáo viên 2** | `teacher2@engclass.vn` | Thầy Minh Đức — Lớp IELTS 6.5+ (Mã lớp: `IELT65`) |
| **Học sinh 1–6** | `student1@engclass.vn` … `student6@engclass.vn` | Lớp 12A1 (`student1` là Nguyễn Văn Minh) |
| **Học sinh 7–10** | `student7@engclass.vn` … `student10@engclass.vn` | Lớp IELTS 6.5+ |
| **Phụ huynh 1** | `parent1@engclass.vn` | Đã liên kết với `student1` và `student2` |
| **Phụ huynh 2** | `parent2@engclass.vn` | Đã liên kết với `student3` |

*(Mã liên kết phụ huynh chưa dùng cho `student4`: `PR4INV88`)*

**Các bài tập demo có sẵn trong Lớp 12A1:**
1. **Unit 7: The World of Work - Đề số 1** — PDF đa hướng (dọc + ngang) kết hợp Overlay + Phiếu trả lời + Tự luận.
2. **Kiểm tra định kỳ - Chế độ giám sát** — Chế độ `LOCKDOWN`, rời tab 1 lần khoá ngay.
3. **Luyện Chép Chính Tả Tiếng Anh** — Có file nghe mẫu `.wav`, giới hạn 2 lượt nghe, chặn tua & chặn copy/paste, không giới hạn lượt làm (`∞`), chấm theo % số từ đúng.
4. **Bài học thuộc Unit 17: Survival Tips** — Chế độ tập trung **1 câu/màn hình (`Focus Mode`)**, điền từ trực tiếp trong câu, đã bật **Chia sẻ GV** (đăng nhập `teacher2@engclass.vn` để thử tab *Giáo viên khác chia sẻ*).

---

## Các lệnh thường dùng & Vận hành

```bash
pnpm dev                     # Chạy development server (Turbopack)
pnpm build                   # Build production (KHÔNG chạy khi `pnpm dev` đang chạy: dùng chung thư mục .next)
pnpm build:check             # Kiểm tra build production vào .next-build, chạy song song với `pnpm dev` được
pnpm start                   # Chạy bản production sau khi build
pnpm drive:prune             # Dọn file Google Drive mồ côi (cũng tự chạy mỗi giờ)

pnpm db:migrate              # Chạy Prisma migration (dev)
pnpm db:push                 # Đồng bộ schema trực tiếp
pnpm db:seed                 # XOÁ dữ liệu hiện có và nạp lại dữ liệu mẫu (chỉ dùng khi dev)
pnpm admin:create            # Tạo/đặt lại tài khoản admin (ADMIN_EMAIL=… [--reset])

pnpm proctor:purge-snapshots # Xoá ảnh camera cũ hơn PROCTOR_SNAPSHOT_RETENTION_DAYS ngày (nên chạy cron hằng ngày)

pnpm lint                    # Kiểm tra ESLint
pnpm typecheck               # Kiểm tra TypeScript strict (tsc --noEmit)
pnpm test                    # Chạy toàn bộ Vitest unit & integration tests
pnpm test:e2e                # Chạy Playwright E2E tests (cần Chromium: pnpm exec playwright install chromium)
```

> Khi database được seed lại trong lúc trình duyệt còn đăng nhập, phiên cũ sẽ tự bị xoá và người dùng được đưa về `/login` kèm thông báo "Phiên đăng nhập đã hết hạn".

---

## Deploy production (Docker + Cloudflare Tunnel)

Dự án có sẵn `Dockerfile` và `compose.production.yml` (PostgreSQL 16 + app, chỉ mở cổng `127.0.0.1:${APP_PORT}`; Cloudflare Tunnel nối vào cổng này nên không cần mở port ra Internet).

```bash
git clone https://github.com/Bluenip/PIVORA.git pivora && cd pivora
cp .env.production.example .env.production   # điền NEXT_PUBLIC_APP_URL, APP_URL, POSTGRES_PASSWORD, AUTH_SECRET…
docker compose -f compose.production.yml --env-file .env.production up -d --build
```

- Container tự chạy `prisma migrate deploy` mỗi lần khởi động. **Không seed dữ liệu mẫu trên production**; chỉ tạo tài khoản admin đầu tiên (mật khẩu ngẫu nhiên in ra một lần):
  `docker compose -f compose.production.yml --env-file .env.production exec -e ADMIN_EMAIL=admin@example.com app node_modules/.bin/tsx scripts/create-admin.ts`
  (thêm `--reset` để đặt lại mật khẩu admin). Sau đó admin tạo tài khoản giáo viên; giáo viên tạo học sinh / phụ huynh.
- File upload nằm trong volume `uploads`, database trong volume `postgres_data`. Sao lưu DB: `docker compose -f compose.production.yml exec postgres pg_dump -U engclass engclass > backup.sql`.
- **Kiểm tra bản sao lưu DB hằng tuần (`scripts/verify-backup.sh`):**
  Script tự lấy bản backup `.dump` mới nhất trong `.deploy/backups/` (hoặc truyền đường dẫn file cụ thể), khôi phục vào container `postgres:16-alpine` tạm, đếm số bản ghi các bảng chính (`User`, `Class`, `Worksheet`, `Assignment`, `Submission`, `AuditLog`…) rồi tự xoá container tạm:
  ```bash
  # Chạy thủ công kiểm tra bản backup mới nhất
  bash scripts/verify-backup.sh

  # Hoặc cài cron chạy mỗi Chủ nhật lúc 03:00 sáng:
  # 0 3 * * 0 ENGCLASS_REPO_DIR="$HOME/apps/engclass" /bin/bash "$HOME/apps/engclass/scripts/verify-backup.sh" >> "$HOME/apps/engclass/.deploy/verify-backup.log" 2>&1
  ```
- **Tự động deploy & cảnh báo (`scripts/auto-deploy.sh`):**
  - Khi deploy thất bại / rollback, script tự ghi thông báo cảnh báo cho tất cả quản trị viên đang hoạt động (xem trên chuông thông báo và `/admin/errors`).
  - Sau khi deploy thành công, script tự dọn build cache Docker cũ hơn 7 ngày (`docker builder prune -f --filter until=168h`), xoá image `engclass-app` lơ lửng (dangling), và cắt `.deploy/cron.log` giữ 2.000 dòng cuối khi vượt quá 5 MB.
- Cập nhật phiên bản: `git pull && docker compose -f compose.production.yml --env-file .env.production up -d --build`.
- Cloudflare Tunnel: trong Zero Trust → Networks → Tunnels, thêm *Public hostname* (ví dụ `lms.<tên-miền>`) trỏ tới `http://localhost:${APP_PORT}`.
- **Bảo mật:** để `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false` và không chạy `pnpm db:seed` trên bản public (tài khoản mẫu dùng mật khẩu `password123`).
