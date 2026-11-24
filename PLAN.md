# PLAN — EngClass LMS (giai đoạn tiếp theo)

> **Dành cho agent viết code (Gemini).** Đây là plan **duy nhất** của dự án. Các Phase 1–10 trong plan cũ đã làm xong và được tóm tắt ở mục 1. Bản đầy đủ của plan cũ vẫn còn trong lịch sử git (commit `834cff0`).
>
> Làm **theo đúng thứ tự Phase**. Xong mỗi Phase phải: chạy được, có seed data cho tính năng mới, có test, đạt hết mục "Tiêu chí hoàn thành", rồi mới sang Phase sau. Khi xong, ghi vào mục **"Tiến độ"** ở cuối file.
>
> Không sao chép tên, logo, giao diện hay nội dung của TopWorksheets, Liveworksheets, SHub hay Dạy Mãi. Chỉ tham khảo **tính năng**.

---

## 1. Hiện trạng (đã có, KHÔNG làm lại)

Next.js 15 (App Router) + TypeScript strict + Prisma/PostgreSQL + Auth.js v5 + Tailwind/shadcn + pdfjs-dist + react-rnd + zod + TanStack Query + exceljs + Vitest/Playwright. Postgres chạy bằng `podman` (container `engclass-postgres`).

- **4 vai trò:** Admin, Giáo viên, Học sinh, Phụ huynh. Phân quyền ở `src/middleware.ts` và `src/lib/permissions.ts`.
- **Lớp học:** mã vào lớp, duyệt học sinh, import học sinh từ Excel, bảng tin + bình luận, bài giảng chia chương (PDF / video / audio / link).
- **Worksheet:**
  - Có 3 kiểu: ô đặt trên PDF (overlay), phiếu trả lời, hoặc kết hợp cả hai.
  - 9 loại câu: `TEXT`, `NUMBER`, `MULTIPLE_CHOICE`, `MULTI_SELECT`, `TRUE_FALSE`, `DROPDOWN`, `CHECKBOX`, `ESSAY`, `DICTATION`.
  - Editor kéo thả, autosave, "Xem như học sinh".
  - File nghe giới hạn lượt nghe; tạo bài điền từ từ file Word.
  - Backup / Export (`.engclass.zip`, `.docx`); chia sẻ và clone giữa giáo viên.
- **Giao bài:** hạn nộp, giới hạn thời gian, số lượt (có thể không giới hạn), trộn câu, cài đặt công bố điểm / đáp án, chế độ 1 câu mỗi màn hình (Focus Mode).
- **Chấm & báo cáo:** tự chấm, chấm tay câu tự luận, tự chấm lại khi đổi đáp án, thống kê từng câu, xuất Excel.
- **Bảng xếp hạng:** theo bài và theo cả lớp; có chế độ ẩn danh; cache 60 giây.
- **Cổng phụ huynh:** mã liên kết, KPI, biểu đồ, nhận xét của giáo viên.
- **Chống gian lận:** 4 mức OFF / MONITOR / LOCKDOWN / SEB; 4 hành động WARN / LOCK / RESTART / AUTO_SUBMIT; màn Live qua SSE; camera AI (MediaPipe).
- **Khác:** thông báo trong app, trang admin, giao diện sáng/tối, song ngữ VI/EN (`messages/vi.ts`, `messages/en.ts`, `useI18n()` / `getI18n()`, `tr("vi", "en")`).
- **Lưu file:** `StorageProvider` (`src/lib/storage/`) với driver `local` hoặc `s3`, chọn bằng `STORAGE_DRIVER`. File chỉ tải được qua `/api/files/[...key]`, có kiểm tra quyền.

Trạng thái ngày 24/11/2026: `pnpm typecheck` 0 lỗi, `pnpm test` 48/48, `pnpm lint` 0 cảnh báo.

---

## 2. Quy ước bắt buộc (áp dụng cho mọi Phase)

