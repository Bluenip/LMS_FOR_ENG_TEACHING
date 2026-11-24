# EngClass — Hệ thống LMS dạy tiếng Anh & Worksheet tương tác

Nền tảng LMS dành cho giáo viên, học sinh, phụ huynh và quản trị viên, được tối ưu cho giảng dạy tiếng Anh: **Worksheet PDF tương tác** (Overlay trên PDF, Phiếu trả lời nhanh, hoặc kết hợp A + B), **tự động tạo bài điền từ từ file Word (`.docx`)**, **Chế độ tập trung 1 câu/màn hình cho bài học thuộc**, **File nghe giới hạn số lần nghe**, **Chép chính tả chấm theo % số từ đúng**, **Backup/Export & chia sẻ giữa các giáo viên**, **Bảng xếp hạng**, **Cổng Phụ huynh**, và **Chống gian lận 2 lớp (Trình duyệt + Camera AI)**.

Tên hiển thị sản phẩm đổi được qua biến môi trường `NEXT_PUBLIC_APP_NAME` (mặc định: `EngClass`). Hỗ trợ chuyển đổi nhanh giao diện **Sáng / Tối (Light / Dark)** và **Tiếng Việt / Tiếng Anh (VI / EN)**.

---

## Tính năng chính

### 1. Worksheet Studio, Tự động tạo từ Word & Chia sẻ / Backup
- **3 chế độ biên tập:** Chế độ A (vẽ ô nhập trực tiếp trên PDF với toạ độ chuẩn hoá `0..1`, kéo/resize bằng `react-rnd`, bám lưới, căn hàng nhiều ô), Chế độ B (Phiếu trả lời + nhập đáp án hàng loạt), hoặc kết hợp A + B.
- **9 loại câu hỏi:** `TEXT` (điền từ), `NUMBER`, `MULTIPLE_CHOICE`, `MULTI_SELECT`, `TRUE_FALSE`, `DROPDOWN`, `CHECKBOX`, `ESSAY` (tự luận chấm tay), và **`DICTATION` (Chép chính tả)**.
- **Tự động tạo bài điền từ từ file Word (`.docx`) / văn bản:**
  - Giáo viên soạn bài trong Word theo cú pháp gạch dưới kép `__đáp án__`, hỗ trợ nhiều đáp án đúng ngăn cách bằng dấu `/` hoặc `|`, ví dụ:
    ```text
    Câu 1: How many __planets are there in the universe/stars are there in the universe__?
    Câu 2: (1) __Find a hill__. Climb __a hill so that you can see over the top of the trees__.
    ```
  - Hệ thống tự động loại bỏ đánh số trùng (`Câu 1: 1.`), chuẩn hoá khoảng trắng, tách nhiều chỗ trống trong cùng 1 câu thành `2a`, `2b` và hiển thị xem trước trước khi lưu.
  - Có sẵn nút **Tải file Word mẫu (`.docx`)** ngay trong hộp thoại nhập.
- **Chế độ tập trung 1 câu / màn hình (`Focus Mode`):**
  - Khi giao bài, giáo viên bật **"Hiển thị từng câu một trên màn hình"** (hoặc chọn preset **Bài học thuộc**).
  - Học sinh làm từng câu trên một thẻ lớn giữa màn hình, điền từ **trực tiếp ngay trong câu**, tự gộp các câu có nhiều chỗ trống (`7a`, `7b`, `10a`, `10b`, `10c`) về cùng một câu hoàn chỉnh, nhấn `Enter` để chuyển nhanh sang ô/câu tiếp theo.
- **Backup, Export & Chia sẻ giáo viên:**
  - **Xuất gói Backup đầy đủ (`.engclass.zip`):** Đóng gói toàn bộ phiếu (câu hỏi, đáp án, cấu hình chấm, file PDF và tất cả file nghe MP3/WAV) để sao lưu hoặc gửi cho đồng nghiệp.
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
  - Các sự kiện phát hiện (kèm bộ lọc chống báo nhầm debounce + cooldown 30 giây):
    - `CAMERA_NO_FACE`: không thấy mặt liên tục ≥ 5 giây.
    - `CAMERA_MULTI_FACE`: có từ 2 khuôn mặt trở lên ≥ 2 giây.
    - `CAMERA_LOOK_AWAY`: quay ngang > 35° hoặc cúi đầu > 25° liên tục ≥ 4 giây (luôn ở mức *nghi vấn*, không tự khoá để tránh báo nhầm khi viết nháp).
    - `CAMERA_PHONE`: phát hiện điện thoại (`cell phone` ≥ 0,5 trong 2 khung hình liên tiếp).
    - `CAMERA_OFF`: tắt/rút/chặn camera — luôn che đề thi và ghi nhận vi phạm.
  - Mặc định các sự kiện AI chỉ đánh dấu **nghi vấn** (`cameraEnforce = false`); giáo viên có thể bật `cameraEnforce` nếu muốn tính vào ngưỡng vi phạm.
  - **Quyền riêng tư (Nghị định 13/2023):** Bước kiểm tra camera + hộp đồng ý xử lý hình ảnh riêng trên trang nội quy (lưu `cameraConsentAt`); ảnh bằng chứng nhỏ `320×240` JPEG (≤ 120 KB) chỉ giáo viên lớp được xem (và phụ huynh nếu bật chia sẻ), tự động xoá định kỳ sau 30 ngày bằng `pnpm proctor:purge-snapshots`.
  - *Lưu ý:* Trình duyệt chỉ cho phép bật webcam trên **HTTPS** (hoặc `localhost`). Khi dùng chung với Safe Exam Browser (SEB), cần bật quyền camera trong cấu hình `.seb`.

