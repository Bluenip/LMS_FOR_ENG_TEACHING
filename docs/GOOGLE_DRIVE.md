# Tích hợp Google Drive — EngClass LMS

EngClass LMS hỗ trợ lưu trữ toàn bộ học liệu bài tập lên Google Drive thay cho ổ đĩa máy chủ: PDF đề thi, file nghe Listening/Dictation, file Word nguồn, gói backup `.engclass.zip`, tài liệu/video bài giảng và bài nộp của học sinh.

Toàn bộ tích hợp được viết bằng TypeScript dùng **Google Drive REST API v3** qua `fetch` thuần (không thêm SDK nặng).

---

## 1. Kiến trúc & Chính sách bảo mật

- **Scope tối thiểu:** chỉ xin `https://www.googleapis.com/auth/drive.file` — ứng dụng chỉ thấy các file do chính EngClass tạo ra hoặc file giáo viên chọn chủ động qua Google Picker.
- **OAuth 2.0 + PKCE (S256):** dùng cookie `HttpOnly` lưu cặp `state` + `code_verifier` (được mã hoá AES-256-GCM), so khớp `state` bằng `timingSafeEqual`. Mọi request `POST`/`PATCH`/`DELETE` dưới `/api/drive/**` đều kiểm tra header `Origin`.
- **Mã hoá bí mật:** `refresh_token` và `sessionUri` (upload resumable) được mã hoá **AES-256-GCM** bằng `DRIVE_ENCRYPTION_KEY` trước khi lưu PostgreSQL; không bao giờ ghi ra log hay trả về client.
- **Hai chế độ kết nối (thứ tự ưu tiên):**
  1. **Drive riêng của giáo viên** (`/teacher/settings`) — ưu tiên cao nhất cho học liệu của giáo viên đó.
  2. **Drive dùng chung của trường / trung tâm** (`/admin`) — admin kết nối một lần cho toàn hệ thống.
  3. **Fallback (`local` / `s3`)** — nếu chưa kết nối Drive nào khi `STORAGE_DRIVER=drive`, hệ thống tự quay về driver local và ghi cảnh báo trong log, không làm sập trang.
- **Chính sách riêng tư:**
  - **Mọi file mặc định ở chế độ riêng tư** (không đặt quyền `anyone with the link`).
  - Học sinh và phụ huynh chỉ truy cập qua `/api/files/[...key]`, `/api/submissions/[id]/audio/[audioId]/stream`, hoặc `/api/drive/files/[id]/view` — máy chủ kiểm tra quyền trên mọi request và hỗ trợ header HTTP `Range` để tua audio/video.
  - Ngoại lệ duy nhất: video bài giảng dùng trình phát Google Drive Preview chỉ được đặt `anyone/reader` (`allowFileDiscovery: false`) khi admin bật công tắc riêng trên `/admin`.
- **Upload theo kích thước:**
  - Server-side `StorageProvider.put`: file ≤ 5 MiB dùng **multipart upload**; file > 5 MiB dùng **resumable upload** theo từng chunk 8 MiB (có tự resume qua `308` khi gặp lỗi tạm thời).
  - Video bài giảng lớn: dùng **Option B** (trình duyệt upload thẳng chunk 8 MiB lên Drive qua session URI, tự retry/resume theo offset của Drive, kiểm tra magic bytes 4 KiB đầu file trước khi hoàn tất).

---

## 2. Cấu trúc thư mục trên Google Drive

```text
EngClass/
└── <Tên giáo viên>/
    ├── Worksheets/<Tên worksheet>/              ← de.pdf, audio-1.mp3, nguon.docx
    ├── Backups/<yyyy-mm-dd>/                    ← <Tên worksheet>.engclass.zip, thu-vien.zip
    └── Lớp <Tên lớp>/
        ├── Bài giảng/                           ← tài liệu, video bài giảng
        └── <Tên bài tập>/<Tên học sinh>/        ← bài nộp học sinh (riêng tư)
```

Mỗi thư mục được gắn khóa ổn định trong `appProperties.engclassFolder`. Khi giáo viên đổi tên worksheet hoặc đổi tên lớp, thư mục tương ứng trên Drive tự đổi tên ở lần ghi file kế tiếp mà không tạo trùng.

---

## 3. Hướng dẫn cấu hình Google Cloud (làm một lần)