- TypeScript strict. Không dùng `any` trừ khi có comment giải thích lý do.
- Logic nghiệp vụ đặt trong `src/server/*Service.ts`. Route và Server Action chỉ làm 3 việc: validate bằng zod, kiểm tra quyền, gọi service.
- Mọi chữ hiển thị đều có **cả tiếng Việt và tiếng Anh**: dùng `m.*` từ `messages/vi.ts` và `messages/en.ts` (thêm key vào cả 2 file), hoặc `tr("…", "…")` trong component.
- Màu sắc: dùng các class màu đã có (`text-[#0B1C30]`, `bg-white`, `border-slate-200`…). Nếu thêm màu mới thì phải thêm bản tối tương ứng trong `src/app/globals.css` (mục "Dark mode").
- Migration Prisma đặt tên rõ ràng. Thêm field mới thì phải có default hợp lệ cho dữ liệu cũ. Cập nhật `prisma/seed.ts` cho tính năng mới.
- **Không chạy `pnpm build` khi `pnpm dev` đang chạy**: cả hai dùng chung thư mục `.next`, build sẽ làm server dev hỏng (lỗi `Cannot find module '[turbopack]_runtime.js'`). Nếu cần build trong lúc dev đang chạy, đặt `distDir` riêng cho build (xem Phase 11).
- Mỗi Phase chạy đủ: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`. **Commit git sau mỗi Phase** với message rõ ràng; không để một khối lớn thay đổi chưa commit.
- Không commit `.env` hay bất kỳ secret nào (client secret Google, key mã hoá…). Biến môi trường mới phải được thêm vào `.env.example`, kèm comment giải thích.

### Checklist bảo mật (Claude sẽ dùng để review sau mỗi Phase)
1. Không lộ đáp án (`answerKey`, `gradingOpts`, `explanation`) cho học sinh khi chưa được phép xem. Kiểm tra cả network response.
2. Kiểm tra quyền ở **mọi** endpoint (chống IDOR: thử đổi id lớp / bài / bài nộp / file sang id của người khác).
3. Không sửa được bài sau khi nộp hoặc hết giờ. Đồng hồ tính theo giờ server.
4. Upload phải kiểm tra loại file (magic bytes) và dung lượng. File không bao giờ public mặc định.
5. Phụ huynh chỉ thấy dữ liệu của con mình. Các cài đặt ẩn danh / thời điểm hiện bảng xếp hạng / thời điểm công bố điểm đều được áp dụng ở server.
6. Token OAuth và secret lưu ở dạng **mã hoá**, không bao giờ ghi ra log hay trả về client.

---

## Phase 11 — Dọn nợ kỹ thuật & lỗi phát hiện ngày 24/11/2026

1. **Commit phần Phase 10 đang nằm ngoài git.** Toàn bộ thay đổi Phase 10 (audio, đọc chính tả, Word import, backup, Focus Mode, camera AI, 3 migration `20261124*`) hiện chưa được commit. Commit chúng trước khi làm bất cứ việc gì khác.
2. **Phiên đăng nhập trỏ tới tài khoản đã bị xoá:**
   - Cách tái hiện: seed lại database trong lúc trình duyệt vẫn còn đăng nhập. API trả `401 "Tài khoản không tồn tại"` nhưng các trang lại hiện như dữ liệu rỗng (ví dụ `/teacher/worksheets` hiện "Bạn chưa tạo Worksheet nào").
   - Sửa phía client: thêm xử lý chung trong `QueryClient` (`src/components/providers.tsx`). Khi bất kỳ API nào trả `401` với code `UNAUTHORIZED` hoặc `ACCOUNT_LOCKED` thì gọi `signOut({ callbackUrl: "/login?reason=session" })`, và trang login hiện thông báo "Phiên đăng nhập đã hết hạn".
   - Sửa phía server: các layout server (`(teacher)`, `(student)`, `parent`, `admin`) kiểm tra user có còn tồn tại trong DB và chưa bị khoá không; nếu không thì redirect về `/login`.
3. **Build và dev xung đột `.next`:** trong `next.config.ts` đọc `distDir` từ biến `NEXT_DIST_DIR` (mặc định `.next`). Thêm script `"build:check": "NEXT_DIST_DIR=.next-build next build"` để kiểm tra build mà không làm hỏng server dev. Thêm `.next-build` vào `.gitignore`.
4. **Chuỗi tiếng Việt cứng còn sót ở server:** thông báo lỗi API, nội dung thông báo và nhãn trong báo cáo (ví dụ `"(Bỏ trống)"`, `"Đúng / Có"`, `"em"` trong `reportService`) vẫn chỉ có tiếng Việt.
   - Server trả về **mã + tham số** thay vì câu chữ, ví dụ `{ code: "BLANK" }`; client tự dịch.
   - Hoặc server đọc cookie `lang` và trả câu theo ngôn ngữ đó.
   - Ưu tiên trước: lỗi API hiển thị trong toast, và các nhãn trong trang chấm bài.

**Tiêu chí hoàn thành:** sau khi seed lại database, trình duyệt cũ bị đưa về trang login kèm thông báo; `pnpm build:check` chạy được trong lúc `pnpm dev` đang chạy mà server dev không lỗi; trang chấm bài ở chế độ EN không còn chữ tiếng Việt.

---

## Phase 12 — Tích hợp Google Drive để lưu bài tập

### 12.0 Nguồn tham khảo (đọc trước khi code)

Repo `https://github.com/Bluenip/LMS-FOR-DTQ` đã làm xong và kiểm thử tích hợp Drive. Hãy **port lại có chọn lọc**, không copy nguyên xi vì data model khác:

- `docs/GOOGLE_DRIVE.md`: kiến trúc, API, chính sách chia sẻ, cấu hình Google Cloud, checklist production. **Đọc toàn bộ.**
- `src/lib/server/google-drive.ts`: gọi REST API của Drive bằng `fetch`, không thêm SDK (OAuth, refresh token, files.create / update / delete, resumable upload, phân loại lỗi Google).
- `src/lib/server/drive-service.ts`: vòng đời một lượt upload, kiểm tra quyền, dọn file.
- `src/lib/drive-upload.ts` và `src/components/drive.tsx`: upload ở trình duyệt (chunk 8 MiB, retry, resume).
- `src/app/api/drive/**`: các route (connect, callback, disconnect, status, uploads, files…).
- `src/instrumentation.ts` và `scripts/prune-drive.ts`: job dọn file chạy mỗi giờ.
- `tests/drive*.test.ts`: test với Google API được mock.

