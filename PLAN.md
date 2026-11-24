# PLAN — LMS dạy tiếng Anh (có Worksheet PDF tương tác)

> Tài liệu này dành cho agent viết code (Antigravity) và để Claude review sau.
> Làm **theo đúng thứ tự Phase**. Xong mỗi Phase phải chạy được, có seed data và đạt hết mục "Tiêu chí hoàn thành" của Phase đó rồi mới sang Phase sau.
> Không dùng tên, logo hay giao diện của SHub hay Liveworksheets. Tên tạm của sản phẩm là **"EngClass"**, đổi được qua biến môi trường `NEXT_PUBLIC_APP_NAME`.

---

## 0. Tổng quan

Hệ thống LMS gồm 4 vai trò: **Admin**, **Giáo viên (Teacher)**, **Học sinh (Student)** và **Phụ huynh (Parent)**.

Các tính năng nổi bật:
- **Worksheet PDF tương tác** (mục 3–5)
- **Bảng xếp hạng lớp**, theo từng bài và theo cả học kỳ (mục 6A)
- **Cổng Phụ huynh**: xem tình hình của con và so sánh với lớp (mục 6B)
- **Chế độ thi chống gian lận**: khoá màn hình, phát hiện hành vi bất thường và báo ngay cho giáo viên (mục 6C)

Giao diện tham khảo nằm ở project Google Stitch "EngClass Learning Management System". Bản export được đặt trong thư mục `design/`.

Tính năng chính là **Worksheet PDF**: giáo viên tải PDF lên, học sinh làm bài trực tiếp trên PDF đó. Có 2 chế độ, dùng riêng hoặc kết hợp trong cùng một bài:

| Chế độ | Mô tả | Tương tự |
|---|---|---|
| **A. Overlay** | Giáo viên kéo, thả và căn ô nhập liệu đè lên đúng vị trí trên trang PDF. Học sinh điền trực tiếp vào các ô đó. | Liveworksheets |
| **B. Phiếu trả lời** | PDF hiển thị bên trái, phiếu trả lời bên phải (câu 1..N: trắc nghiệm A/B/C/D, Đúng/Sai, điền ngắn). Giáo viên chỉ nhập số câu và đáp án, không cần căn vị trí. | SHub |
| **A + B** | Một bài dùng được cả hai: một số câu là ô overlay, số còn lại nằm trong phiếu. | |

---

## 1. Tech stack (bắt buộc)

- **Next.js 15 (App Router) + TypeScript (strict)**
- **PostgreSQL** + **Prisma ORM**
- **Auth.js (NextAuth v5)**: đăng nhập bằng email/mật khẩu (Credentials, hash bằng bcrypt hoặc argon2). Google OAuth để tuỳ chọn, làm sau.
- **Tailwind CSS** + **shadcn/ui**
- **pdfjs-dist**: render PDF ra canvas (không dùng iframe hay `<embed>`)
- **react-rnd**: kéo và resize ô ở editor
- **zod**: validate mọi input ở server (Server Actions và Route Handlers)
- **TanStack Query** cho data fetching phía client khi cần
- Lưu file: interface `StorageProvider` có 2 implementation là `LocalStorageProvider` (thư mục `./uploads`, dùng khi dev) và `S3StorageProvider` (S3, R2 hoặc MinIO). Chọn implementation bằng biến env `STORAGE_DRIVER`.
- **exceljs**: xuất bảng điểm
- Test: **Vitest** (unit, đặc biệt cho logic chấm điểm) và **Playwright** (e2e cho luồng chính)
- `docker-compose.yml` chạy Postgres (và MinIO nếu cần)

Cấu trúc thư mục gợi ý:

```
src/
  app/
    (auth)/login, register
    (teacher)/teacher/...
    (student)/student/...
    admin/...
    api/...
  components/
    worksheet/          # PdfPage, FieldOverlay, FieldEditor, AnswerSheet, ...
    ui/                 # shadcn
  lib/
    auth.ts, db.ts, storage/, grading/, validators/
  server/               # service layer: classService, worksheetService, ...
prisma/schema.prisma, seed.ts
tests/
```

---

## 2. Data model (Prisma, bản phác thảo — được thêm field nếu cần, không bỏ field)