### 5. Lớp học, Chấm điểm, Bảng xếp hạng, Cổng Phụ huynh & Admin
- Quản lý lớp học, mã tham gia 6 ký tự, duyệt học sinh, import danh sách từ Excel, bảng tin, bài giảng đa phương tiện (PDF/Video/YouTube/Audio/Link).
- Đồng hồ server, tự nộp khi hết giờ, chấm tự động + chấm tay câu tự luận + ghi đè điểm, thống kê tỉ lệ đúng từng câu & đáp án sai phổ biến, xuất Excel bảng điểm (`exceljs`).
- Bảng xếp hạng lớp & bài tập bằng SQL `RANK()` kèm ẩn danh tuỳ chọn, loại bài bị đánh dấu nghi vấn.
- Cổng Phụ huynh liên kết qua mã 8 ký tự dùng một lần (không bao giờ lộ dữ liệu học sinh khác).
- Quản trị Admin: thống kê hệ thống, quản lý tài khoản (đổi vai trò, khoá/mở), liên kết phụ huynh thủ công.

### 6. Lưu bài tập trên Google Drive (tuỳ chọn)
- Admin kết nối **Drive dùng chung** ở `/admin`; mỗi giáo viên có thể kết nối **Drive riêng** ở `/teacher/settings`. Thứ tự ưu tiên khi lưu file: Drive riêng → Drive dùng chung → máy chủ (`local` / `s3`).
- PDF đề, file nghe, file Word gốc, bản backup `.engclass.zip` và file học sinh nộp được xếp theo thư mục `EngClass/<Tên GV>/Worksheets | Backups | Lớp …`. Mọi file **riêng tư**; học sinh chỉ xem qua app (có kiểm tra quyền, hỗ trợ tua audio/video).
- Nút **Lưu lên Drive**, **Sao lưu tất cả lên Drive**, **Nhập từ Drive** (Google Picker) ở `/teacher/worksheets`; tuỳ chọn tự động sao lưu hằng ngày lúc 02:00 (giữ 14 bản).
- Cấu hình Google Cloud (OAuth client, redirect URI, biến môi trường): xem [`docs/GOOGLE_DRIVE.md`](docs/GOOGLE_DRIVE.md).

### 7. Bài tập tạo từ Word không cần PDF
- Bài tạo từ Word chỉ dùng **Phiếu trả lời**: mỗi thẻ câu hiện **nội dung câu hỏi** (sửa trực tiếp trên thẻ) và **đáp án**; câu có nhiều chỗ trống được tách `3a`, `3b` và chỗ trống đang hỏi được tô nổi bật.
- Khi bài không có PDF, học sinh làm trên phiếu trả lời rộng giữa màn hình (không bị dồn vào cột phải).

---

## Tech Stack

- **Next.js 15 (App Router) + TypeScript (strict)**
- **PostgreSQL + Prisma ORM**
- **Auth.js (NextAuth v5)** — Credentials (`bcryptjs`) + tuỳ chọn Google OAuth
- **Tailwind CSS + shadcn/ui** — Thiết kế theo EngClass Design System (Stitch) kèm Dark Mode
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
| `NEXT_PUBLIC_APP_NAME` | `EngClass` | Tên hiển thị trên giao diện |
| `STORAGE_DRIVER` | `local` | `local` (`./uploads`) hoặc `s3` (S3/R2/MinIO) |
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
pnpm db:seed                 # XOÁ dữ liệu hiện có và nạp lại dữ liệu mẫu

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
git clone https://github.com/Bluenip/LMS_FOR_ENG_TEACHING.git engclass && cd engclass
cp .env.production.example .env.production   # điền NEXT_PUBLIC_APP_URL, APP_URL, POSTGRES_PASSWORD, AUTH_SECRET…
docker compose -f compose.production.yml --env-file .env.production up -d --build
```

- Container tự chạy `prisma migrate deploy` mỗi lần khởi động. Nạp dữ liệu mẫu **một lần** (lệnh này xoá dữ liệu cũ):
  `docker compose -f compose.production.yml --env-file .env.production exec app node_modules/.bin/tsx prisma/seed.ts`
- File upload nằm trong volume `uploads`, database trong volume `postgres_data`. Sao lưu DB: `docker compose -f compose.production.yml exec postgres pg_dump -U engclass engclass > backup.sql`.
- Cập nhật phiên bản: `git pull && docker compose -f compose.production.yml --env-file .env.production up -d --build`.
- Cloudflare Tunnel: trong Zero Trust → Networks → Tunnels, thêm *Public hostname* (ví dụ `lms.<tên-miền>`) trỏ tới `http://localhost:${APP_PORT}`.
- **Bảo mật:** `NEXT_PUBLIC_SHOW_DEMO_ACCOUNTS=false` trên bản public. Tài khoản mẫu dùng mật khẩu `password123` — đổi mật khẩu hoặc khoá các tài khoản mẫu trước khi cho người thật dùng.