### 12.1 Mục tiêu
- Giáo viên lưu **toàn bộ học liệu bài tập** lên Google Drive thay vì ổ đĩa server: PDF đề, file nghe, file Word gốc, bản backup `.engclass.zip`, và file học sinh nộp (ảnh, ghi âm — dùng cho Phase 13 và 15).
- Có thể **nhập** PDF / DOCX / backup từ Drive để tạo worksheet.
- Cấu trúc thư mục trên Drive dễ đọc, để giáo viên tự mở Drive vẫn tìm được file.

### 12.2 Kết nối Drive
- **12.2a — Tài khoản Drive dùng chung (làm trước):** Admin bấm "Kết nối Google Drive" ở `/admin`, giống repo tham khảo.
  - Bảng `DriveConnection`: `id`, `ownerId?` (null = tài khoản dùng chung), `connectedById`, `email`, `encryptedRefreshToken` (AES-256-GCM, key lấy từ `DRIVE_ENCRYPTION_KEY`), `scope`, `status` (`ACTIVE` / `REVOKED` / `DISCONNECTED`), `rootFolderId`, `createdAt`, `updatedAt`.
  - Scope chỉ dùng `https://www.googleapis.com/auth/drive.file` (ứng dụng chỉ thấy file do chính nó tạo, hoặc file người dùng chọn qua Picker).
  - OAuth có cookie `state` + PKCE; kiểm tra header `Origin` ở mọi request POST / PATCH / DELETE.
- **12.2b — Drive riêng của từng giáo viên (làm sau 12.2a):** giáo viên tự kết nối Drive của mình ở trang "Cài đặt tài khoản" (bản ghi `DriveConnection` có `ownerId` = id giáo viên). Thứ tự chọn nơi lưu: Drive riêng của giáo viên → Drive dùng chung → driver hiện tại (`local` / `s3`).

### 12.3 Lưu file qua `StorageProvider`
Giữ nguyên interface `StorageProvider` để code cũ (`worksheetService`, `worksheetAudioService`, `worksheetTransferService`, `lessonService`, `/api/files/[...key]`) gần như không phải sửa:

- Thêm `src/lib/storage/drive.ts` triển khai `StorageProvider`. Bảng `DriveFile` ánh xạ `storageKey` → `driveFileId`, gồm: `id`, `storageKey` (unique), `driveFileId` (unique), `connectionId`, `ownerId`, `mimeType`, `size`, `md5`, `kind` (`WORKSHEET_PDF` / `WORKSHEET_AUDIO` / `WORD_SOURCE` / `BACKUP` / `LESSON_FILE` / `SUBMISSION_FILE`), `worksheetId?`, `classId?`, `submissionId?`, `trashedAt?`, `createdAt`.
  - `put`: file ≤ 5 MiB dùng multipart upload; file lớn hơn dùng resumable upload phía server.
  - `get`: stream từ Drive (`alt=media`), **có hỗ trợ header `Range`** để tua được audio và video.
  - `delete`: chuyển file vào thùng rác của Drive (`trashed=true`), không xoá vĩnh viễn.
- `getStorageProvider()` nhận thêm `STORAGE_DRIVER=drive`. Khi chưa kết nối Drive thì tự quay về `local` và log cảnh báo.
- Video lớn (bài giảng) dùng upload trực tiếp từ trình duyệt lên Drive (Option B trong tài liệu tham khảo): session URI được mã hoá khi lưu DB, upload theo chunk 8 MiB, có resume.
- **Tất cả file đều để riêng tư.** Không đặt quyền `anyone with the link` (trừ video bài giảng nếu dùng trình phát Drive Preview, có công tắc riêng do admin bật). Học sinh và phụ huynh chỉ xem file qua `/api/files/*` hoặc `/api/drive/files/[id]/view`, server kiểm tra quyền mỗi lần.

### 12.4 Cấu trúc thư mục trên Drive
```
EngClass/
└── <Tên giáo viên>/
    ├── Worksheets/<Tên worksheet>/        ← de.pdf, audio-1.mp3, nguon.docx
    ├── Backups/<yyyy-mm-dd>/              ← <Tên worksheet>.engclass.zip, thu-vien.zip
    └── Lớp <Tên lớp>/<Tên bài tập>/<Tên học sinh>/   ← ảnh / ghi âm học sinh nộp (riêng tư)
```
- Tên file được làm sạch (bỏ ký tự `/ \ : * ? " < > |`).
- Đổi tên worksheet hoặc lớp thì đổi tên thư mục tương ứng ở lần ghi file kế tiếp.