```prisma
enum Role { ADMIN TEACHER STUDENT PARENT }

// Liên kết phụ huynh ↔ học sinh. Một phụ huynh có thể có nhiều con, một học sinh có thể có nhiều phụ huynh.
model ParentLink {
  id         String   @id @default(cuid())
  parentId   String
  studentId  String
  relation   String?            // "Bố", "Mẹ", "Người giám hộ"
  verifiedAt DateTime?          // null = chưa xác nhận
  createdAt  DateTime @default(now())
  @@unique([parentId, studentId])
}

// Mã liên kết do học sinh hoặc giáo viên tạo, phụ huynh nhập mã để liên kết với con
model ParentInviteCode {
  id        String   @id @default(cuid())
  studentId String
  code      String   @unique     // 8 ký tự
  expiresAt DateTime
  usedAt    DateTime?
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  phone        String?  @unique
  name         String
  passwordHash String
  role         Role     @default(STUDENT)
  avatarUrl    String?
  createdAt    DateTime @default(now())
}

model Class {
  id          String   @id @default(cuid())
  name        String
  description String?
  joinCode    String   @unique        // 6 ký tự, không dùng các ký tự dễ nhầm 0/O/1/I
  teacherId   String
  archived    Boolean  @default(false)
  createdAt   DateTime @default(now())
}

model Enrollment {
  id        String   @id @default(cuid())
  classId   String
  studentId String
  status    EnrollmentStatus @default(ACTIVE)   // PENDING nếu lớp bật duyệt
  joinedAt  DateTime @default(now())
  @@unique([classId, studentId])
}

model Post {            // bảng tin lớp
  id String @id @default(cuid())
  classId String
  authorId String
  content String
  createdAt DateTime @default(now())
}
model Comment { id String @id @default(cuid()) postId String authorId String content String createdAt DateTime @default(now()) }

model Lesson {          // tài liệu / bài giảng
  id String @id @default(cuid())
  classId String
  title String
  order Int
  items LessonItem[]    // file PDF, video, audio, link
}

// ===== WORKSHEET =====
model Worksheet {
  id          String   @id @default(cuid())
  ownerId     String                       // giáo viên
  title       String
  instructions String?
  pdfFileKey  String?                      // null = worksheet không dùng PDF (chỉ có phiếu trả lời)
  pageCount   Int      @default(0)
  pages       WorksheetPage[]
  fields      Field[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model WorksheetPage {
  id          String @id @default(cuid())
  worksheetId String
  pageIndex   Int                          // bắt đầu từ 0
  widthPt     Float                        // kích thước gốc của trang PDF (đơn vị point)
  heightPt    Float
  @@unique([worksheetId, pageIndex])
}

enum FieldPlacement { OVERLAY ANSWER_SHEET }
enum FieldType {
  TEXT            // điền từ / câu ngắn
  NUMBER
  MULTIPLE_CHOICE // chọn 1 trong các option (A/B/C/D hoặc tuỳ ý)
  MULTI_SELECT    // chọn nhiều
  TRUE_FALSE
  DROPDOWN        // overlay: chọn từ danh sách thả xuống
  CHECKBOX        // overlay: tick vào ô vuông trên trang
  ESSAY           // tự luận, giáo viên chấm tay
  // Giai đoạn 2: DRAG_DROP, MATCH_LINE, AUDIO_RECORD
}

model Field {
  id          String         @id @default(cuid())
  worksheetId String
  placement   FieldPlacement
  type        FieldType
  label       String          // số câu hiển thị, vd "1", "2a"
  order       Int             // thứ tự chấm / hiển thị
  points      Float  @default(1)

  // Chỉ dùng cho OVERLAY. Toạ độ CHUẨN HOÁ 0..1 theo kích thước trang (không lưu pixel)
  pageIndex   Int?
  x           Float?
  y           Float?
  w           Float?
  h           Float?
  style       Json?           // { fontSize, align, color, transparentBg }

  options     Json?           // MC/DROPDOWN: [{ id, text }]
  answerKey   Json            // xem mục 4. KHÔNG BAO GIỜ gửi xuống client của học sinh
  gradingOpts Json?           // { caseSensitive, ignorePunctuation, ignoreExtraSpaces, partialCredit }
}

// ===== GIAO BÀI & LÀM BÀI =====
model Assignment {
  id            String   @id @default(cuid())
  classId       String
  worksheetId   String
  title         String
  openAt        DateTime?
  dueAt         DateTime?
  timeLimitMin  Int?               // null = không giới hạn thời gian
  maxAttempts   Int     @default(1)
  shuffle       Boolean @default(false)   // chỉ áp dụng cho câu trong phiếu trả lời
  showResult    ShowResultMode @default(AFTER_SUBMIT)  // NEVER | AFTER_SUBMIT | AFTER_DUE
  showAnswerKey Boolean @default(false)
  allowLate     Boolean @default(false)

  // Bảng xếp hạng
  showLeaderboard  LeaderboardMode @default(AFTER_DUE)   // OFF | AFTER_SUBMIT | AFTER_DUE
  leaderboardAnon  Boolean @default(false)               // true: chỉ hiện tên top 3 và chính mình, còn lại ẩn tên

  // Chống gian lận (xem mục 6C)
  proctorMode      ProctorMode @default(OFF)   // OFF | MONITOR | LOCKDOWN | SEB
  violationAction  ViolationAction @default(WARN)  // hành động khi chạm ngưỡng, xem mục 6C
  maxViolations    Int     @default(3)            // ngưỡng: 1 = xử lý ngay ở lần vi phạm đầu tiên
  requireFullscreen Boolean @default(false)
  blockCopyPaste   Boolean @default(false)
  sebConfigKeyHash String?                     // chỉ dùng khi proctorMode = SEB

  createdAt     DateTime @default(now())
}

enum ViolationAction {
  WARN          // chỉ cảnh báo và báo giáo viên
  LOCK          // khoá bài, chỉ giáo viên mở khoá được ("nhảy tab là khoá luôn" = LOCK + maxViolations 1)
  RESTART       // huỷ toàn bộ đáp án, bắt làm lại từ đầu ("thoát ra là làm lại" = RESTART + maxViolations 1)
  AUTO_SUBMIT   // tự nộp bài với các đáp án hiện có
}

enum ProctorEventType {
  TAB_HIDDEN          // visibilitychange -> hidden (rời tab, đổi app)
  WINDOW_BLUR         // cửa sổ mất focus
  FULLSCREEN_EXIT
  COPY
  PASTE
  CUT
  CONTEXT_MENU
  PRINT_SCREEN_KEY
  DEVTOOLS_SUSPECTED
  MULTI_SCREEN        // Window Management API báo có nhiều màn hình
  MULTI_SESSION       // cùng tài khoản mở bài thi ở tab hoặc thiết bị khác
  NETWORK_OFFLINE
  RESIZE_SUSPICIOUS   // thu nhỏ cửa sổ hoặc chia đôi màn hình
}

model ProctorEvent {
  id           String   @id @default(cuid())
  submissionId String
  type         ProctorEventType
  at           DateTime @default(now())    // giờ server
  durationMs   Int?                         // thời gian rời tab, nếu có
  meta         Json?                        // userAgent, kích thước màn hình...
  @@index([submissionId, at])
}

// Bổ sung vào Submission:
//   violationCount Int @default(0)
//   flagged        Boolean @default(false)   // giáo viên đánh dấu nghi vấn
//   lockedAt       DateTime?                 // bị khoá do vượt ngưỡng vi phạm
//   attemptVersion Int @default(0)           // tăng mỗi lần RESTART
//   restartCount   Int @default(0)
//   rulesAcceptedAt DateTime?                // thời điểm học sinh đồng ý nội quy
//   unlockedById   String?                   // giáo viên mở khoá cho làm tiếp

model Submission {
  id            String   @id @default(cuid())
  assignmentId  String
  studentId     String
  attemptNo     Int
  status        SubmissionStatus  // IN_PROGRESS | SUBMITTED | GRADED
  startedAt     DateTime @default(now())
  submittedAt   DateTime?
  autoScore     Float?
  manualScore   Float?
  totalScore    Float?
  maxScore      Float
  answers       Answer[]
  @@unique([assignmentId, studentId, attemptNo])
}

model Answer {
  id           String  @id @default(cuid())
  submissionId String
  fieldId      String
  value        Json      // string | string[] | boolean
  isCorrect    Boolean?
  score        Float?
  teacherNote  String?
  @@unique([submissionId, fieldId])
}
```