1. Mở [Google Cloud Console](https://console.cloud.google.com/) → tạo hoặc chọn một Project.
2. Vào **APIs & Services → Library**:
   - Bật **Google Drive API**.
   - Nếu muốn dùng nút **Chọn trên Drive (Google Picker)**, bật thêm **Google Picker API**.
3. Vào **Google Auth Platform / OAuth consent screen**:
   - Chọn **External** (hoặc **Internal** nếu tất cả tài khoản đều thuộc Google Workspace nội bộ).
   - Điền tên ứng dụng (ví dụ `EngClass LMS`), email hỗ trợ.
   - Thêm duy nhất scope: `https://www.googleapis.com/auth/drive.file`.
   - **QUAN TRỌNG:** Khi app ở trạng thái **Testing**, Google chỉ cho `refresh_token` sống **7 ngày** (sau đó bị lỗi `invalid_grant`). Để dùng lâu dài ở production, hãy bấm **Publish app → In production**. Scope `drive.file` là non-sensitive nên quy trình xác minh nhẹ hơn rất nhiều so với `drive` toàn quyền.
4. Vào **Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - **Authorized JavaScript origins**: `https://<ten-mien-cua-ban>` (và `http://localhost:3000` khi phát triển).
   - **Authorized redirect URIs**: `https://<ten-mien-cua-ban>/api/drive/callback` (và `http://localhost:3000/api/drive/callback`).
   - Sao chép **Client ID** và **Client Secret**.
5. *(Tuỳ chọn — cho Google Picker)* Vào **Credentials → Create Credentials → API key**, giới hạn theo HTTP referrer (`https://<ten-mien>/*`) và chỉ cho phép **Google Picker API**.

---

## 4. Biến môi trường

```env
STORAGE_DRIVER="drive"          # hoặc giữ "local" nếu chỉ dùng Drive cho Backup/Import
APP_URL="https://lms.example.com"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
GOOGLE_REDIRECT_URI=""          # mặc định ${APP_URL}/api/drive/callback
DRIVE_ENCRYPTION_KEY="..."      # tạo bằng: openssl rand -base64 48

# Tuỳ chọn cho Google Picker
NEXT_PUBLIC_GOOGLE_CLIENT_ID="..."
NEXT_PUBLIC_GOOGLE_PICKER_API_KEY="..."

# Job nền
DRIVE_PRUNE_INTERVAL_MINUTES="60"   # đặt 0 để tắt job nền
DRIVE_AUTO_BACKUP_HOUR="2"          # 02:00 hằng ngày
DRIVE_BACKUP_RETENTION="14"         # giữ 14 bản backup gần nhất
```

> **Lưu ý:** Không commit `.env` lên git. Nếu đổi `DRIVE_ENCRYPTION_KEY`, các kết nối Drive cũ không giải mã được và cần kết nối lại.

---

## 5. Hàng đợi xoá & Sao lưu tự động

- **Thùng rác an toàn (`DriveTrash`):** Khi xoá worksheet, bài tập, bài giảng hoặc lớp, EngClass ghi các `driveFileId` vào bảng `DriveTrash` (không gọi Google trong transaction DB). Job `pruneDrive` chuyển các file đó vào **thùng rác Google Drive (`trashed=true`)**, không xoá vĩnh viễn (Google tự dọn thùng rác sau 30 ngày).
- **Chạy thủ công:**
  - Trong giao diện `/admin` → nút **Dọn file mồ côi**.
  - Qua CLI / cron: `pnpm drive:prune [graceHours]` (mặc định `24`).
- **Tự động sao lưu hằng ngày:** Giáo viên bật trong `/teacher/settings`. Job chạy lúc `DRIVE_AUTO_BACKUP_HOUR` (mặc định 02:00), chỉ backup các worksheet có thay đổi sau `lastDriveBackupAt`, và tự đưa các bản backup cũ hơn `DRIVE_BACKUP_RETENTION` (14) vào hàng đợi thùng rác.
- **Ngắt kết nối:** Chỉ thu hồi và xoá `encryptedRefreshToken`; giữ lại `rootFolderId` và `email` để khi kết nối lại cùng tài khoản sẽ dùng tiếp thư mục cũ.

---

## 6. Checklist Production

- [ ] OAuth consent screen đã chuyển sang **In production** (refresh token không hết hạn sau 7 ngày).
- [ ] `APP_URL` dùng HTTPS và khớp chính xác với **Authorized redirect URIs** trên Google Cloud.
- [ ] `DRIVE_ENCRYPTION_KEY` có tối thiểu 32 ký tự ngẫu nhiên (`openssl rand -base64 48`), sao lưu an toàn ngoài repo.
- [ ] Đã chạy migration Prisma (`pnpm prisma migrate deploy`).
- [ ] Thử đầy đủ luồng với tài khoản thật: Kết nối → tạo worksheet PDF + Audio → học sinh làm bài xem PDF & nghe audio → Backup lên Drive → Nhập lại sang tài khoản giáo viên khác → Xoá worksheet → Chạy `pnpm drive:prune` và xác nhận file nằm trong Thùng rác Drive.
- [ ] Kiểm tra trên Google Drive: **không có file nào** bị chia sẻ công khai ngoài ý muốn.
- [ ] Theo dõi dung lượng tài khoản Google Drive (xem trực tiếp trong thẻ Google Drive ở `/admin` hoặc `/teacher/settings`).