### 12.5 Tính năng giao diện
- `/admin`: thẻ "Google Drive" hiện trạng thái, email đã kết nối, dung lượng đã dùng (`about.get`); các nút Kết nối / Ngắt kết nối / Dọn file mồ côi.
- `/teacher/worksheets`:
  - Nút **"Lưu lên Drive"** trên từng worksheet: tạo backup `.engclass.zip` lên thư mục `Backups/`.
  - Nút **"Sao lưu tất cả lên Drive"**.
  - Huy hiệu "Đã lưu trên Drive" kèm thời điểm backup gần nhất.
- **Nhập từ Drive:** dùng Google Picker (cần `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` + `NEXT_PUBLIC_GOOGLE_CLIENT_ID`) để chọn file PDF, DOCX hoặc `.engclass.zip`. Server tải file về, rồi gọi lại luồng hiện có (tạo worksheet từ PDF / `parse-word` / `import`).
- **Tự động backup (tuỳ chọn):** giáo viên bật "Tự động sao lưu hằng ngày". Job chạy trong `src/instrumentation.ts` lúc 02:00 (biến `DRIVE_AUTO_BACKUP_HOUR`), chỉ backup các worksheet có thay đổi kể từ lần backup trước, và giữ 14 bản gần nhất (biến `DRIVE_BACKUP_RETENTION`).
- Editor worksheet: khi upload PDF hoặc audio, hiện chỗ đang lưu ("Drive" hoặc "Máy chủ").

### 12.6 Dọn dẹp & lỗi
- Hàng đợi xoá (`DriveTrash`): khi xoá worksheet, bài tập hoặc lớp thì ghi file cần xoá vào hàng đợi (không gọi Google bên trong transaction DB). Job `pruneDrive` chạy mỗi giờ (biến `DRIVE_PRUNE_INTERVAL_MINUTES`, đặt `0` để tắt) và có nút chạy tay `pnpm drive:prune`.
- Xử lý các lỗi Google thường gặp:
  - `storageQuotaExceeded` → HTTP 507, thông báo "Drive đã đầy".
  - `invalid_grant` → đánh dấu kết nối `REVOKED`, báo admin hoặc giáo viên kết nối lại.
  - `rateLimitExceeded` → thử lại với backoff.
- Ngắt kết nối thì chỉ xoá refresh token; giữ `rootFolderId` để lần kết nối lại cùng tài khoản dùng lại thư mục cũ.

### 12.7 Biến môi trường mới (thêm vào `.env.example`)
```
APP_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=            # mặc định ${APP_URL}/api/drive/callback
DRIVE_ENCRYPTION_KEY=           # openssl rand -base64 48 ; đổi key = phải kết nối lại Drive
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
NEXT_PUBLIC_GOOGLE_PICKER_API_KEY=
DRIVE_PRUNE_INTERVAL_MINUTES=60
DRIVE_AUTO_BACKUP_HOUR=2
DRIVE_BACKUP_RETENTION=14
```
Viết `docs/GOOGLE_DRIVE.md` cho dự án này: các bước tạo OAuth client trên Google Cloud, redirect URI, chuyển app sang chế độ "In production" để refresh token không hết hạn sau 7 ngày, và checklist production.

### 12.8 Test
- Unit test với `fetch` được mock: mã hoá / giải mã token, OAuth state, upload multipart và resumable (có resume), phân loại lỗi Google, ánh xạ `storageKey` ↔ `driveFileId`, quyền đọc file (chủ file / giáo viên lớp / học sinh lớp / phụ huynh / người lạ), dọn file.
- E2E: mock Google bằng route giả. Kịch bản: giáo viên tạo worksheet có PDF + audio → file được ghi qua driver `drive` → học sinh làm bài vẫn xem được PDF và nghe được audio → xoá worksheet → file vào hàng đợi xoá.

**Tiêu chí hoàn thành:**
- Với `STORAGE_DRIVER=drive` và một tài khoản Google thật, toàn bộ luồng tạo → giao → làm → chấm bài chạy bình thường.
- Mọi file nằm đúng cấu trúc thư mục ở 12.4.
- Không có file nào ở chế độ công khai.
- Ngắt kết nối hoặc thu hồi quyền thì có thông báo rõ ràng, không làm crash trang.
- Backup lên Drive rồi nhập lại vào một tài khoản giáo viên khác cho ra worksheet giống hệt bản gốc.

---

## Phase 13 — Thêm dạng câu hỏi (so với TopWorksheets)

TopWorksheets có các dạng: Written answer, Dropdown, **Join**, Checkbox, **Highlight**, **Drag & drop**, **Wordsearch**, **Interactive video**, **Draw**, **Formula**, **Speech to text**, **Voice answer**, **Image answer**, **Video answer**, **Fill on image**. EngClass còn thiếu các dạng in đậm. Làm theo thứ tự ưu tiên dưới đây.

Với **mỗi** dạng mới phải có:
- Giá trị mới trong enum `FieldType`.
- Định dạng `answerKey` và hàm chấm thuần trong `src/lib/grading/` kèm unit test.
- Editor: vẽ được ô trên PDF (overlay) và/hoặc thêm vào phiếu trả lời.
- Giao diện học sinh dùng được trên mobile 375px.
- Hiển thị kết quả và đáp án (tuân theo `revealKey`).
- Hỗ trợ trong Backup/Export và trong xuất Word.
- Seed 1 worksheet mẫu.