---

## 3. Worksheet Editor (giáo viên) — phần quan trọng nhất

Route: `/teacher/worksheets/[id]/edit`

### 3.1 Upload PDF
- Chỉ nhận `application/pdf`, tối đa 20MB (cấu hình được). Server kiểm tra magic bytes `%PDF`, không chỉ dựa vào đuôi file.
- Sau khi upload, server dùng pdfjs để đọc `pageCount` và kích thước từng trang rồi tạo các bản ghi `WorksheetPage`.
- (Tuỳ chọn) Render sẵn thumbnail trang 1 để hiển thị trong danh sách.

### 3.2 Layout editor
```
┌───────────────┬──────────────────────────────────┬──────────────────┐
│ Thumbnails    │  Trang PDF (canvas) + lớp overlay │ Panel thuộc tính │
│ các trang     │  - Toolbar: Chọn | Thêm ô: Text,  │ của ô đang chọn: │
│               │    Dropdown, Checkbox, MC, Essay  │ type, label,     │
│               │  - Zoom 50–200%                   │ đáp án, điểm,    │
│               │                                   │ font size...     │
├───────────────┴──────────────────────────────────┴──────────────────┤
│ Tab "Phiếu trả lời": danh sách câu ANSWER_SHEET (chế độ B)           │
└────────────────────────────────────────────────────────────────────┘
```

### 3.3 Chế độ A — Overlay (căn ô thủ công)
- Chọn công cụ, rồi **kéo chuột vẽ hình chữ nhật** trên trang để tạo ô. Ô tạo ra di chuyển và resize được (react-rnd), xoá bằng phím Delete, nhân bản bằng Ctrl+D, dịch chuyển bằng phím mũi tên (giữ Shift để dịch 10px).
- **Toạ độ lưu ở dạng chuẩn hoá 0..1** so với kích thước trang: `x = left / pageWidthPx`, tương tự cho y, w, h. Nhờ vậy, ở bất kỳ mức zoom hay màn hình nào, ô vẫn nằm đúng vị trí. Đây là yêu cầu bắt buộc.
- Có snap to grid (bật/tắt được) và đường gióng khi căn thẳng hàng với ô khác (nice-to-have).
- Chọn nhiều ô để căn trái/phải/trên/dưới hoặc chỉnh đều kích thước (nice-to-have).
- Tự động đánh số `label` theo thứ tự đọc (trên xuống dưới, trái sang phải) và cho phép sửa tay.
- Hiển thị ô ở editor: viền màu theo type, góc trên hiện label.

### 3.4 Chế độ B — Phiếu trả lời (nhập nhanh)
- Form tạo nhanh: "Thêm **N** câu, kiểu **[Trắc nghiệm A–D | Đúng/Sai | Điền ngắn]**, bắt đầu từ câu số **k**".
- **Nhập đáp án nhanh bằng chuỗi**: giáo viên dán `ABCDA BCDDA ...` hoặc `1A 2B 3C` thì hệ thống tự điền đáp án cho các câu trắc nghiệm.
- Với câu điền ngắn: mỗi câu có ô "đáp án chấp nhận", nhiều đáp án cách nhau bằng `|`, ví dụ `don't|do not`.

### 3.5 Lưu
- Tự động lưu (debounce 1s) và hiển thị trạng thái "Đã lưu / Đang lưu…".
- Dùng một endpoint `PUT /api/worksheets/:id/fields` nhận toàn bộ danh sách field, validate bằng zod và ghi trong transaction.
- Nút **"Xem như học sinh"** mở chế độ preview để làm thử và chấm thử ngay.

---

## 4. Định dạng `answerKey` & logic chấm (đặt trong `lib/grading/`, có unit test đầy đủ)

| type | answerKey | Quy tắc |
|---|---|---|
| TEXT | `{ accepted: string[] }` | Chuẩn hoá theo `gradingOpts`: mặc định trim, gộp khoảng trắng, không phân biệt hoa thường, coi `’` và `'` là một. Đúng nếu khớp bất kỳ phần tử nào trong `accepted`. |
| NUMBER | `{ value: number, tolerance?: number }` | |
| MULTIPLE_CHOICE / DROPDOWN | `{ correct: optionId }` | |
| MULTI_SELECT | `{ correct: optionId[] }` | Cho điểm thành phần nếu bật `partialCredit` |
| TRUE_FALSE | `{ correct: boolean }` | |
| CHECKBOX | `{ checked: boolean }` | |
| ESSAY | `{ rubric?: string }` | Không chấm tự động. Submission ở trạng thái chờ giáo viên chấm tay. |

- Hàm `gradeField(field, value) → { isCorrect, score }` là **pure function** và có test cho từng type cùng các edge case (chuỗi rỗng, unicode, dấu nháy, khoảng trắng).
- **Chỉ chấm ở server.** API trả worksheet cho học sinh phải dùng select tường minh, **loại bỏ `answerKey` và `gradingOpts`**. Cần một test e2e hoặc integration khẳng định response học sinh nhận được không chứa `answerKey`.

---

## 5. Màn hình làm bài (học sinh)

Route: `/student/assignments/[id]/do`