1. **`MATCH` — Nối cột (Join).**
   - Ô `MATCH` có nhiều điểm neo, mỗi điểm `{ id, side: "L" | "R", x, y }`, đặt trên PDF.
   - Học sinh kéo đường nối từ điểm trái sang điểm phải; trên mobile thì chạm điểm trái rồi chạm điểm phải.
   - `answerKey: { pairs: [["L1", "R3"], …] }`. Chấm điểm thành phần theo số cặp nối đúng; có tuỳ chọn "đúng hết mới có điểm".
2. **`DRAG_DROP` — Kéo thả.**
   - Có "ngân hàng thẻ" (chữ hoặc ảnh) và các ô đích trên PDF.
   - `answerKey: { slots: { slotId: ["tokenId"] } }`; có tuỳ chọn mỗi thẻ chỉ dùng được 1 lần. Trên mobile hỗ trợ chạm để chọn rồi chạm vào ô đích.
3. **`SPEAKING` — Nói (Speech to text).**
   - Dùng Web Speech API (`SpeechRecognition`, ngôn ngữ `en-US` / `en-GB`). Trình duyệt không hỗ trợ thì hiện thông báo và cho học sinh gõ thay.
   - Chấm bằng thuật toán khoảng cách từ đã có trong `src/lib/grading/dictation.ts`.
   - Tuỳ chọn số lần thử, mặc định 3.
   - Lưu cả văn bản nhận dạng được và (tuỳ chọn) file ghi âm lên Drive để giáo viên nghe lại.
4. **`VOICE_ANSWER` — Ghi âm trả lời.**
   - Dùng `MediaRecorder` (webm / opus), có giới hạn thời lượng; file lưu qua `StorageProvider` (Drive, riêng tư).
   - Chấm tay giống ESSAY; giáo viên nghe ngay trong modal chấm bài.
5. **`IMAGE_ANSWER` — Nộp ảnh / file.**
   - Học sinh chụp ảnh hoặc chọn ảnh (tối đa N ảnh); nén ở client trước khi gửi (cạnh dài ≤ 2000px, JPEG chất lượng 0.8); kiểm tra magic bytes.
   - Chấm tay. Giáo viên **vẽ / ghi chú lên ảnh** (canvas, lưu thành lớp chú thích riêng, không ghi đè ảnh gốc).
6. **`HIGHLIGHT` — Tô chọn từ.**
   - Dùng cho câu hỏi dạng đoạn văn (đặt trong phiếu trả lời): học sinh bấm chọn từ hoặc cụm từ.
   - `answerKey: { tokens: [indices] }`; chấm điểm thành phần, có trừ điểm khi tô sai.
7. **`ORDERING` — Sắp xếp thứ tự** câu hoặc từ (kéo thả để đổi vị trí). Chấm theo vị trí đúng, hoặc theo dãy con chung dài nhất (LCS).
8. **`WORDSEARCH` — Tìm chữ.** Tự sinh lưới chữ từ danh sách từ, có seed ngẫu nhiên lưu lại để lưới không đổi. Chấm theo số từ tìm được.
9. **`DRAW` — Vẽ** trên vùng ô (canvas, lưu PNG). Chấm tay.
10. **Worksheet từ ảnh (Fill on image):** cho phép tải ảnh JPG / PNG / WebP làm nền thay cho PDF. Mỗi ảnh = 1 trang (lưu `widthPt` / `heightPt` theo pixel). Toàn bộ editor và overlay giữ nguyên.
11. **Gợi ý ô trống tự động (từ "Giai đoạn 2" của plan cũ):** khi upload PDF, dùng `pdfjs getTextContent()` tìm các chuỗi `____`, `[   ]`, `( … )`, rồi đề xuất ô `TEXT` / `CHECKBOX` đúng vị trí. Giáo viên bấm "Chấp nhận tất cả" hoặc chọn từng ô.

**Tiêu chí hoàn thành:** mỗi dạng câu có unit test chấm điểm và 1 kịch bản E2E (giáo viên tạo → học sinh làm → giáo viên xem kết quả); không lộ `answerKey` của dạng mới; hiển thị đúng ở cả chế độ sáng/tối và VI/EN.

---

## Phase 14 — Workbook, trả bài & trợ giảng (so với TopWorksheets và Dạy Mãi)

1. **Workbook (sổ bài tập):** một tập worksheet có thứ tự, ví dụ "Level 3 Speaking practice", "Lớp T2-T6 (Tháng 11)".
   - Model: `Workbook { id, ownerId, title, description }` và `WorkbookItem { workbookId, worksheetId, order }`.
   - Giao workbook cho lớp: tạo assignment cho từng worksheet, dùng chung cài đặt; có tuỳ chọn mở dần (bài sau chỉ mở khi đã nộp bài trước).
   - Trang **bảng kết quả workbook**: hàng = học sinh, cột = worksheet; mỗi ô hiện ảnh thu nhỏ trang 1 kèm điểm (`10 / 10`, "Chờ chấm", hoặc trống); lọc theo học sinh hoặc workbook; xuất Excel.
2. **Trả bài & yêu cầu làm lại (Return submission):**
   - Thêm trạng thái bài nộp `RETURNED`. Giáo viên ghi nhận xét rồi "Trả bài" → học sinh nhận thông báo, xem nhận xét, được sửa và **nộp lại** (không tính thêm lượt).
   - Lưu lịch sử các lần nộp lại.
3. **Bảng "Bài nộp" của lớp:** tab mới trong trang lớp, liệt kê mọi bài nộp; lọc theo bài, học sinh, trạng thái ("Chờ chấm", "Đã trả", "Đã chấm"); thao tác chấm hàng loạt.
4. **Trợ giảng / đồng giáo viên (co-teacher):**
   - Model: `ClassTeacher { classId, userId, role: "OWNER" | "CO_TEACHER" | "ASSISTANT" }`.
   - Quyền:
     - `CO_TEACHER`: tương đương chủ lớp, nhưng không được xoá lớp.
     - `ASSISTANT`: chỉ chấm bài và điểm danh.
   - Sửa `requireTeacherOfClass` và mọi chỗ đang kiểm tra `cls.teacherId === user.id`.
5. **Thống kê nhóm:** điểm trung bình theo tuần, tỉ lệ nộp bài, học sinh chưa nộp nhiều nhất; dữ liệu lấy từ các bảng đã có.

**Tiêu chí hoàn thành:** giao 1 workbook 5 bài cho lớp, thấy bảng ma trận kết quả, trả 1 bài và học sinh nộp lại được, trợ giảng chấm được bài nhưng không xoá được lớp; có test IDOR cho các API mới.

---

## Phase 15 — Bài tập nộp ảnh / file & điểm offline (so với Dạy Mãi)

1. **Bài tập "theo sách hoặc file có sẵn":** giáo viên giao một đề (PDF, ảnh hoặc chỉ mô tả "Làm bài 3 trang 45 SGK"). Học sinh **chụp ảnh bài làm trên giấy** và nộp (dùng lại luồng `IMAGE_ANSWER` của Phase 13). Giáo viên chấm bằng cách vẽ / ghi chú lên ảnh, cho điểm và nhận xét.
2. **Nhập điểm offline:** giáo viên nhập điểm bài kiểm tra trên giấy cho cả lớp trong một bảng (hoặc import từ Excel); điểm này được tính vào báo cáo và cổng phụ huynh.
3. **Báo cáo học tập của lớp:** gộp điểm online + điểm offline + tỉ lệ nộp bài + (sau Phase 17) điểm danh; xuất Excel / PDF theo tháng.

**Tiêu chí hoàn thành:** học sinh nộp 3 ảnh từ điện thoại, giáo viên chấm có chú thích và học sinh xem lại được; điểm offline hiện trên trang phụ huynh.

---

## Phase 16 — Ngân hàng câu hỏi & tổ chức kỳ thi (từ "Giai đoạn 2" của plan cũ, và so với Dạy Mãi)

1. **Ngân hàng câu hỏi:**
   - Model: `QuestionBankItem { id, ownerId, type, prompt, options, answerKey, explanation, skillTag, level (A1–C2 hoặc lớp 1–12), difficulty (1–5), tags[], audioKey?, imageKey? }`.
   - Có thể lưu câu hỏi từ phiếu trả lời của worksheet vào ngân hàng; tìm kiếm và lọc theo tag, kỹ năng, độ khó; chia sẻ ngân hàng giữa các giáo viên.
2. **Tạo đề từ ma trận:** ví dụ "10 câu Grammar độ khó 2, 5 câu Reading độ khó 3", hệ thống bốc câu ngẫu nhiên thành một worksheet dạng phiếu trả lời.
3. **Sinh nhiều mã đề:** từ một đề, tạo N mã đề bằng cách trộn thứ tự câu và thứ tự đáp án; học sinh nhận ngẫu nhiên một mã; báo cáo chấm và thống kê gộp theo câu gốc.
4. **Kỳ thi nhiều lớp:** một kỳ thi giao cho nhiều lớp cùng lúc, dùng lại chế độ chống gian lận đã có; màn Live gộp tất cả lớp; báo cáo kết quả theo từng lớp và toàn kỳ thi.

**Tiêu chí hoàn thành:** tạo đề 20 câu từ ma trận, sinh 4 mã đề, 2 lớp thi cùng lúc, báo cáo thống kê đúng theo câu gốc.

---

## Phase 17 — Lịch dạy, buổi học & điểm danh (so với Dạy Mãi)

1. **Thời khoá biểu của lớp:** buổi học lặp lại hằng tuần (ví dụ T2 và T6, 18:00–19:30); trang "Lịch dạy" của giáo viên xem theo tuần hoặc tháng, có thể đổi buổi hoặc thêm buổi bù.
2. **Buổi học:**
   - Mỗi buổi có link học online (Google Meet hoặc Zoom, giáo viên tự dán link; **không** tích hợp Zoom bản quyền).
   - Đính kèm tài liệu và bài tập của buổi.