- Render các trang PDF bằng canvas, cuộn dọc, có lazy load từng trang (chỉ render trang gần viewport).
- Overlay: mỗi field là một `<input>`, `<select>` hoặc checkbox **thật** (không vẽ lên canvas), đặt `position:absolute` theo toạ độ chuẩn hoá nhân với kích thước trang đang hiển thị. Font size co giãn theo zoom.
- Có phiếu trả lời ở panel bên phải nếu worksheet có field ANSWER_SHEET. Trên mobile, panel này chuyển thành bottom sheet.
- Bấm vào số câu ở phiếu thì cuộn tới ô overlay tương ứng (nếu có).
- **Autosave** mỗi khi có thay đổi (debounce 1–2s) vào `Answer`. Khi tải lại trang không mất bài.
- Đồng hồ đếm ngược nếu có `timeLimitMin`. Hết giờ thì tự nộp. **Thời gian tính theo server** (`startedAt`), không tin đồng hồ của client.
- Nút Nộp bài có hộp xác nhận và cảnh báo số câu còn bỏ trống.
- Sau khi nộp, tuỳ `showResult`: các ô tô xanh/đỏ, hiện điểm, và hiện đáp án đúng nếu `showAnswerKey`.
- Responsive: dùng được trên điện thoại (pinch-zoom, hoặc nút zoom kèm cuộn ngang trong vùng PDF).

---

## 6. Các phân hệ còn lại

**Lớp học**
- Giáo viên tạo, sửa, lưu trữ lớp. Mã vào lớp có thể tạo lại.
- Học sinh nhập mã để vào lớp, có tuỳ chọn "cần giáo viên duyệt".
- Danh sách học sinh: giáo viên có thể xoá học sinh hoặc import từ Excel (tạo tài khoản hàng loạt, nice-to-have).

**Bảng tin lớp**: bài đăng và bình luận. Thông báo trong app khi có bài tập mới hoặc có điểm.

**Bài giảng**: chia chương, mỗi item là PDF (xem bằng viewer có sẵn), video (upload hoặc link YouTube), audio (dùng cho Listening) hoặc link.

**Giao bài**: chọn worksheet và một hoặc nhiều lớp, đặt các tham số ở mục `Assignment`.

**Chấm & kết quả (giáo viên)**
- Bảng: học sinh × trạng thái (chưa làm / đang làm / đã nộp / trễ) × điểm.
- Mở bài của từng học sinh: xem PDF kèm đáp án học sinh đã điền, chấm tay câu ESSAY và sửa điểm từng câu (override).
- Thống kê từng câu: tỉ lệ đúng và các đáp án sai phổ biến nhất.
- Xuất Excel bảng điểm.

**Học sinh**: dashboard gồm bài sắp đến hạn, bài đã nộp và điểm; trang lớp học.

**Admin**: quản lý user (đổi role, khoá tài khoản), liên kết phụ huynh và học sinh thủ công, thống kê tổng.

---

## 6A. Bảng xếp hạng lớp

Route: `/student/classes/[id]/leaderboard` (giáo viên xem tại `/teacher/classes/[id]/leaderboard`)

- **Chế độ "Theo bài"**: chọn một assignment, xếp hạng học sinh theo `totalScore` của **lượt làm có điểm cao nhất** (cấu hình được thành lượt cuối).
  - **Tie-break:** cùng điểm thì ai có thời gian làm bài (`submittedAt - startedAt`) ngắn hơn đứng trước; nếu vẫn bằng thì ai nộp sớm hơn đứng trước.
  - Dùng xếp hạng kiểu "1, 2, 2, 4" khi trùng hoàn toàn.
- **Chế độ "Toàn lớp (học kỳ)"**: dùng điểm trung bình quy đổi về thang 10 của mọi assignment đã hết hạn trong khoảng thời gian chọn. Bài không làm tính là 0 (cấu hình được thành "bỏ qua").
- **Giao diện:**
  - Bục vinh danh top 3 (vàng, bạc, đồng).
  - Bảng xếp hạng gồm các cột: hạng, học sinh, điểm, thời gian làm, số câu đúng, xu hướng ↑↓ so với bài trước.
  - Dòng của chính học sinh được tô sáng và **ghim ở cuối** với dòng chữ "Bạn đang ở hạng X/Y".
- **Quyền riêng tư:**
  - Chỉ hiện bảng xếp hạng theo `Assignment.showLeaderboard`, mặc định là sau khi hết hạn để tránh lộ đáp án qua điểm.
  - Nếu bật `leaderboardAnon`, học sinh chỉ thấy tên top 3 và chính mình, các dòng khác hiện "Học sinh #k".
  - Giáo viên luôn xem được đầy đủ.
- **Không tính vào xếp hạng** những bài bị giáo viên đánh dấu `flagged` (nghi gian lận) cho tới khi giáo viên xử lý.
- Tính bằng query SQL (window function `RANK()`), không tính trong JS. Cache 60s, và invalidate khi có bài được chấm lại.

## 6B. Cổng Phụ huynh (role PARENT)

Route gốc: `/parent`

- **Liên kết con:** có 2 cách.
  1. Học sinh hoặc giáo viên tạo **mã liên kết** (`ParentInviteCode`, hạn 7 ngày, dùng một lần), phụ huynh nhập mã sau khi đăng ký.
  2. Admin hoặc giáo viên chủ nhiệm liên kết thủ công.
- Một phụ huynh có nhiều con thì có **bộ chọn con** trên header.
- **Trang Tổng quan:**
  - 4 thẻ KPI:
    - Điểm TB của con so với TB lớp
    - Xếp hạng trong lớp (X/Y)
    - Tỉ lệ nộp bài đúng hạn
    - Số bài chưa làm
  - Biểu đồ đường "Tiến bộ theo thời gian": điểm của con và TB lớp qua 8–10 bài gần nhất.
  - Biểu đồ cột "Kỹ năng": Ngữ pháp, Từ vựng, Đọc hiểu, Nghe, Viết, so sánh con với TB lớp. Để có số liệu này, cần thêm field `skillTag` (enum) cho `Field`, giáo viên gắn tag khi tạo câu.
  - Bảng "Bài tập gần đây": tên bài, hạn nộp, trạng thái, điểm của con, TB lớp, hạng của con.
  - Thẻ "Nhận xét của giáo viên".
  - Cảnh báo gian lận của con, nếu giáo viên chọn chia sẻ.
- **Thông báo cho phụ huynh** (trong app, có thể thêm email hoặc Zalo ở giai đoạn 2): con có bài mới, con nộp trễ hoặc chưa làm khi còn 24h, con có điểm.
- **Phụ huynh chỉ được xem.** Không làm bài, không sửa gì. Chỉ thấy dữ liệu của con mình. Điểm của học sinh khác chỉ hiện dưới dạng **số liệu tổng hợp** (TB lớp, phân phối điểm), không có tên.
- Bổ sung `Field.skillTag: SkillTag?` (GRAMMAR | VOCABULARY | READING | LISTENING | WRITING | SPEAKING) vào data model.

## 6C. Chế độ thi chống gian lận (Proctoring)

> **Giới hạn kỹ thuật (phải ghi rõ trong UI cho giáo viên):** trình duyệt web **không thể khoá máy tuyệt đối** và không thể ngăn học sinh tra cứu bằng thiết bị khác như điện thoại. Hệ thống chỉ có thể **phát hiện, cảnh báo và báo ngay cho giáo viên**. Muốn khoá thật thì dùng mức `SEB` bên dưới.

Giáo viên chọn mức khi giao bài (`Assignment.proctorMode`):

| Mức | Hành vi |
|---|---|
| `OFF` | Không giám sát |
| `MONITOR` | Ghi nhận vi phạm và báo realtime cho giáo viên, không chặn |
| `LOCKDOWN` | Như MONITOR, cộng thêm: bắt buộc toàn màn hình, chặn copy/paste/chuột phải/chọn chữ, che bài thi khi rời tab, tự nộp hoặc khoá khi vượt `maxViolations` |
| `SEB` | Bắt buộc mở bằng **Safe Exam Browser** (miễn phí, Windows/macOS/iPad). Server kiểm tra header `X-SafeExamBrowser-ConfigKeyHash` và từ chối nếu không khớp. Đây là cách khoá máy thật: không mở được app hay tab khác. |

**Hành động khi vi phạm** (`Assignment.violationAction` + `maxViolations`). Giáo viên chọn khi giao bài, kèm preset nhanh:

| Preset trong UI | Cấu hình | Kết quả |
|---|---|---|
| Chỉ cảnh báo | `WARN` | Ghi nhận vi phạm và báo giáo viên |
| **Nhảy tab là khoá luôn** | `LOCK`, `maxViolations = 1` | Rời tab hoặc thoát toàn màn hình lần đầu là bài bị khoá ngay. Đáp án được giữ lại. Chỉ giáo viên bấm "Mở khoá" thì học sinh mới làm tiếp được. |
| **Thoát ra là làm lại từ đầu** | `RESTART`, `maxViolations = 1` | Vi phạm lần đầu thì server **xoá toàn bộ `Answer`** của lượt đó, reset vị trí về câu 1, ghi `ProctorEvent` kèm số câu đã bị xoá. **Đồng hồ KHÔNG reset**, vẫn tính từ `startedAt`, để tránh lách luật lấy thêm thời gian. Không tạo lượt mới nên không tốn `maxAttempts`. |
| Tự nộp bài | `AUTO_SUBMIT`, `maxViolations = n` | Đến lần thứ n thì tự nộp bài |
| Tuỳ chỉnh | chọn action + ngưỡng 1–5 | |

- Việc xử lý (khoá, xoá đáp án, nộp bài) **luôn chạy ở server** trong cùng transaction ghi `ProctorEvent`. Client chỉ hiển thị kết quả server trả về.
- Với RESTART: các request lưu đáp án gửi đến sau thời điểm reset (đang bay trên mạng) phải bị bỏ qua. Dùng `attemptVersion`: mỗi lần reset thì tăng lên 1, và autosave phải gửi kèm version hiện tại.
- Giáo viên nhận cảnh báo dạng "Nguyễn Văn Minh rời tab, bài đã bị khoá" hoặc "…, bài bị làm lại từ đầu (mất 18 câu)".

**Báo trước cho học sinh (bắt buộc, vì minh bạch thì mới công bằng):**
- **Trong danh sách bài tập và trang chi tiết bài:** badge "🔒 Bài thi giám sát", kèm một dòng mô tả luật lấy từ cấu hình, ví dụ "Rời tab 1 lần → khoá bài" hoặc "Thoát ra → làm lại từ đầu".
- **Màn hình nội quy trước khi bắt đầu** (`/student/assignments/[id]/rules`): liệt kê đúng các luật đang bật (toàn màn hình, chặn copy/paste, số lần vi phạm cho phép, hành động khi vi phạm, thời gian). Luật nghiêm (LOCK/RESTART) phải hiện **khung đỏ nổi bật**. Có checkbox "Tôi đã đọc và đồng ý", và chỉ khi tick thì nút "Bắt đầu làm bài" mới bật.
- **Trong lúc làm:** banner cố định trên đầu bài, ví dụ "Chế độ thi: rời tab = khoá bài". Ở bộ đếm vi phạm, hiện lần còn lại, ví dụ "còn 0 lần".
- Lưu thời điểm học sinh đồng ý nội quy (`Submission.rulesAcceptedAt`) để làm bằng chứng khi xử lý khiếu nại.

**Phía học sinh (`LOCKDOWN`):**
- Màn nội quy như trên. Bấm "Bắt đầu" sẽ gọi `requestFullscreen()`. Không vào toàn màn hình thì không hiện đề.
- Lắng nghe các sự kiện:
  - `visibilitychange`, `blur`, `fullscreenchange`
  - `copy`, `paste`, `cut`, `contextmenu`
  - `keydown`: PrintScreen, Ctrl/Cmd+C/V/P/F/U, F12
  - `resize` bất thường
  - `window.getScreenDetails()` (nếu được cấp quyền) để phát hiện nhiều màn hình