3. **Điểm danh:** các trạng thái có mặt / vắng có phép / vắng không phép / đi muộn; thông báo cho phụ huynh khi học sinh vắng; báo cáo chuyên cần theo tháng.

**Tiêu chí hoàn thành:** tạo lịch cho 1 lớp, điểm danh 1 buổi, phụ huynh nhận được thông báo vắng mặt; báo cáo ở Phase 15 có thêm cột chuyên cần.

---

## Phase 18 — Thư viện cộng đồng & AI tạo câu hỏi (so với TopWorksheets)

1. **Thư viện công khai:** giáo viên chọn "Công khai" cho worksheet → worksheet xuất hiện ở trang "Khám phá", có tìm kiếm theo trình độ, chủ đề, kỹ năng, dạng câu hỏi. Giáo viên khác bấm "Dùng bài này" để clone (dùng lại tính năng clone đã có).
   - Không bao giờ lộ `answerKey` ở trang xem trước.
   - Có nút báo cáo nội dung vi phạm; admin duyệt và ẩn bài.
2. **Yêu thích & theo dõi giáo viên;** trang hồ sơ công khai của giáo viên (danh sách worksheet công khai).
3. **AI tạo câu hỏi** (dùng Gemini API, biến `GEMINI_API_KEY`):
   - Từ một đoạn văn hoặc trang PDF, sinh câu trắc nghiệm, câu hỏi mở, điền từ hoặc wordsearch.
   - Giáo viên **xem lại và sửa trước khi lưu** vào phiếu trả lời hoặc ngân hàng câu hỏi.
   - Giới hạn số lượt gọi / ngày / giáo viên; không gửi dữ liệu học sinh lên AI.
4. **Giao bài bằng link (lớp mở):** tạo link làm bài không cần tài khoản; học sinh nhập tên trước khi làm. Chỉ dùng cho bài luyện tập, tắt chống gian lận, không tính vào bảng xếp hạng lớp.

---

## Ngoài phạm vi (chưa làm, chỉ ghi lại)
App mobile native, thanh toán / học phí, bán bài giảng (thương mại hoá), website cá nhân cho giáo viên, tích hợp Zoom bản quyền, AI Studio biên tập video, "gia sư AI" cho học sinh, chứng chỉ, tích hợp Google Classroom / Microsoft Teams, import từ Liveworksheets.

---

## Tiến độ

_(Agent ghi vào đây sau mỗi Phase: đã làm gì, còn thiếu gì, quyết định nào khác plan và lý do, kết quả `lint / typecheck / test / test:e2e`, commit hash.)_

### Phase 11 — Dọn nợ kỹ thuật & lỗi phát hiện ngày 24/11/2026 (Hoàn thành — 24/11/2026)
- **Đã làm:**
  1. Commit toàn bộ thay đổi Phase 10 (`9f8543e`), không đính kèm thư mục test tạm ngoài git (`file word test/`).
  2. Sửa lỗi phiên đăng nhập cũ sau khi re-seed DB:
     - Server: thêm `requireLayoutUser()` trong `src/lib/permissions.ts`, áp dụng cho 4 layout (`teacher`, `student`, `parent`, `admin`) và `src/app/page.tsx`. Khi tài khoản bị xoá hoặc bị khoá, redirect qua `/api/auth/clear-session?reason=session|locked` để xoá sạch cookie NextAuth rồi mới đưa về `/login?reason=...` (tránh vòng lặp redirect với `src/middleware.ts`).
     - Client: thêm `src/lib/api-client.ts` (`ApiError`, `apiFetchJson`, `getSessionExpiryReason`) và gắn `QueryCache`/`MutationCache` `onError` trong `src/components/providers.tsx` để tự gọi `signOut({ callbackUrl: "/login?reason=session|locked" })`. Trang `/login` hiển thị banner thông báo phiên hết hạn / tài khoản bị khoá.
  3. Tách thư mục build: `next.config.ts` đọc `distDir` từ `NEXT_DIST_DIR`, thêm script `pnpm build:check` (`NEXT_DIST_DIR=.next-build`), thêm `/.next-build/` vào `.gitignore`. Đã xác minh chạy song song với `pnpm dev` đang hoạt động không làm lỗi server dev.
  4. Việt/Anh hoá server: thêm `src/lib/i18n/api-errors.ts` (`localizeApiError`, `localizeNotification`), cập nhật `handleApiError` và `/api/notifications` đọc cookie `lang`, thêm mã có cấu trúc `code: "BLANK" | "TRUE" | "FALSE"` cho `commonWrongAnswers` trong `reportService`, Việt/Anh hoá file Excel điểm số và sửa sạch chữ tiếng Việt còn sót ở trang chấm bài (`/teacher/assignments/[id]/grading`).