- Khi rời tab hoặc thoát toàn màn hình: **che toàn bộ đề** bằng overlay "Bạn đã rời khỏi bài thi (lần 2/3). Bấm để quay lại toàn màn hình". Đồng hồ vẫn chạy.
- Mỗi vi phạm gửi `POST /api/submissions/:id/proctor-events` ngay lập tức. Nếu mất mạng thì xếp hàng lại và gửi khi có mạng, kèm thời điểm phía client để tham khảo. **Server tự ghi `at` và tự tăng `violationCount`.**
- **Một phiên duy nhất:** mỗi lần bắt đầu cấp một `attemptToken`. Mở tab hoặc thiết bị thứ hai thì phiên cũ bị vô hiệu và tạo sự kiện `MULTI_SESSION`.
- Phát hiện devtools chỉ là heuristic, có thể báo sai, nên chỉ hiển thị "nghi vấn" và không tự khoá vì sự kiện này.

**Phía giáo viên — màn hình "Giám sát trực tiếp"** (`/teacher/assignments/[id]/live`):
- Lưới thẻ học sinh: trạng thái (chưa vào / đang làm / rời tab / đã nộp / bị khoá), tiến độ x/40 câu, số vi phạm, thời gian còn lại.
- **Realtime:** dùng SSE (`/api/assignments/:id/live`) hoặc WebSocket. Mỗi vi phạm hiện **toast + âm thanh** trên máy giáo viên trong vòng ≤ 2 giây, ví dụ "Nguyễn Văn Minh rời tab 14 giây".
- Bảng sự kiện theo thời gian (timeline) cho từng học sinh.
- Hành động: Nhắc nhở (gửi thông báo tới màn hình học sinh), **Mở khoá** cho làm tiếp, **Thu bài ngay**, Đánh dấu nghi vấn (`flagged`).
- Trong trang chấm bài, hiển thị timeline vi phạm cạnh bài làm.

**Tiêu chí:** test e2e (Playwright) cho cả 4 action:
- Mô phỏng `visibilitychange`, kiểm tra sự kiện được ghi ở server và giáo viên nhận được qua SSE.
- `LOCK` + ngưỡng 1: chuyển tab một lần thì bài bị khoá.
- `RESTART` + ngưỡng 1: đáp án bị xoá, đồng hồ không reset, autosave với version cũ bị từ chối.
- `AUTO_SUBMIT`: chạm ngưỡng thì bài được nộp.
- Màn nội quy hiển thị đúng các luật đã cấu hình.

---

## 7. Bảo mật & phân quyền (bắt buộc, sẽ review kỹ)

- Mọi Server Action và API đều kiểm tra session **và** quyền sở hữu: giáo viên chỉ được sửa lớp/worksheet của mình, học sinh chỉ thấy lớp mình đã vào và bài của chính mình. Viết helper dùng chung, ví dụ `requireTeacherOfClass(classId)` và `requireStudentInClass(classId)`.
- File PDF không public: tải qua route có kiểm tra quyền, hoặc dùng signed URL có hạn.
- Không lộ `answerKey` (xem mục 4).
- Không cho sửa answer sau khi đã `SUBMITTED`, hoặc sau khi hết giờ / quá hạn (trừ khi `allowLate`).
- Phụ huynh: helper `requireParentOf(studentId)` kiểm tra `ParentLink` đã được xác nhận. Phụ huynh không bao giờ nhận được tên hay điểm cá nhân của học sinh khác.
- Bảng xếp hạng: tôn trọng `showLeaderboard` và `leaderboardAnon` **ở server**, không chỉ ẩn ở UI.
- Proctor: chỉ giáo viên của lớp mới được subscribe kênh live. Không tin `violationCount` do client gửi lên.
- Rate limit cho login và register.
- Validate toàn bộ input bằng zod. Không nối chuỗi SQL thủ công.

---

## 8. Phases (thứ tự triển khai)

### Phase 1 — Nền tảng
- Khởi tạo project, Prisma, docker-compose, Auth (đăng ký/đăng nhập/đăng xuất, phân role), layout riêng cho teacher và student.
- Seed: 1 admin, 2 giáo viên, 10 học sinh, 2 lớp.
- **Tiêu chí hoàn thành:** đăng nhập bằng từng role và vào đúng dashboard của role đó. Truy cập route của role khác thì bị chặn.

### Phase 2 — Lớp học
- CRUD lớp, vào lớp bằng mã, danh sách học sinh, bảng tin và bình luận.
- **Tiêu chí hoàn thành:** học sinh vào lớp bằng mã và thấy bài đăng. Học sinh không vào được lớp khác.

### Phase 3 — Worksheet: phiếu trả lời (chế độ B)
- Upload PDF, viewer PDF, tạo câu nhanh, nhập đáp án bằng chuỗi, `lib/grading` kèm unit test.
- Giao bài, học sinh làm bài, autosave, nộp bài, chấm tự động, xem kết quả.
- **Tiêu chí hoàn thành:** toàn bộ luồng chạy end-to-end. Unit test cho grading pass. Test khẳng định không lộ answerKey pass.

### Phase 4 — Worksheet: overlay (chế độ A)
- Editor vẽ, kéo và resize ô. Toạ độ chuẩn hoá. Các type TEXT, DROPDOWN, CHECKBOX, MC, ESSAY. Panel thuộc tính.
- Học sinh điền trực tiếp lên trang. Kết hợp được với chế độ B.
- **Tiêu chí hoàn thành:** ô giữ đúng vị trí ở zoom 50%, 100%, 200% và trên viewport mobile 375px. Có e2e test tạo ô ở editor rồi điền ở phía học sinh.

### Phase 5 — Chấm & báo cáo
- Đồng hồ tính giờ phía server, nhiều lượt làm, chấm tay ESSAY, override điểm, thống kê từng câu, xuất Excel.

### Phase 6 — Bảng xếp hạng
- Leaderboard theo bài và theo học kỳ, xử lý tie-break, chế độ ẩn danh, cấu hình hiển thị theo assignment.
- **Tiêu chí hoàn thành:** unit test hàm xếp hạng với dữ liệu trùng điểm. Học sinh không xem được bảng xếp hạng trước thời điểm cấu hình.

### Phase 7 — Phụ huynh
- Role PARENT, mã liên kết, bộ chọn con, trang Tổng quan (KPI, 2 biểu đồ, bảng bài tập), thông báo, `skillTag`.
- **Tiêu chí hoàn thành:** phụ huynh A không xem được dữ liệu con của phụ huynh B (có test IDOR). Không lộ tên hay điểm của học sinh khác.

### Phase 8 — Chống gian lận
- Các mức MONITOR, LOCKDOWN, SEB. Lắng nghe sự kiện phía client, API ghi `ProctorEvent`, SSE live cho giáo viên, màn "Giám sát trực tiếp", khoá/mở khoá/thu bài.
- **Tiêu chí hoàn thành:** như cuối mục 6C.

### Phase 9 — Bài giảng, thông báo, admin, hoàn thiện UI
- Lesson (PDF/video/audio), thông báo trong app, trang admin, giao diện tiếng Việt, polish UI theo thiết kế Stitch.

### Giai đoạn 2 (chưa làm)
Field kéo thả (DRAG_DROP), nối cột (MATCH_LINE), ghi âm trả lời (AUDIO_RECORD), ngân hàng câu hỏi, chống gian lận (phát hiện rời tab), app mobile, thanh toán, tự nhận diện ô trống trong PDF.

---

## 9. Quy ước cho agent code

- TypeScript strict, không dùng `any` nếu không có lý do được ghi rõ trong comment.
- Logic nghiệp vụ đặt trong `src/server/*Service.ts`. Route và Server Action chỉ làm 3 việc: validate, kiểm tra quyền, gọi service.
- Giao diện tiếng Việt. Gom text vào một file `messages/vi.ts` để sau này i18n.
- Có `README.md` hướng dẫn chạy: `docker compose up -d`, `pnpm i`, `pnpm prisma migrate dev`, `pnpm db:seed`, `pnpm dev`.
- Có `.env.example` đủ biến.
- Khi xong mỗi Phase, cập nhật mục **"Tiến độ"** bên dưới: đã làm gì, còn thiếu gì, và quyết định nào khác so với plan (kèm lý do).
- Script bắt buộc phải chạy: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.

---

## 10. Checklist Claude sẽ dùng để review cuối

1. Không lộ `answerKey` ra client của học sinh (đọc code và kiểm tra network response).
2. Kiểm tra quyền ở **mọi** endpoint và action (IDOR: đổi id lớp/bài/submission của người khác).
3. Toạ độ overlay đúng ở mọi zoom và kích thước màn hình. Ô không lệch khi PDF có trang ngang và trang dọc lẫn lộn.
4. Không sửa được bài sau khi nộp hoặc hết giờ. Đồng hồ tính theo server.
5. Logic chấm: unit test đủ các type và edge case.
6. Autosave không mất dữ liệu khi reload hoặc mất mạng tạm thời.
7. Upload: kiểm tra loại và kích thước file. File không public.
8. Lint, typecheck và test đều pass. README chạy được từ máy trắng.
9. Phụ huynh chỉ thấy dữ liệu của con mình. Bảng xếp hạng ẩn danh và giới hạn thời điểm hiển thị được áp dụng ở server.
10. Proctor: sự kiện được ghi bằng giờ server, không giả mạo được số vi phạm, giáo viên nhận cảnh báo realtime, chế độ SEB kiểm tra đúng header.

---

## Tiến độ

Đã hoàn thành đầy đủ **9/9 Phase** và toàn bộ 10 mục trong Checklist review cuối.

### Phase 1 — Nền tảng
- **Đã làm:** Khởi tạo Next.js 15 (App Router, TypeScript strict), Tailwind CSS + shadcn/ui theo thiết kế Stitch (`design/stitch_engclass_learning_management_system/engclass_design_system/DESIGN.md`), Prisma ORM + PostgreSQL (`docker-compose.yml`), Auth.js v5 (Credentials + bcryptjs + rate limit đăng nhập/đăng ký + tuỳ chọn Google OAuth), phân quyền 4 role (`ADMIN`, `TEACHER`, `STUDENT`, `PARENT`) tại `src/middleware.ts` và `src/lib/permissions.ts`, gom toàn bộ copy tiếng Việt tại `messages/vi.ts`. Seed: 1 admin, 2 giáo viên, 10 học sinh, 2 phụ huynh, 2 lớp, PDF mẫu đa hướng (dọc + ngang), worksheets, bài tập, bài nộp, bài giảng và thông báo.
- **Quyết định kỹ thuật:** Tách `src/lib/auth.config.ts` (edge-safe) khỏi `src/lib/auth.ts` và tách `AppError` sang `src/lib/errors.ts` để tầng service không phụ thuộc `next/server`. Môi trường local chạy Postgres 16 qua `podman`, đồng thời cung cấp `docker-compose.yml` chuẩn (kèm profile `s3` cho MinIO).

### Phase 2 — Lớp học
- **Đã làm:** CRUD lớp học, lưu trữ/khôi phục lớp, tạo lại mã vào lớp 6 ký tự (loại bỏ `0/O/1/I`), học sinh vào lớp bằng mã kèm tuỳ chọn duyệt (`PENDING`/`ACTIVE`), duyệt/xoá học sinh, import học sinh hàng loạt từ Excel (`.xlsx`), bảng tin và bình luận, kiểm tra quyền sở hữu/thành viên chặt chẽ (`requireTeacherOfClass`, `requireStudentInClass`, `requireMemberOfClass`).

### Phase 3 — Worksheet: phiếu trả lời (chế độ B)
- **Đã làm:** `StorageProvider` (`LocalStorageProvider` & `S3StorageProvider` chọn qua `STORAGE_DRIVER`), route tải file bảo mật `/api/files/[...key]` kiểm tra quyền trước khi trả file, upload PDF kiểm tra magic bytes `%PDF` và giới hạn 20MB, dùng `pdfjs-dist` phía server đọc `pageCount` và kích thước point từng trang. Viewer PDF bằng `<canvas>` (lazy-load `IntersectionObserver`, không dùng `<iframe>`/`<embed>`). Tạo câu nhanh + nhập đáp án hàng loạt bằng chuỗi (`parseBulkAnswerString`), `src/lib/grading/` thuần hàm kèm 14 unit test. API học sinh dùng `STUDENT_FIELD_SELECT` tường minh loại bỏ `answerKey` và `gradingOpts`.