- **Quyết định kỹ thuật:** bổ sung route `/api/auth/clear-session` và ngoại lệ `reason` trên `/login` trong `src/middleware.ts` để ngăn vòng lặp redirect giữa middleware (đọc JWT cookie) và Server Layout (kiểm tra DB).
- **Kiểm thử:** `pnpm lint` (0 cảnh báo/lỗi), `pnpm typecheck` (0 lỗi), `pnpm test` (57/57 pass), `pnpm build:check` (pass song song với `pnpm dev`), `pnpm test:e2e` (10/10 pass, gồm Flow 10 kiểm tra stale session server/client và trang chấm bài EN).
- **Commit:** `54afc27`

### Phase 12 — Tích hợp Google Drive để lưu bài tập (Hoàn thành — 24/11/2026)
- **Đã làm:**
  1. **CSDL & Migration (`20261124081749_google_drive_integration`):** thêm enum `DriveConnectionStatus`, `DriveFileKind`, `DriveUploadStatus` và các bảng `DriveConnection`, `DriveFile`, `DriveUpload`, `DriveTrash`; thêm `lastDriveBackupAt`, `lastDriveBackupFileId` trên `Worksheet` và `driveFileId` trên `LessonItem`.
  2. **REST client & bảo mật (`src/lib/drive/google-drive.ts`):** thuần `fetch` không thêm SDK; mã hoá AES-256-GCM cho refresh token & upload session URI (`DRIVE_ENCRYPTION_KEY`); OAuth 2.0 với cookie `state` (`timingSafeEqual`) + **PKCE S256** và phạm vi tối thiểu `drive.file`; kiểm tra header `Origin` ở mọi route POST/PATCH/DELETE; phân loại lỗi Google (`storageQuotaExceeded` → 507, `invalid_grant` → đánh dấu `REVOKED` + 409, `rateLimitExceeded` / 429 / 5xx → retry exponential backoff).
  3. **StorageProvider & cấu trúc thư mục (`src/lib/storage/drive.ts`, `src/lib/storage/index.ts`, `src/server/driveService.ts`):**
     - Hỗ trợ cả **Drive dùng chung** (`/admin`) và **Drive riêng của giáo viên** (`/teacher/settings`), ưu tiên `Drive riêng → Drive dùng chung → local/s3` (tự fallback về local kèm log cảnh báo nếu chưa kết nối).
     - File ≤ 5 MiB dùng multipart upload; > 5 MiB dùng resumable upload server-side theo chunk 8 MiB có resume `308`.
     - Stream hỗ trợ header HTTP `Range` (`206 Partial Content`) trên `/api/files/[...key]`, `/api/submissions/[id]/audio/[audioId]/stream`, `/api/drive/files/[id]/view` và `/download`.
     - Cấu trúc thư mục chuẩn 12.4 (`EngClass/<Tên GV>/Worksheets|Backups|Lớp ...`) với `appProperties.engclassFolder` tự đổi tên thư mục khi đổi tên worksheet/lớp; mọi file mặc định riêng tư (công tắc riêng ở `/admin` cho video bài giảng Drive Preview).
     - Upload video bài giảng trực tiếp từ trình duyệt (Option B, `src/lib/drive-upload.ts`, chunk 8 MiB, retry/resume, kiểm tra magic bytes 4 KiB đầu).
  4. **Giao diện:** thẻ Google Drive ở `/admin` (trạng thái, email, dung lượng `about.get`, công tắc Drive Preview, nút Kết nối / Ngắt kết nối / Dọn file mồ côi); trang `/teacher/settings` (kết nối Drive riêng, tự động sao lưu hằng ngày); `/teacher/worksheets` (nút "Lưu lên Drive", "Sao lưu tất cả lên Drive", huy hiệu "Đã lưu trên Drive", "Nhập từ Drive" hỗ trợ Google Picker + danh sách file Drive); `WorksheetEditor` hiển thị nơi lưu PDF & file nghe ("Google Drive" / "Máy chủ").
  5. **Dọn dẹp & tài liệu:** hàng đợi `DriveTrash` khi xoá worksheet/bài tập/bài giảng/lớp (không gọi Google trong transaction DB), `src/instrumentation.ts` (chạy `pruneDrive` định kỳ & `runDailyAutoBackup` lúc 02:00 giữ 14 bản), CLI `pnpm drive:prune` (`scripts/prune-drive.ts`), cập nhật `.env.example` và viết `docs/GOOGLE_DRIVE.md`.
- **Chưa kiểm thử thủ công với Google thật:** cần admin điền `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DRIVE_ENCRYPTION_KEY` và thử OAuth + upload thật theo hướng dẫn trong `docs/GOOGLE_DRIVE.md`. Toàn bộ luồng `STORAGE_DRIVER=drive` đã được kiểm thử tự động bằng mock Google REST API.
- **Kiểm thử:** `pnpm lint` (0 cảnh báo/lỗi), `pnpm typecheck` (0 lỗi), `pnpm test` (66/66 pass, gồm `tests/unit/drive.test.ts` và `tests/integration/drive-integration.test.ts`), `pnpm drive:prune` (pass), `pnpm build:check` (42/42 route pass), `pnpm test:e2e` (11/11 pass, gồm Flow 11 Google Drive UI/CSRF/IDOR).