### Phase 4 — Worksheet: overlay (chế độ A & A+B)
- **Đã làm:** Trình biên tập `/teacher/worksheets/[id]/edit` vẽ hình chữ nhật bằng chuột, kéo/resize bằng `react-rnd`, lưu toạ độ chuẩn hoá `0..1`, đủ 8 loại field (`TEXT`, `NUMBER`, `MULTIPLE_CHOICE`, `MULTI_SELECT`, `TRUE_FALSE`, `DROPDOWN`, `CHECKBOX`, `ESSAY`), phím tắt `Delete`, `Ctrl+D`, mũi tên (`+Shift` 10px), bám lưới (snap-to-grid), đường gióng căn hàng, chọn nhiều ô để căn trái/trên/bằng rộng, đánh số tự động theo thứ tự đọc, autosave debounce 1s qua `PUT /api/worksheets/:id/fields`, chế độ **"Xem như học sinh"** chấm thử trực tiếp. Phía học sinh dùng input HTML thật định vị theo `%` chuẩn hoá, giữ chính xác ở zoom 50%/100%/200%, trang dọc/ngang lẫn lộn và viewport mobile 375px (bottom sheet).

### Phase 5 — Chấm & báo cáo
- **Đã làm:** Đồng hồ tính giờ theo máy chủ (`startedAt` + `timeLimitMin`), tự nộp khi hết giờ, chặn sửa bài sau khi nộp hoặc hết giờ, hỗ trợ nhiều lượt làm (`maxAttempts`), trộn câu phiếu trả lời (`shuffle`), trang báo cáo `/teacher/assignments/[id]/grading` với 4 thẻ KPI, biểu đồ tỉ lệ đúng từng câu kèm đáp án sai phổ biến, mở bài từng học sinh trên PDF để chấm tay ESSAY / override điểm / nhận xét giáo viên, xuất Excel bảng điểm (`exceljs`).

### Phase 6 — Bảng xếp hạng
- **Đã làm:** Trang `/student/classes/[id]/leaderboard` và `/teacher/classes/[id]/leaderboard` với 2 chế độ (Theo bài & Toàn lớp học kỳ), tính bằng SQL window function `RANK()` với tie-break (điểm cao hơn → thời gian làm ngắn hơn → nộp sớm hơn), loại bài bị gắn cờ `flagged`, cache 60s tự invalidate khi chấm/nộp lại, áp dụng `showLeaderboard` và `leaderboardAnon` ngay tại server, bục top 3 và thanh ghim vị trí của học sinh hiện tại.

### Phase 7 — Cổng Phụ huynh
- **Đã làm:** Role `PARENT`, mã liên kết 8 ký tự (`ParentInviteCode`, hạn 7 ngày, dùng một lần) do học sinh/giáo viên tạo, bộ chọn con trên header, trang `/parent` với 4 thẻ KPI so với TB lớp, biểu đồ đường tiến bộ theo thời gian, biểu đồ cột 5 kỹ năng dựa trên `Field.skillTag`, bảng bài tập gần đây, nhận xét giáo viên và cảnh báo giám sát (chỉ khi giáo viên chia sẻ). Kiểm tra quyền bằng `requireParentOf(studentId)` và không bao giờ lộ tên hay điểm cá nhân của học sinh khác.

### Phase 8 — Chống gian lận (Proctoring)
- **Đã làm:** Đủ 4 mức (`OFF`, `MONITOR`, `LOCKDOWN`, `SEB` kiểm tra header `X-SafeExamBrowser-ConfigKeyHash`), 4 hành động (`WARN`, `LOCK`, `RESTART`, `AUTO_SUBMIT`) kèm preset nhanh và lưu ý giới hạn kỹ thuật trên UI giao bài. Màn hình nội quy `/student/assignments/[id]/rules` hiển thị khung đỏ cho luật nghiêm, lưu `rulesAcceptedAt`. Ghi `ProctorEvent` theo giờ server và xử lý trong cùng transaction (`attemptVersion` chặn autosave cũ sau `RESTART`, giữ nguyên `startedAt`, `DEVTOOLS_SUSPECTED` chỉ cảnh báo không tự khoá). Giám sát trực tiếp `/teacher/assignments/[id]/live` qua SSE (`/api/assignments/:id/live`) với toast + âm thanh cảnh báo, timeline, thao tác Nhắc nhở / Mở khoá / Khoá / Thu bài / Đánh dấu nghi vấn.

### Phase 9 — Bài giảng, thông báo, admin & hoàn thiện UI
- **Đã làm:** Bài giảng chia chương (PDF xem bằng canvas viewer, video upload/YouTube, audio Listening, link), chuông thông báo realtime trong app, trang `/admin` quản lý user (đổi role, khoá/mở khoá) + liên kết phụ huynh thủ công + thống kê tổng, hoàn thiện giao diện tiếng Việt theo bộ thiết kế Stitch, bổ sung `README.md` và `.env.example`.

### Kết quả kiểm thử
- `pnpm lint`: Pass (0 errors, 0 warnings)
- `pnpm typecheck`: Pass (TypeScript strict, 0 errors)
- `pnpm test`: Pass (4 test files, 28/28 unit & integration tests)
- `pnpm test:e2e`: Pass (6/6 Playwright E2E flows: phân quyền 4 role, Class IDOR, Editor + Overlay zoom 50/100/200% & mobile 375px + không lộ `answerKey` + autosave/reload, Parent IDOR, Proctoring Rules + SSE + LOCK/RESTART/AUTO_SUBMIT/WARN)
- `pnpm build`: Pass (Production build thành công)
