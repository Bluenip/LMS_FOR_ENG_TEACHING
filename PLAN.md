# PLAN — Pivora (EngClass LMS)

> **Tài liệu thiết kế & lộ trình duy nhất của dự án.** Mọi tính năng ở mục 1 đã hoàn thành trên `main`, **không làm lại**. Bản plan cũ (Phase 1–12) còn trong lịch sử git.
>
> Mỗi Phase từ Phase 16 → Phase 26 được mô tả chi tiết theo đúng 6 phần **(A. Database & Migration → B. Pure Libs & JSON Schema → C. Services & Quyền/Bảo mật → D. API Routes → E. UI & Responsive/i18n → F. Env/Cron/Seed/Test)** để triển khai nhất quán, không nhầm lẫn.
>
> Làm **theo đúng thứ tự Phase**. Xong mỗi Phase phải: chạy đủ `pnpm db:seed`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build:check`, cập nhật mục **"Tiến độ"** ở cuối file, merge fast-forward vào `main`, push GitHub và xác minh server production deploy thành công rồi mới sang Phase tiếp theo.
>
> Không sao chép tên, logo, giao diện hay nội dung của TopWorksheets, Liveworksheets, SHub hay Dạy Mãi. Chỉ tham khảo **tính năng**.

---

## 1. Hiện trạng (đã có trên `main`, KHÔNG làm lại)

**Stack:** Next.js 15 (App Router, Turbopack dev) + TypeScript strict + Prisma 6/PostgreSQL 16 + Auth.js v5 (JWT credentials + Google OAuth config) + Tailwind/shadcn + Radix Dialog + TanStack Query + pdfjs-dist + pdf-lib + react-rnd + KaTeX + zod + exceljs + mammoth + jszip + qrcode + MediaPipe tasks-vision + Vitest/Playwright. Postgres local chạy bằng `podman` (container `engclass-postgres`).

- **Vai trò & tài khoản:**
  - 4 vai trò `ADMIN` / `TEACHER` / `STUDENT` / `PARENT`; phân quyền ở `src/middleware.ts` và `src/lib/permissions.ts` (`requireLayoutUser`, `requireAuth`, `requireRole`, `requireTeacherOfClass`, `requireTeacherOfAssignment`, `requireStudentForAssignment`, `requireSubmissionAccess`…).
  - **Không cho tự đăng ký:** admin tạo mọi tài khoản ở `/admin` (hoặc nhập hàng loạt từ Excel kèm xuất mật khẩu tạm 1 lần `OneTimeExport`); giáo viên tạo học sinh và phụ huynh trong lớp (`CreateAccountForm`).
  - Admin: reset mật khẩu (mật khẩu tạm, bắt đổi khi đăng nhập: `mustChangePassword`), khoá/mở, đổi vai trò (chặn hạ quyền giáo viên còn sở hữu lớp/worksheet), chuyển quyền sở hữu lớp/worksheet sang giáo viên khác (`TransferOwnershipDialog`), bật 2FA TOTP (`/account`), xem `AuditLog` (`/admin/audit`) và `ErrorLog` (`/admin/errors`).
  - **Thùng rác tài khoản & học liệu:** xoá = chuyển vào thùng rác (`deletedAt`), khôi phục trong 30 ngày, tự xoá vĩnh viễn qua job định kỳ (`purgeExpiredTrash`, `purgeExpiredContentTrash`), đồng bộ thùng rác Google Drive (`syncTrashWithDrive`), hỗ trợ xoá vĩnh viễn có xác nhận.
  - Trang `/account`: sửa hồ sơ (tên, email, SĐT, ngày sinh, giới tính, giới thiệu), ảnh đại diện, đổi mật khẩu (đăng xuất thiết bị khác qua `passwordChangedAt`), 2FA cho Admin.
  - Phiên cũ (user bị xoá / khoá / đổi vai trò / đổi mật khẩu) được xoá qua `/api/auth/clear-session?reason=...`.
- **Admin xem toàn hệ thống:** tất cả lớp (`/teacher`), tất cả bài đã giao (`/teacher/assignments`, lọc theo giáo viên), tất cả worksheet; sửa / sao chép / giao được mọi thứ.
- **Lớp học & Kho bài giảng dùng chung:**
  - Mã vào lớp, duyệt học sinh, import học sinh từ Excel, bảng tin + bình luận, cài đặt lớp, lưu trữ hoặc chuyển lớp vào thùng rác 30 ngày (gõ tên lớp để xác nhận).
  - **Kho bài giảng dùng chung (`ClassLesson`):** 1 bài giảng chia sẻ/gắn cho nhiều lớp cùng lúc, hỗ trợ PDF / video / audio / link, quản lý ở `/teacher/worksheets?tab=lessons`.
- **Worksheet đa môn học (Phase 15):**
  - **11 môn học** (`WorksheetSubject`, `src/lib/subjects.ts`), tự điều chỉnh công cụ biên tập theo profile môn (`LANGUAGE`, `STEM`, `LITERATURE`, `SOCIAL`, `INFORMATICS`, `GENERAL`).
  - 3 kiểu: ô trên PDF (`OVERLAY`), phiếu trả lời (`ANSWER_SHEET`), hoặc kết hợp.
  - **11 loại câu (`FieldType`):** `TEXT`, `NUMBER`, `MULTIPLE_CHOICE`, `MULTI_SELECT`, `TRUE_FALSE`, `TRUE_FALSE_GROUP` (Đúng/Sai 4 ý chuẩn THPT 2025), `DROPDOWN`, `CHECKBOX`, `ESSAY`, `DICTATION`, `PHOTO_UPLOAD` (chụp ảnh vở / tải PDF kèm nén client & `PhotoLightboxModal` zoom/xoay).
  - Công thức Toán/Lý/Hoá **KaTeX** (`MathText`, `$...$` / `$$...$$`), **ngữ liệu đọc hiểu dùng chung** (`Worksheet.passages`, `PassageCard`), editor kéo thả, autosave, "Xem như học sinh", file nghe giới hạn lượt nghe, tạo bài điền từ từ Word `.docx` (`fill-blank-parser.ts`), Backup/Export (`.engclass.zip`, `.docx`), chia sẻ và clone giữa giáo viên.
- **Giao bài & làm bài:** hạn nộp, giờ mở, giới hạn thời gian, số lượt (hoặc không giới hạn), trộn thứ tự câu, công bố điểm/đáp án (`ShowResultMode`), Focus Mode (1 câu / màn hình), sửa bài đã giao (`PATCH /api/assignments/[id]`), nút "Giao lại".
- **Chấm & báo cáo:** tự chấm (`src/lib/grading/`), chấm tay tự luận & ảnh nộp, tự chấm lại khi đổi đáp án (`regradeService.ts`), thống kê từng câu (kể cả đáp án sai phổ biến), xuất Excel (`reportService.ts`).
- **Bảng xếp hạng & Cổng phụ huynh:** xếp hạng theo bài và theo lớp (ẩn danh, cache 60s); phụ huynh liên kết nhiều con qua mã 8 ký tự, xem KPI, biểu đồ, kết quả theo lớp, nhận xét của giáo viên.
- **Chống gian lận 2 lớp:**
  - 4 mức `OFF` / `MONITOR` / `LOCKDOWN` / `SEB`; 4 hành động `WARN` / `LOCK` / `RESTART` / `AUTO_SUBMIT`; màn Live qua SSE (`proctor-bus.ts`).
  - **Camera AI** (MediaPipe FaceLandmarker + EfficientDet chạy 100% trên trình duyệt; `camera-rules.ts`, `camera-detector.ts`, `useCameraProctor.ts`): tự hiệu chỉnh tư thế 3s đầu, phát hiện quay/cúi đầu, không thấy mặt, nhiều mặt, điện thoại, tắt camera.
- **Google Drive & Lưu file:** Drive dùng chung (admin) + Drive riêng giáo viên, `StorageProvider` (`local` / `s3` / `drive`), `/api/files/[...key]` kiểm tra quyền chặt (`authorizeFileDownload`), auto-backup hằng ngày, dọn file mồ côi. Tài liệu: `docs/GOOGLE_DRIVE.md`.
- **Giao diện & PWA:** sáng/tối, song ngữ VI/EN (`messages/vi.ts`, `messages/en.ts`, `useI18n()`, `tr(...)`, `api-errors.ts`), responsive 375px, cài đặt PWA (`manifest.ts`, `icon.tsx`, `apple-icon.tsx`).
- **Deploy (production `https://lms.thaituan.site`):** Docker (`Dockerfile`, `compose.production.yml`) trên server riêng (`bluenip@100.71.200.54`), Cloudflare Tunnel, `scripts/auto-deploy.sh` tự pull `main` mỗi phút, backup DB, build, migrate, tự rollback nếu lỗi, `scripts/verify-backup.sh`.

---

## 2. Quy ước bắt buộc (áp dụng cho mọi Phase)

- TypeScript strict. Không dùng `any` trừ khi có comment giải thích lý do.
- Logic nghiệp vụ đặt trong `src/server/*Service.ts` và hàm thuần trong `src/lib/*`. Route và Server Action chỉ làm 3 việc: validate bằng `zod`, kiểm tra quyền, gọi service.
- Mọi chữ hiển thị đều có **cả tiếng Việt và tiếng Anh**: `m.*` từ `messages/vi.ts` + `messages/en.ts` hoặc `tr("…", "…")`. Thông báo lỗi API bằng tiếng Việt phải thêm bản dịch vào `src/lib/i18n/api-errors.ts`.
- Màu sắc: dùng class màu hệ thống. Thêm màu mới phải bổ sung bản tối trong `src/app/globals.css` (mục Dark mode).
- **Điện thoại:** mọi trang mới phải dùng được ở bề ngang 375px, không cuộn ngang; nút bấm ≥ 40px.
- **Hộp thoại xác nhận:** dùng `Dialog` (`src/components/ui/dialog.tsx`), **không dùng `window.confirm` / `alert`**. Hành động nguy hiểm (xoá vĩnh viễn, đóng lớp…) bắt gõ lại tên/email xác nhận.
- **Migration Prisma:** đặt tên rõ ràng; field mới phải có default hợp lệ hoặc nullable. Migration phải **tương thích ngược** (deploy rollback app chứ không rollback DB): không xoá/đổi tên cột đang dùng trong cùng một lần deploy. Cập nhật `prisma/seed.ts`.
- **Không chạy `pnpm build` khi `pnpm dev` đang chạy** (chung `.next`). Kiểm tra build dùng `pnpm build:check`.
- Mỗi Phase chạy đủ: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build:check`. **Commit git sau mỗi Phase.**
- **Không commit** `.env*` (trừ `.env.example`), secret, hay thư mục `file word test/`. Biến môi trường mới thêm vào `.env.example` kèm comment rõ ràng.

### Checklist bảo mật (kiểm tra trước khi merge mỗi Phase)
1. Không lộ đáp án (`answerKey`, `gradingOpts`, `explanation`, `rubric`/`score` khi chưa cho phép) cho học sinh khi chưa được phép xem. Kiểm tra cả network response.
2. Kiểm tra quyền ở **mọi** endpoint (chống IDOR: thử đổi id lớp / bài / bài nộp / file / tài khoản / hội thoại sang của người khác). Admin xem được mọi thứ; giáo viên chỉ lớp/tài nguyên của mình (hoặc được chia sẻ theo đúng quyền).
3. Không sửa được bài sau khi nộp hoặc hết giờ. Đồng hồ tính theo giờ server (có xét ngoại lệ cá nhân nếu có).
4. Upload kiểm tra loại file (magic bytes) và dung lượng. File không bao giờ public mặc định.
5. Phụ huynh chỉ thấy dữ liệu của con mình. Cài đặt ẩn danh / thời điểm hiện bảng xếp hạng / công bố điểm áp dụng ở server.
6. Token OAuth, secret, mã 2FA, push subscription key lưu an toàn (mã hoá hoặc hash khi cần); không ghi ra log, không trả về client.
7. Tài khoản trong thùng rác (`deletedAt != null`) không đăng nhập được và không xuất hiện trong danh sách chọn (lớp, giao bài, liên kết phụ huynh…).

---

## 3. Quy trình thực hiện, Merge & Xác minh Deploy (mỗi Phase)

1. Làm trên nhánh riêng `phase-XX` (tạo từ `main` mới nhất). Commit từng phần rõ ràng.
2. Cập nhật `prisma/seed.ts` cho dữ liệu mẫu của tính năng mới.
3. Chạy đủ và pass 100%: `pnpm db:seed`, `pnpm lint` (0 lỗi, 0 cảnh báo), `pnpm typecheck` (0 lỗi), `pnpm test`, `pnpm test:e2e`, `pnpm build:check`.
4. Kiểm tra checklist bảo mật, dark mode, VI/EN và khung điện thoại 375px.
5. Ghi kết quả vào mục **"Tiến độ"** ở cuối `PLAN.md`, dọn file tạm (`.next-build`, `test-results`, `playwright-report`, `tsconfig.tsbuildinfo`, dừng `pnpm dev` nếu đang chạy).
6. Merge fast-forward vào `main`, xoá nhánh `phase-XX`, kiểm tra `git status` sạch (trừ `file word test/`), và `git push origin main`.
7. **Theo dõi & xác minh server production (`bluenip@100.71.200.54`):**
   - Kiểm tra `~/apps/engclass/.deploy/cron.log` cho tới khi thấy `Deployed <short-sha>; app is healthy`.
   - Kiểm tra `docker compose -f compose.production.yml --env-file .env.production exec -T app node_modules/.bin/prisma migrate status` báo migration đã chạy đủ. (**Không seed dữ liệu mẫu trên production.**)
   - Kiểm tra `https://lms.thaituan.site/login` trả `HTTP 200`.
8. **Chuyển thư mục làm việc sang repo mới `PIVORA` (chỉ thực hiện SAU KHI đã push xong xuôi toàn bộ các Phase):**
   - Clone mới về `/run/media/bluenip/BACKUP/Code/PIVORA` (`https://github.com/Bluenip/PIVORA.git`), chép các file local không commit (`.env`, `file word test/`, `uploads/`), chạy `pnpm i` kiểm tra sạch sẽ rồi mới xoá thư mục cũ `/run/media/bluenip/BACKUP/Code/LMS_teaching_eng`. (Không xoá thư mục cũ giữa chừng vì shell đang chạy trong thư mục đó.)

---

## Phase 16 — Giao bài linh hoạt, Chấm nâng cao & Trải nghiệm làm bài

### A. Database & Migration (`phase16_flexible_assignments_grading` — tương thích ngược 100%)
- **Enum mới:** `ScoreScale { SCALE_10, SCALE_100, IELTS, RAW }`.
- **Enum bổ sung:** `NotificationType` thêm `DUE_REMINDER`.
- **`Assignment` thêm cột:**
  - `remindBeforeDue Boolean @default(true)`
  - `scoreScale ScoreScale @default(SCALE_10)`
  - `weight Float @default(1)`
- **`Field` thêm cột:** `rubric Json?` (mảng `{ id: string, title: string, description?: string, maxPoints: number }`).
- **`Answer` thêm cột:** `rubricScores Json?` (`Record<criterionId, number>`).
- **Bảng mới:**
  - `AssignmentOverride { id, assignmentId, studentId, extraAttempts Int @default(0), dueAt DateTime?, timeLimitMin Int?, note String?, createdAt, updatedAt }` — `@@unique([assignmentId, studentId])`, `@@index([studentId])`.
  - `AssignmentTarget { id, assignmentId, studentId, createdAt }` — `@@unique([assignmentId, studentId])`, `@@index([studentId])` (0 bản ghi = giao cả lớp).
  - `AssignmentReminderSent { id, assignmentId, studentId, sentAt DateTime @default(now()) }` — `@@unique([assignmentId, studentId])`, `@@index([assignmentId])`.
  - `TeacherCommentPreset { id, teacherId, category String?, content String, order Int @default(0), createdAt, updatedAt }` — `@@index([teacherId, order])`.
- Quan hệ ngược tương ứng trên `User` đều `onDelete: Cascade`.

### B. Pure Libs & Thuật toán (`src/lib/*`)
1. **`src/lib/assignment-effective.ts`:**
   - `resolveEffectiveAssignment(assignment, override)`:
     - `maxAttempts`: nếu `assignment.maxAttempts === null` giữ `null`; ngược lại `assignment.maxAttempts + Math.max(0, override?.extraAttempts ?? 0)`.
     - `dueAt`: `override?.dueAt ?? assignment.dueAt`.
     - `timeLimitMin`: `override?.timeLimitMin ?? assignment.timeLimitMin`.
     - `hasOverride`: `Boolean(override && (override.extraAttempts > 0 || override.dueAt !== null || override.timeLimitMin !== null))`.
2. **`src/lib/score-scale.ts`:**
   - `convertScoreToScale(score, maxScore, scale)`: tính `ratio = maxScore > 0 ? Math.max(0, score) / maxScore : 0`.
   - `SCALE_10`: `Math.round(ratio * 1000) / 100` (max `10`).
   - `SCALE_100`: `Math.round(ratio * 1000) / 10` (max `100`).
   - `IELTS`: bảng ánh xạ phần trăm sang band `0.0..9.0` bước `0.5` (`>=0.95→9`, `>=0.88→8.5`, `>=0.80→8`, `>=0.73→7.5`, `>=0.65→7`, `>=0.58→6.5`, `>=0.50→6`, `>=0.43→5.5`, `>=0.35→5`, `>=0.28→4.5`, `>=0.20→4`, `>=0.13→3.5`, `>=0.08→3`, `>0→2.5`, `0→0`).
   - `RAW`: giữ `round2(score)` / `round2(maxScore)`.
3. **`src/lib/grading/types.ts` & `src/lib/grading/index.ts`:**
   - Type `RubricCriterion` và `RubricScoreMap`.
   - `computeRubricTotal(rubric, scores, fieldMaxPoints)`: với mỗi tiêu chí `c`, lấy `raw = Number(scores[c.id] ?? 0)`, kẹp vào `[0, c.maxPoints]`, cộng tổng rồi kẹp vào `[0, fieldMaxPoints]`, làm tròn 2 chữ số thập phân; trả `{ total, clampedScores }`.
4. **`src/lib/offline-answer-queue.ts` (client-only):**
   - Lưu/đọc/xoá hàng đợi đáp án nháp theo `submissionId` vào `localStorage` (`pivora:draft:${submissionId}` gồm `{ attemptVersion, updatedAt, answers: Record<string, AnswerValue> }`).
   - Lưu/đọc danh sách ID câu đánh dấu xem lại (`pivora:flags:${submissionId}`).

### C. Services & Kiểm soát quyền
- **`src/lib/permissions.ts` (`requireStudentForAssignment`):** sau khi kiểm tra `Enrollment.status === "ACTIVE"`, đếm `AssignmentTarget` theo `assignmentId`; nếu `targetCount > 0` và không tồn tại `(assignmentId, user.id)` → ném `403 FORBIDDEN`.
- **`src/server/assignmentService.ts`:**
  - `createAssignmentsForClasses`: khi nhận `targetStudentIds` (chỉ hợp lệ khi giao 1 lớp; lọc `Enrollment ACTIVE` & `User.deletedAt: null`), ghi `AssignmentTarget` và chỉ gửi thông báo cho HS mục tiêu (+ phụ huynh của họ).
  - `getAssignmentSettings`: trả thêm `targets: string[]` và danh sách HS đang hoạt động trong lớp để form sửa bài cho đổi lại nhóm HS.
  - `updateAssignment`: cập nhật `remindBeforeDue`, `scoreScale`, `weight`, và đồng bộ `AssignmentTarget` trong transaction; khi thông báo gia hạn/tăng lượt chỉ gửi cho tập HS mục tiêu.
  - `listStudentAssignments`: lọc `OR: [{ targets: { none: {} } }, { targets: { some: { studentId } } }]`, include `overrides: { where: { studentId } }`, áp `resolveEffectiveAssignment` lên `dueAt`, `timeLimitMin`, `maxAttempts` trả về.
- **`src/server/classService.ts` (`getClassDetail`):** thêm tuỳ chọn `opts?: { studentId?: string }`; khi là học sinh thì lọc bài theo `AssignmentTarget` và áp `AssignmentOverride`.
- **`src/server/submissionService.ts`:**
  - Tải `override` của `(assignmentId, studentId)` và áp `resolveEffectiveAssignment` tại **tất cả 5 điểm**: `startOrResumeSubmission`, `getStudentAssignmentPayload`, `autosaveSubmissionAnswers`, `finalizeSubmissionInternal`, `submitByStudent`.
  - `getStudentAssignmentPayload`: chỉ gửi `rubric` của field và `rubricScores` của answer khi `revealResult === true`; tuyệt đối giữ kín `answerKey`, `gradingOpts`, `explanation`. Trả thêm `hasOverride`, `scoreScale`, `weight`.
  - `saveTeacherManualGrading`: hỗ trợ `rubricScores`; khi câu có `rubric` và nhận `rubricScores` thì tính điểm qua `computeRubricTotal` (bỏ qua giá trị điểm tay gửi lệch) và lưu `Answer.rubricScores`.
  - Thêm `saveSingleFieldGrade(submissionId, input)` (dùng cho tab Chấm theo câu): upsert 1 `Answer`, tính lại `autoScore`/`manualScore`/`totalScore`; nếu mọi câu chấm tay của bài đều đã có `score !== null` thì tự chuyển `status = "GRADED"`, invalidate leaderboard cache và gửi thông báo khi vừa chuyển sang `GRADED`.
- **`src/server/assignmentOverrideService.ts` (mới):** `listAssignmentOverrides`, `upsertAssignmentOverride` (validate HS active không ở thùng rác, gửi thông báo `ASSIGNMENT_CREATED`, ghi `AuditLog`), `deleteAssignmentOverride` (ghi `AuditLog`).
- **`src/server/commentPresetService.ts` (mới):** `listCommentPresets`, `createCommentPreset`, `deleteCommentPreset` (chỉ chủ sở hữu hoặc Admin).
- **`src/server/reminderService.ts` (mới):** `sendDueSoonReminders(now = new Date())` — quét bài có `remindBeforeDue = true`, lớp chưa xoá/lưu trữ, `dueAt` không null hoặc có override `dueAt`; với mỗi HS mục tiêu chưa có bài nộp `SUBMITTED`/`GRADED` và chưa có trong `AssignmentReminderSent`, tính `effectiveDueAt`; nếu `0 < effectiveDueAt - now <= 24h` thì `createMany({ skipDuplicates: true })` vào `AssignmentReminderSent` rồi gửi `NotificationType.DUE_REMINDER`.
- **`src/server/reportService.ts`, `parentService.ts`, `proctorService.ts`, `worksheetService.ts`, `worksheetTransferService.ts`:** lọc HS mục tiêu khi có `AssignmentTarget`; tính `override` cho deadline/live remainingSeconds; tính điểm quy đổi theo `scoreScale` + `weight` (thêm cột vào Excel); thêm `getAssignmentQuestionGradingData(assignmentId, fieldId)`; giữ `Field.rubric` khi lưu/clone/export/import.

### D. API Routes & Validators
- `src/lib/validators/index.ts`: `rubricCriterionSchema`, `createAssignmentSchema`/`updateAssignmentSchema` (thêm `remindBeforeDue`, `scoreScale`, `weight`, `targetStudentIds`), `upsertAssignmentOverrideSchema`, `createCommentPresetSchema`, `singleFieldGradeSchema`, thêm `rubricScores` vào `manualGradeSchema`.
- Routes mới / cập nhật:
  - `GET / PUT / DELETE /api/assignments/[id]/overrides` (`requireTeacherOfAssignment`)
  - `GET /api/assignments/[id]/grading/by-question?fieldId=...` (`requireTeacherOfAssignment`)
  - `PATCH /api/submissions/[id]/grade` (`requireSubmissionAccess` + `isTeacher`)
  - `GET / POST /api/teacher/comment-presets` (`requireRole(["TEACHER", "ADMIN"])`)
  - `DELETE /api/teacher/comment-presets/[id]` (kiểm tra quyền sở hữu chống IDOR)
- Thêm toàn bộ thông báo lỗi API mới vào `src/lib/i18n/api-errors.ts`.

### E. Giao diện UI (VI/EN, Dark mode, Mobile 375px)
- `src/app/(teacher)/teacher/assignments/new/page.tsx`: chọn "Cả lớp / Nhóm học sinh cụ thể" (tìm + checkbox HS; tự động tải HS lớp khi chọn 1 lớp hoặc khi sửa bài), switch "Nhắc hạn trước 24h", chọn `scoreScale` và `weight`.
- `src/components/worksheet/RubricEditor.tsx` + `WorksheetEditor.tsx`: trình soạn tiêu chí Rubric cho câu `ESSAY` và `PHOTO_UPLOAD`, nút đồng bộ tổng điểm câu.
- `src/app/(teacher)/teacher/assignments/[id]/grading/page.tsx`:
  - Nút & badge **Ngoại lệ** trên từng dòng HS mở Radix `Dialog` cấu hình `+ lượt`, `gia hạn riêng`, `thời gian riêng`, ghi chú, nút xoá ngoại lệ.
  - Modal chấm chi tiết: nhập điểm từng tiêu chí Rubric + thanh **Ngân hàng câu nhận xét hay dùng** (bấm chèn vào nhận xét tổng/câu, thêm/xoá mẫu).
  - Tab **"Chấm theo câu"**: chọn câu, công tắc **Chấm ẩn danh** (ẩn tên/email thành `Học sinh #1`…), hiển thị từng bài làm + Rubric + preset + lưu từng câu.
- `src/app/(student)/student/assignments/[id]/do/page.tsx` + `AnswerSheetPanel.tsx` + `FocusQuestionRunner.tsx`:
  - Nút **Đánh dấu xem lại (Flag)** trên từng câu + **Lưới điều hướng câu hỏi** phân màu (Đã làm / Chưa làm / Đánh dấu) đáp ứng 375px.
  - **Lưu nháp offline:** tự động đẩy vào `offline-answer-queue` khi rớt mạng/lỗi autosave, hiện badge trạng thái cục bộ, tự đồng bộ lại khi sự kiện `online` kích hoạt hoặc khi mở lại trang.
  - Hiện bảng **Rubric đã chấm** & điểm quy đổi `scoreScale` khi `revealResult === true`.
- `src/app/(teacher)/teacher/settings/page.tsx`: thay `confirm(...)` bằng Radix `Dialog`.

### F. Cron, Seed & Kiểm thử
- `src/instrumentation.ts`: chạy `sendDueSoonReminders()` sau 5 phút khởi động và lặp mỗi 60 phút.
- `prisma/seed.ts`: thêm mẫu `TeacherCommentPreset`, thêm `rubric` 3 tiêu chí cho câu `ESSAY` trong đề Unit 7, thêm 1 `AssignmentOverride` mẫu.
- Tests: unit (`tests/unit/phase16-overrides-rubric-scale.test.ts`), integration (`tests/integration/phase16-flexible-assignments.test.ts` — ngoại lệ, nhóm HS, reminder với `now` giả lập, rubric, chấm theo câu, presets, IDOR, không lộ key), E2E (`tests/e2e/phase16-flexible-assignments.spec.ts` — luồng GV↔HS đầy đủ + 375px).

---

## Phase 17 — Nâng cấp Worksheet Studio, Import Word Đa Dạng & Chú thích Ảnh Chấm Bài

### A. Database & Migration (`phase17_studio_annotations_image_ws` — tương thích ngược 100%)
- `Field`: thêm `imageKey String?` (ảnh minh hoạ gắn vào câu hỏi phiếu trả lời).
- `WorksheetPage`: thêm `imageKey String?` (nếu worksheet tạo từ ảnh thay cho PDF).
- `Assignment`: thêm `shuffleOptions Boolean @default(false)`.
- `Submission`: thêm `optionOrder Json?` (`Record<fieldId, string[]>` lưu thứ tự `option.id` đã trộn cho từng lượt).
- `Answer`: thêm `annotations Json?` (`Record<fileKey, PhotoAnnotationItem[]>` lưu vector chú thích của giáo viên).

### B. Pure Libs & JSON Schema
1. **Undo/Redo (`src/lib/worksheet/editor-history.ts`):**
   - Kiểu `EditorHistoryState<T> { past: T[]; present: T; future: T[] }` với `MAX_HISTORY = 50`.
   - `pushHistory(state, next, { replaceWithinMs })`: giữ bản ghi tối đa 50 bước, gộp các lần gõ text liên tiếp trong 400ms thành 1 bước để Ctrl+Z tự nhiên.
   - `undoHistory` / `redoHistory`: thuần, có unit test.
2. **Import Word đa dạng (`src/lib/worksheet/word-exam-parser.ts`):**
   - Chuyển `.docx` bằng `mammoth.convertToHtml({ buffer })` để giữ lại thẻ `<strong>`, `<b>`, `<u>` và kiểu nhấn mạnh đánh dấu đáp án đúng; tách text theo đoạn `<p>`/`<li>`.
   - Nhận diện 4 dạng cấu trúc phổ biến:
     1. **Trắc nghiệm 4 phương án:** dòng bắt đầu `Câu N:`/`N.` và các phương án `A. B. C. D.`; phát hiện đáp án đúng qua in đậm/gạch chân/dấu `*A.` hoặc bảng đáp án cuối file (`1.A 2.C` / bảng 2 cột).
     2. **Đúng/Sai 4 ý THPT 2025:** `Câu N:` kèm các ý `a) ... b) ... c) ... d) ...` và đánh dấu `(Đ)`/`(S)` hoặc bảng đáp án `a-Đ, b-S`.
     3. **Điền từ `__đáp án__`:** tái sử dụng `parseFillBlankText`.
     4. **Tự luận (`ESSAY`):** câu có nhãn `[Tự luận]` hoặc không có phương án/blank.
   - Hỗ trợ nhận biểu thức toán được mammoth trích thành text/MathML cơ bản và chuẩn hoá `$...$`.
3. **Thanh chèn công thức (`src/lib/worksheet/formula-snippets.ts`):**
   - Danh mục phân nhóm: Cơ bản (`\frac{a}{b}`, `\sqrt{x}`, `x^{n}`, `x_{i}`), Giải tích (`\int_{a}^{b}`, `\lim_{x \to 0}`, `\sum_{i=1}^{n}`), Hình học (`\overrightarrow{AB}`, `\widehat{ABC}`, `\triangle`, `\perp`, `\parallel`), Hoá học (`\rightarrow`, `\rightleftharpoons`, `\xrightarrow{t^o}`, `H_2SO_4`).
4. **Cấu trúc vector chú thích ảnh (`PhotoAnnotationItem` trong `src/lib/grading/types.ts`):**
   - `{ id: string, type: "pen"|"rect"|"circle"|"check"|"cross"|"text", color: string, strokeWidth: number, points?: Array<[number, number]>, x?: number, y?: number, w?: number, h?: number, text?: string }` — mọi toạ độ chuẩn hoá `0..1` theo ảnh gốc (không phụ thuộc độ phóng/thu màn hình, không làm biến đổi ảnh gốc).
5. **Tự động gợi ý ô trống PDF (`src/lib/worksheet/pdf-blank-detector.ts`):**
   - Nhận `textItems` từ `pdfjs page.getTextContent()` cùng `viewport` trang; chuyển `transform` từ hệ gốc dưới-trái PDF sang chuẩn hoá `0..1` gốc trên-trái.
   - Tìm chuỗi `_{3,}`, `\.{5,}`, `…{2,}` → đề xuất `TEXT`; tìm `\[\s{0,6}\]`, `☐`, `□`, `\(\s{1,6}\)` → đề xuất `CHECKBOX`.
   - Loại bỏ đề xuất giao nhau (IoU > 0.3) với các ô `OVERLAY` đang có.
6. **Xuất đề PDF in ấn (`src/lib/pdf/export-printable-pdf.ts`):**
   - Dùng `pdf-lib` + `@pdf-lib/fontkit` nhúng font Unicode (`public/fonts/NotoSans-Regular.ttf` & `NotoSans-Bold.ttf`) để vẽ chuẩn tiếng Việt có dấu.
   - Nếu worksheet có PDF nền: copy trang PDF gốc + (nếu `mode === "key"`) thêm phụ lục trang Đáp án & Giải thích cuối file. Nếu chỉ có phiếu trả lời hoặc ảnh nền: render đề câu hỏi, lựa chọn A/B/C/D, ý a/b/c/d, ảnh minh hoạ (`imageKey`) và bảng đáp án.

### C. Services & Kiểm soát quyền
- `worksheetService.ts`:
  - `uploadFieldIllustrationImage(worksheetId, fieldId, buffer, mimeType)`: kiểm tra magic bytes JPG/PNG/WebP ≤ 5MB, lưu key `worksheets/${worksheetId}/images/${uuid}.${ext}`, trả `{ imageKey }`.
  - `uploadWorksheetBackgroundImages(worksheetId, files[])`: kiểm tra tối đa 30 ảnh, magic bytes JPG/PNG/WebP ≤ 10MB/ảnh; tạo `WorksheetPage` cho từng ảnh với `widthPt`/`heightPt` chuẩn hoá tỉ lệ theo chiều rộng 595pt để dùng chung hệ toạ độ `0..1` với PDF; cấm thay đổi nếu đã có bài nộp (giống rule thay PDF).
  - Cập nhật `authorizeFileDownload(userId, role, fileKey)` cho phép truy cập hợp lệ tới `worksheets/${id}/images/*`.
- `worksheetTransferService.ts`: đóng gói & giải nén thêm `field.imageKey` và `page.imageKey` vào `.engclass.zip` và khi clone worksheet.
- `submissionService.ts`:
  - `startOrResumeSubmission`: khi `assignment.shuffleOptions === true`, với mọi field `MULTIPLE_CHOICE` / `MULTI_SELECT` có `options.length > 1`, xáo trộn danh sách `option.id` lưu vào `Submission.optionOrder`.
  - `getStudentAssignmentPayload`: sắp xếp lại `field.options` theo `Submission.optionOrder[field.id]` trước khi trả về client. (Chấm điểm vẫn đối chiếu theo `option.id` nên đáp án luôn chính xác.)
  - `savePhotoAnnotations(submissionId, fieldId, annotations)`: kiểm tra giáo viên của lớp, xác thực `fileKey` thuộc `Answer.value.files`, lưu vào `Answer.annotations`; trong `getStudentAssignmentPayload` **chỉ trả `annotations` khi `revealResult === true`**.

### D. API Routes & Validators
- `POST /api/worksheets/[id]/field-image` & `DELETE /api/worksheets/[id]/field-image` (`requireTeacherOfWorksheet`)
- `POST /api/worksheets/[id]/images` (upload ảnh nền tạo worksheet `Fill on image`, `requireTeacherOfWorksheet`)
- `POST /api/worksheets/parse-word-exam` (preview import Word đa dạng câu hỏi, `requireRole(["TEACHER", "ADMIN"])`)
- `GET /api/worksheets/[id]/export?format=pdf&mode=student|key` (xuất PDF in ấn, `requireTeacherOfWorksheet` hoặc shared/Admin)
- `PUT /api/submissions/[id]/annotations` (lưu nét chấm bút đỏ, `requireSubmissionAccess` + `isTeacher`)
- Cập nhật `createAssignmentSchema`/`updateAssignmentSchema` thêm `shuffleOptions`, `fieldItemSchema` thêm `imageKey`.

### E. Giao diện UI
- `WorksheetEditor.tsx`: nút Undo/Redo + phím tắt `Ctrl+Z` / `Ctrl+Shift+Z`; nút tải ảnh nền thay cho PDF (`Fill on image`); nút **"Quét ô trống từ PDF"** mở Dialog chọn các ô gợi ý; upload/xoá ảnh minh hoạ cho từng câu phiếu trả lời; `FormulaToolbar.tsx` chèn nhanh ký hiệu Toán/Hoá có preview KaTeX.
- `src/app/(teacher)/teacher/worksheets/page.tsx`: nâng cấp hộp thoại "Nhập từ Word" hỗ trợ chọn chế độ *Điền từ* hoặc *Đề thi (Trắc nghiệm / Đúng-Sai / Tự luận)*, xem trước và chỉnh sửa trước khi tạo worksheet; nút "Tải PDF in ấn" ở danh sách & editor.
- `src/components/worksheet/PhotoAnnotatorModal.tsx`: nâng cấp `PhotoLightboxModal` với chế độ vẽ chấm bài (bút đỏ/xanh, khung, vòng tròn, ✓/✗, chữ chú thích, undo, lưu) cho giáo viên ở `grading/page.tsx`; học sinh xem lớp chú thích ở chế độ chỉ đọc khi xem lại bài đã chấm.

### F. Seed & Kiểm thử
- `prisma/seed.ts`: thêm 1 worksheet mẫu môn Toán tạo từ ảnh nền (`Fill on image`) có công thức LaTeX và ảnh minh hoạ câu hỏi.
- Tests: unit (`editor-history`, `word-exam-parser`, `pdf-blank-detector`, `shuffleOptions` grading), integration (IDOR upload ảnh, annotations leak check trước `revealResult`, clone giữ ảnh, xuất PDF valid magic `%PDF`), E2E (Undo/Redo, Import Word MCQ, Fill on image + quét ô trống, vẽ bút đỏ lên ảnh chấm & HS xem lại).

---

## Phase 18 — Camera AI nâng cao & Chống gian lận Mobile

### A. Database & Migration (`phase18_camera_ai_advanced` — tương thích ngược 100%)
- **Enum mới:** `CameraSensitivity { LOW, MEDIUM, HIGH }`.
- **Enum bổ sung:** `ProctorEventType` thêm `CAMERA_GAZE_AWAY`, `MIC_VOICE`, `MOBILE_APP_SWITCH`.
- **`Assignment` thêm cột:**
  - `cameraSensitivity CameraSensitivity @default(MEDIUM)`
  - `cameraCountLookAway Boolean @default(false)`
  - `requireMicMonitor Boolean @default(false)`

### B. Pure Libs & Thuật toán (`src/lib/proctor/*`)
1. **`src/lib/proctor/camera-rules.ts`:**
   - Thêm `CAMERA_SENSITIVITY_PRESETS: Record<CameraSensitivity, Partial<CameraRuleConfig>>`:
     - `LOW`: `noFaceDurationMs: 5000`, `multiFaceDurationMs: 2500`, `lookAwayDurationMs: 4000`, `maxYawDeg: 35`, `maxPitchDeg: 28`, `phoneScoreThreshold: 0.50`, `gazeDeviationThreshold: 0.28`, `gazeDurationMs: 4000`.
     - `MEDIUM`: `noFaceDurationMs: 3000`, `multiFaceDurationMs: 1500`, `lookAwayDurationMs: 2500`, `maxYawDeg: 25`, `maxPitchDeg: 20`, `phoneScoreThreshold: 0.35`, `gazeDeviationThreshold: 0.22`, `gazeDurationMs: 3000`.
     - `HIGH`: `noFaceDurationMs: 2000`, `multiFaceDurationMs: 1000`, `lookAwayDurationMs: 1800`, `maxYawDeg: 18`, `maxPitchDeg: 15`, `phoneScoreThreshold: 0.30`, `gazeDeviationThreshold: 0.16`, `gazeDurationMs: 2000`.
   - Hàm thuần `estimateIrisGazeFromLandmarks(lm)`: dùng iris landmarks MediaPipe `468` (tâm mắt trái) so với khoé mắt `33`/`133` và `473` (tâm mắt phải) so với `362`/`263`; trả `{ gazeXOffset: number }` (`-0.5..+0.5`, 0 = nhìn thẳng) để `CameraRulesEngine` phát `CAMERA_GAZE_AWAY` khi lệch quá ngưỡng trong `gazeDurationMs` (không chồng trùng khi đầu đã quay quá ngưỡng `CAMERA_LOOK_AWAY`).
   - Hỗ trợ `window.__engclassCameraMock` nhận thêm `gazeXOffset?: number` cho E2E.
2. **`src/lib/proctor/mic-monitor.ts` & `src/hooks/useMicProctor.ts`:**
   - Thuật toán thuần `MicVoiceMonitorEngine`: nhận `rmsVoiceBand` (0..1) từ `AnalyserNode` (chỉ tính các bin FFT thuộc dải tần giọng nói 300–3400Hz); khi vượt ngưỡng liên tục ≥ 2500ms + cooldown 20000ms → phát sự kiện `MIC_VOICE`.
   - **Ràng buộc quyền riêng tư:** tuyệt đối **KHÔNG** khởi tạo `MediaRecorder`, **KHÔNG** lưu blob âm thanh, **KHÔNG** gửi audio lên server — chỉ phân tích mức năng lượng FFT tức thời trong RAM trình duyệt.

### C. Services & Kiểm soát quyền
- `proctorService.ts`:
  - `isHeuristicProctorEvent`: `MIC_VOICE`, `CAMERA_GAZE_AWAY`, `MOBILE_APP_SWITCH` mặc định là nghi vấn; riêng `CAMERA_LOOK_AWAY` nếu `assignment.cameraCountLookAway === true` và `cameraEnforce === true` thì mới tính vào `violationCount`.
- `assignmentService.ts` & `submissionService.ts`: truyền `cameraSensitivity`, `cameraCountLookAway`, `requireMicMonitor` qua `create/update/getStudentAssignmentPayload`.

### D. API Routes & Validators
- Cập nhật `createAssignmentSchema` & `updateAssignmentSchema` thêm 3 trường mới.
- Thêm nhãn sự kiện `CAMERA_GAZE_AWAY`, `MIC_VOICE`, `MOBILE_APP_SWITCH` vào `messages/vi.ts` và `messages/en.ts`.

### E. Giao diện UI
- **`src/app/(teacher)/teacher/settings/camera-test/page.tsx` (mới):** trang "Thử Camera & Micro AI" cho giáo viên; dùng trực tiếp `useCameraProctor` + `useMicProctor` ở chế độ thử nghiệm (`dryRun`, không tạo submission), cho chọn độ nhạy `Nhẹ / Vừa / Chặt`, hiển thị live video + overlay số khuôn mặt, yaw/pitch đã hiệu chỉnh, gaze offset, phone score, mức âm lượng micro dB và bảng log sự kiện giả lập. Gắn link từ `/teacher/settings` và trang `/teacher/assignments/new`.
- **`src/app/(teacher)/teacher/assignments/new/page.tsx`:** thêm chọn độ nhạy Camera AI (`LOW/MEDIUM/HIGH`), công tắc "Tính quay đầu là vi phạm" và "Phát hiện tiếng nói qua micro".
- **`src/app/(teacher)/teacher/assignments/[id]/grading/page.tsx`:** nâng cấp khối Nhật ký giám sát thi bằng bộ lọc chip theo loại sự kiện (`Tất cả / Camera / Màn hình / Âm thanh`) và bấm ảnh snapshot mở bằng `PhotoLightboxModal` ngay trong trang.
- **`src/app/(student)/student/assignments/[id]/rules/page.tsx` & `do/page.tsx`:**
  - Trên `/rules`: nếu bài bật `requireMicMonitor`, bổ sung bước kiểm tra micro trực tiếp & checkbox đồng ý rõ ràng (khẳng định không ghi âm).
  - Trên mobile (khi `!document.fullscreenEnabled` hoặc thiết bị cảm ứng màn hình nhỏ): không khoá màn hình bằng modal đòi bật fullscreen; tự chuyển sang chế độ giám sát mobile (`visibilitychange` + `pagehide` → ghi `MOBILE_APP_SWITCH`), hiển thị banner hướng dẫn rõ ở `/rules` và `/do`.

### F. Seed & Kiểm thử
- `prisma/seed.ts`: cập nhật 1 bài thi có `cameraSensitivity: "HIGH"`, `requireMicMonitor: true` và mẫu event `CAMERA_GAZE_AWAY` / `MIC_VOICE` để test timeline.
- Tests: unit (`estimateIrisGazeFromLandmarks`, presets độ nhạy, `MicVoiceMonitorEngine`), integration (server áp dụng `cameraCountLookAway`), E2E (mock camera & mic trên `/do`, lọc timeline + mở lightbox ảnh snapshot ở `/grading`, trang `/teacher/settings/camera-test`, giả lập viewport mobile 375px).

---

## Phase 19 — Thêm 9 Dạng Câu Hỏi Tương Tác & Đặc Thù Môn Học

### A. Database & Migration (`phase19_interactive_field_types` — tương thích ngược 100%)
- Bổ sung 9 giá trị vào enum `FieldType`: `MATCH`, `DRAG_DROP`, `SPEAKING`, `VOICE_ANSWER`, `HIGHLIGHT`, `ORDERING`, `WORDSEARCH`, `DRAW`, `CODE`.
- Không xoá hay đổi tên enum/cột cũ.

### B. Pure Libs, JSON Schema & Thuật toán chấm (`src/lib/grading/*`)
Quy chuẩn rõ 3 cấu trúc `options`, `answerKey`, `value` và logic chấm thuần cho **từng loại**:
1. **`MATCH` (`src/lib/grading/match.ts`):**
   - `options`: `{ left: Array<{ id: string; text: string; x?: number; y?: number }>, right: Array<{ id: string; text: string; x?: number; y?: number }> }`
   - `answerKey`: `{ pairs: Array<[string, string]> }`; `value`: `Record<string, string>` (`leftId -> rightId`).
   - Chấm: đếm số cặp khớp đúng / tổng cặp (hoặc `allOrNothing` nếu `gradingOpts.scoring === "ALL_OR_NOTHING"`).
2. **`DRAG_DROP` (`src/lib/grading/drag-drop.ts`):**
   - `options`: `{ tokens: Array<{ id: string; text: string; imageKey?: string }>, slots: Array<{ id: string; label: string; x?: number; y?: number; w?: number; h?: number }>, singleUse?: boolean }`
   - `answerKey`: `{ slots: Record<string, string[]> }`; `value`: `Record<string, string[]>`.
   - Chấm: với mỗi `slotId`, kiểm tra tập/thứ tự `tokenId` khớp `answerKey.slots[slotId]`; chấm tỉ lệ ô đúng.
3. **`SPEAKING` (`src/lib/grading/speaking.ts`):**
   - `options`: `{ lang?: "en-US"|"en-GB", maxTries?: number }`
   - `answerKey`: `{ transcript: string }`; `value`: `{ text: string; tries: number; audioKey?: string }`.
   - Chấm: gọi lại `gradeDictationText(transcript, value.text, maxPoints, field.gradingOpts)` (Levenshtein mức từ).
4. **`VOICE_ANSWER` (chấm tay — `isManualFieldType`):**
   - `options`: `{ maxDurationSec?: number }` (mặc định 120s).
   - `answerKey`: `{ note?: string }`; `value`: `{ fileKey: string; mimeType: string; durationSec?: number }`.
5. **`HIGHLIGHT` (`src/lib/grading/highlight.ts`):**
   - `options`: `{ tokens: string[] }` (đoạn văn tách sẵn theo từ giữ khoảng trắng/dấu câu).
   - `answerKey`: `{ indices: number[] }`; `value`: `number[]`.
   - Chấm: `netCorrect = max(0, truePositives - falsePositives)`, điểm = `round2(points * netCorrect / expected.length)` (hoặc `allOrNothing`).
6. **`ORDERING` (`src/lib/grading/ordering.ts`):**
   - `options`: `{ items: Array<{ id: string; text: string }> }`.
   - `answerKey`: `{ order: string[] }`; `value`: `string[]`.
   - Chấm: hỗ trợ `EXACT_POS` (số vị trí khớp đúng / N) hoặc `LCS` (độ dài chuỗi con chung dài nhất `lcsLength(student, expected) / N`, làm chuẩn cho câu sắp xếp câu/đoạn).
7. **`WORDSEARCH` (`src/lib/grading/wordsearch.ts`):**
   - `options`: `{ rows: number; cols: number; seed: number; showWordList?: boolean; wordHints?: string[] }`.
   - `answerKey`: `{ words: string[] }`; `value`: `{ found: Array<{ word: string; cells: Array<[number, number]> }> }`.
   - Thuật toán sinh lưới deterministic `generateWordsearchGrid(words, rows, cols, seed)` bằng PRNG LCG/Mulberry32 (luôn cho cùng 1 lưới cho cùng seed). **Bảo mật:** server sinh sẵn `grid: string[][]` đưa vào payload HS; nếu `showWordList !== true` thì **KHÔNG** gửi `wordHints` về client. Chấm theo số từ hợp lệ tìm được trên lưới (`foundWords ∩ answerKey.words`).
8. **`DRAW` (chấm tay — `isManualFieldType`):**
   - `options`: `{ width?: number; height?: number; backgroundKey?: string }`.
   - `answerKey`: `{ note?: string }`; `value`: `{ fileKey: string }`.
9. **`CODE` (chấm tay — `isManualFieldType`, bật chính trong `INFORMATICS` ở `src/lib/subjects.ts`):**
   - `options`: `{ language: "python"|"cpp"|"javascript"|"pascal"; starterCode?: string; sampleInput?: string; sampleOutput?: string }`.
   - `answerKey`: `{ referenceCode?: string; expectedOutput?: string }`; `value`: `{ code: string; lastOutput?: string }`.

### C. Services, Bảo mật & Tích hợp đồng bộ
- `src/app/api/submissions/[id]/files/route.ts`: mở rộng chấp nhận file ghi âm `audio/webm`, `audio/ogg`, `audio/mp4` (kiểm tra magic bytes `EBML` `1A 45 DF A3` / `OggS` / `ftyp`, ≤ 10MB) và ảnh PNG từ canvas `DRAW` (kiểm tra PNG magic `89 50 4E 47`); gắn tiền tố `submissions/${submissionId}/`.
- `submissionService.ts`:
  - `sanitizeAnswerValueForSubmission`: xác thực `fileKey`/`audioKey` thuộc đúng prefix `submissions/${submissionId}/` và không chứa `..` (áp dụng cho `VOICE_ANSWER`, `DRAW`, `SPEAKING`).
  - `getStudentAssignmentPayload`: không bao giờ gửi `answerKey` (kể cả `answerKey.words` của `WORDSEARCH` khi tắt `showWordList`, hoặc `referenceCode` của `CODE`) khi `revealKey === false`.
- `src/lib/subjects.ts`: thêm `MATCH`, `DRAG_DROP`, `SPEAKING`, `VOICE_ANSWER`, `HIGHLIGHT`, `ORDERING`, `WORDSEARCH`, `DRAW`, `CODE` vào profile phù hợp (vd: `LANGUAGE` có `MATCH`, `DRAG_DROP`, `SPEAKING`, `VOICE_ANSWER`, `HIGHLIGHT`, `ORDERING`, `WORDSEARCH`; `STEM` có `MATCH`, `DRAG_DROP`, `ORDERING`, `DRAW`; `INFORMATICS` có `CODE`, `ORDERING`, `MATCH`).
- `worksheetTransferService.ts` & `docx-builder.ts` & `reportService.ts`: xuất/nhập đầy đủ `.engclass.zip`, sinh đề Word đọc hiểu/nối cột/sắp xếp hợp lệ, thống kê báo cáo đúng cho cả 9 loại mới.

### D. API Routes & Validators
- `src/lib/validators/index.ts`: cập nhật `answerValueSchema` và validate `options`/`answerKey` tương ứng cho 9 loại mới.
- Bổ sung i18n nhãn loại câu & thông báo lỗi mới vào `messages/vi.ts`, `messages/en.ts`, `api-errors.ts`.

### E. Giao diện UI (Desktop + Mobile 375px)
- Tạo bộ component chuyên biệt trong `src/components/worksheet/interactive/`:
  - `MatchQuestionInput.tsx` (desktop kéo nối SVG line + mobile chạm trái rồi chạm phải)
  - `DragDropQuestionInput.tsx` (desktop kéo thả + mobile chạm thẻ rồi chạm ô)
  - `SpeakingQuestionInput.tsx` (Web Speech API + waveform indicator + fallback input gõ)
  - `VoiceAnswerInput.tsx` (`MediaRecorder` + thanh đếm giây + phát lại)
  - `HighlightQuestionInput.tsx` (chạm từ tô highlight)
  - `OrderingQuestionInput.tsx` (kéo thả + nút ↑/↓ cho mobile)
  - `WordsearchQuestionInput.tsx` (lưới chữ chạm/kéo chọn hàng ngang/dọc/chéo)
  - `DrawQuestionInput.tsx` (canvas vẽ nét/tẩy/màu/undo, lưu PNG)
  - `CodeQuestionInput.tsx` (editor hỗ trợ Tab + đánh số dòng + chạy thử JS trong Web Worker cô lập 2s trên trình duyệt)
- Tích hợp vào `WorksheetEditor.tsx` (trình soạn từng loại), `AnswerSheetPanel.tsx`, `OverlayFieldInput.tsx` (cho `MATCH`/`DRAG_DROP` trên PDF), `FocusQuestionRunner.tsx`, và `grading/page.tsx` (nghe audio `VOICE_ANSWER`, xem hình `DRAW`, xem code & output đối chiếu `CODE`).

### F. Seed & Kiểm thử
- `prisma/seed.ts`: tạo 1 worksheet mẫu tổng hợp có đủ các dạng tương tác (Tiếng Anh + Tin học `CODE`).
- Tests: unit cho tất cả hàm chấm thuần + `generateWordsearchGrid` + `lcsLength`; integration kiểm tra bảo mật không lộ `answerKey` / file magic bytes; E2E trọn luồng tạo → làm bài (desktop + mobile 375px) → xem kết quả.

---

## Phase 20 — Workbook, Trả bài làm lại, Tiến độ Bài giảng, Bảng tin & Đồng giáo viên

### A. Database & Migration (`phase20_workbook_coteacher_classroom` — tương thích ngược 100%)
- **Enum mới:** `ClassRole { OWNER, CO_TEACHER, ASSISTANT }`.
- **Enum bổ sung:** `SubmissionStatus` thêm `RETURNED`; `NotificationType` thêm `SUBMISSION_RETURNED`.
- **Workbook & Mở dần:**
  - `Workbook { id, ownerId, title, description?, deletedAt?, createdAt, updatedAt }` (`@@index([ownerId])`).
  - `WorkbookItem { id, workbookId, worksheetId, order }` (`@@unique([workbookId, worksheetId])`, `@@index([workbookId, order])`).
  - `Assignment`: thêm `workbookId String?`, `workbookOrder Int?`, `unlockAfterAssignmentId String?`.
- **Trả bài & Lịch sử sửa bài:**
  - `SubmissionRevision { id, submissionId, revisionNo, submittedAt, returnedAt?, teacherComment?, answersSnapshot Json, totalScore Float?, maxScore Float, createdAt }` (`@@index([submissionId, revisionNo])`).
- **Đồng giáo viên / Trợ giảng:**
  - `ClassTeacher { id, classId, userId, role ClassRole @default(CO_TEACHER), createdAt }` (`@@unique([classId, userId])`, `@@index([userId])`).
- **Tag chủ đề đa môn:** `Field.topicTag String?` (tự do theo từng môn học như *Đạo hàm*, *Este*, *Passive Voice*).
- **Tiến độ học bài giảng:**
  - `LessonItemProgress { id, lessonItemId, studentId, completedAt DateTime @default(now()), viewCount Int @default(1) }` (`@@unique([lessonItemId, studentId])`, `@@index([studentId])`).
- **Bảng tin lớp nâng cao:**
  - `Post`: thêm `pinned Boolean @default(false)`, `commentsLocked Boolean @default(false)`, `attachments Json?` (`Array<{ key, name, mimeType, sizeBytes }>`).
  - `PostPoll { id, postId @unique, question, allowMultiple Boolean @default(false), closesAt? }`.
  - `PostPollOption { id, pollId, text, order }`.
  - `PostPollVote { id, optionId, userId, createdAt }` (`@@unique([optionId, userId])`).
  - `PostReaction { id, postId, userId, emoji String, createdAt }` (`@@unique([postId, userId, emoji])`).

### B. Pure Libs & Thuật toán
- `src/lib/analytics/score-histogram.ts`: chia phổ điểm thang 10 thành 10 khoảng `[0..1, 1..2, …, 9..10]`, tính phân vị & trung vị.
- `src/lib/permissions.ts` (`ClassRole` helper): ánh xạ thứ bậc `OWNER (3) >= CO_TEACHER (2) >= ASSISTANT (1)`; kiểm tra quyền từng hành động (chỉ `OWNER`/`ADMIN` được xoá/lưu trữ/chuyển chủ sở hữu lớp hoặc quản lý `ClassTeacher`; `CO_TEACHER` sửa lớp, giao bài, đăng bài giảng; `ASSISTANT` chấm bài, xem báo cáo, live monitor, điểm danh).

### C. Services & Kiểm soát quyền
- **`src/lib/permissions.ts` & các service liên quan:**
  - Cập nhật `requireTeacherOfClass(classId, minRole = "CO_TEACHER")`, `requireTeacherOfAssignment(assignmentId, minRole = "ASSISTANT")`, `requireMemberOfClass`, `requireSubmissionAccess` đọc cả `cls.teacherId` lẫn bảng `ClassTeacher`.
  - Cập nhật `listTeacherClasses` & `listTeacherAssignments` để đồng giáo viên / trợ giảng thấy các lớp mình được mời tham gia kèm nhãn vai trò.
- **`src/server/workbookService.ts` (mới):**
  - CRUD Workbook & sắp xếp `WorkbookItem`.
  - `assignWorkbookToClass(workbookId, classId, settings)`: tạo tuần tự `Assignment` cho từng item trong 1 transaction; nếu `sequentialUnlock = true` gắn `unlockAfterAssignmentId = prevAssignment.id`.
  - Kiểm tra điều kiện mở bài trong `startOrResumeSubmission` & `getStudentAssignmentPayload`: nếu `assignment.unlockAfterAssignmentId != null`, phải tồn tại submission `SUBMITTED` hoặc `GRADED` của HS cho bài trước, nếu chưa → báo lỗi `PREREQUISITE_NOT_SUBMITTED`.
  - `getWorkbookMatrix(workbookId, classId)` + xuất ma trận điểm Excel.
- **`src/server/submissionService.ts`:**
  - `returnSubmissionForRevision(submissionId, teacherId, comment)`: chỉ áp dụng khi `status` là `SUBMITTED` hoặc `GRADED`; lưu snapshot hiện tại (`answers` + điểm) vào `SubmissionRevision`, đặt `status = "RETURNED"`, cập nhật `teacherComment`, gửi thông báo `SUBMISSION_RETURNED` cho học sinh.
  - Học sinh mở bài có `status === "RETURNED"`: cho sửa đáp án trực tiếp trên chính `submission` đó (`autosaveSubmissionAnswers` & `submitByStudent` chấp nhận `IN_PROGRESS` hoặc `RETURNED`, không tạo `attemptNo` mới, không tốn `maxAttempts`).
- **`src/server/classService.ts`:**
  - `manageClassTeachers`: mời giáo viên khác (tìm user có `role IN ("TEACHER", "ADMIN")`, `deletedAt: null`), đổi vai trò `CO_TEACHER`/`ASSISTANT`, gỡ khỏi lớp.
  - `getClassAnalytics(classId)`: điểm TB theo tuần (12 tuần gần nhất), tỉ lệ nộp bài, danh sách HS chưa nộp nhiều nhất.
  - `getClassSubmissionsOverview(classId, filters)`: trả mọi bài nộp trong lớp lọc theo `assignmentId`, `studentId`, `status`.
  - `cloneClass(classId, ownerId, newTitle)`: tạo lớp mới với `joinCode` mới, sao chép `ClassLesson` và cài đặt lớp (không sao chép HS, bài đăng, bài nộp).
- **`src/server/lessonProgressService.ts` (mới):** `markLessonItemViewed`, `getClassLessonProgress`.
- **`src/server/postService.ts` (tách/mở rộng từ `classService.ts`):** upload file đính kèm bài đăng (`classes/${classId}/posts/*`), ghim/bỏ ghim, khoá/mở bình luận, tạo & bình chọn `PostPoll`, react emoji; cập nhật `authorizeFileDownload` cho file đính kèm bài đăng.

### D. API Routes & Validators
- `/api/workbooks` (`GET`, `POST`), `/api/workbooks/[id]` (`GET`, `PATCH`, `DELETE`), `/api/workbooks/[id]/assign` (`POST`), `/api/worksheets/workbooks/[id]/matrix` (`GET`, `?export=xlsx`).
- `POST /api/submissions/[id]/return` (`requireSubmissionAccess` + `isTeacher`).
- `GET/POST/DELETE /api/classes/[id]/teachers` (`OWNER` / `ADMIN`).
- `GET /api/classes/[id]/submissions` & `GET /api/classes/[id]/analytics`.
- `POST /api/classes/[id]/clone`.
- `POST /api/lessons/items/[itemId]/progress`.
- `POST /api/classes/[id]/posts/upload`, `PATCH /api/classes/[id]/posts/[postId]` (pin/lock), `POST /api/classes/[id]/posts/[postId]/vote`, `POST /api/classes/[id]/posts/[postId]/react`.

### E. Giao diện UI
- `/teacher/worksheets?tab=workbooks`: quản lý & giao Workbook; trang `/teacher/classes/[id]/workbooks/[workbookId]` hiển thị ma trận điểm & xuất Excel.
- `ClassDetailView.tsx`: thêm tab **"Bài nộp"** (lọc & chấm liên tiếp), tab **"Thống kê"**, mục quản lý **Đồng giáo viên / Trợ giảng** trong Cài đặt lớp, nút **Nhân bản lớp**, bài giảng có tick xanh/tiến độ đã học, bài đăng bảng tin có ghim, ảnh/file đính kèm, Poll, khoá bình luận & emoji.
- `grading/page.tsx`: thêm nút **"Trả bài làm lại"** kèm lịch sử các lần nộp (`SubmissionRevision`) và biểu đồ **Phổ điểm (Histogram)** + lọc phân tích theo `topicTag`.

### F. Seed & Kiểm thử
- `prisma/seed.ts`: tạo 1 Workbook 3 bài trong lớp 12A1, gắn `teacher2` làm `ASSISTANT` lớp 12A1, tạo 1 `Post` có Poll & 1 bài đã ghim.
- Tests: unit (`score-histogram`, `ClassRole` permission matrix), integration (IDOR `ASSISTANT` vs `CO_TEACHER` vs `OWNER`, workbook sequential unlock, `RETURNED` không tốn attempt & giữ revision), E2E (Workbook matrix, trả bài & HS nộp lại, Poll & Pin bài).

---

## Phase 21 — Giao bài nhanh theo SGK, Điểm Offline & Sổ điểm tổng hợp

### A. Database & Migration (`phase21_offline_grades_gradebook` — tương thích ngược 100%)
- `Assignment`: thêm `isQuickTextbook Boolean @default(false)`, `promptText String?`, `attachmentKeys Json?` (`Array<{ key, name, mimeType, sizeBytes }>`).
- `OfflineGradeColumn { id, classId, title, date DateTime, maxScore Float @default(10), weight Float @default(1), note String?, createdById, createdAt, updatedAt }` (`@@index([classId, date])`).
- `OfflineGradeEntry { id, columnId, studentId, score Float?, note String?, updatedAt }` (`@@unique([columnId, studentId])`, `@@index([studentId])`).

### B. Pure Libs & Thuật toán
- `src/lib/gradebook-calc.ts`: công thức tính điểm trung bình có trọng số `weightedAvg10 = sum((score / maxScore * 10) * weight) / sum(weight)`; hỗ trợ lọc theo khoảng ngày và gộp thêm cột chuyên cần khi Phase 23 có dữ liệu.

### C. Services & Kiểm soát quyền
- `assignmentService.ts`: `createQuickTextbookAssignment(teacherId, input)` — tạo tự động 1 `Worksheet` (`isHiddenQuick?:` hoặc đặt tên `[SGK] ...`) chứa 1 trường `PHOTO_UPLOAD` với `prompt = input.promptText`, lưu file đề PDF/ảnh đính kèm (nếu có) và giao ngay cho lớp; cập nhật `authorizeFileDownload` cho `assignments/quick/*`.
- `offlineGradeService.ts` (mới):
  - `listOfflineGradeColumns`, `createOfflineGradeColumn`, `updateOfflineGradeColumn`, `deleteOfflineGradeColumn`.
  - `saveOfflineGradeEntries(columnId, entries[])` (chỉ cho HS thuộc lớp & `deletedAt: null`).
  - `importOfflineGradesFromExcel(columnId, buffer)` (khớp theo `email` hoặc họ tên chính xác, xem trước các dòng khớp/lỗi).
- `gradebookService.ts` (mới):
  - `getClassGradebook(classId, { from?, to? })`: gom mọi bài online (dùng điểm quy đổi thang 10 × `Assignment.weight`), mọi cột điểm offline (quy đổi thang 10 × `OfflineGradeColumn.weight`), tỉ lệ nộp bài, điểm TB tổng hợp.
  - `exportClassGradebookExcel(classId, range, locale)` & `exportStudentReportCardPdf(classId, studentId, range, locale)` (dùng `pdf-lib` + font Unicode tạo phiếu báo điểm cá nhân cho từng học sinh).
- `parentService.ts`: thêm danh sách `offlineGrades` của con vào `getChildOverviewForParent` (tuyệt đối không lộ điểm học sinh khác).

### D. API Routes & Validators
- `POST /api/assignments/quick` + `POST /api/assignments/quick/upload` (`requireTeacherOfClass`, check magic bytes).
- `GET/POST /api/classes/[id]/offline-grades`, `PATCH/DELETE /api/classes/[id]/offline-grades/[columnId]`, `PUT /api/classes/[id]/offline-grades/[columnId]/entries`, `POST /api/classes/[id]/offline-grades/[columnId]/import`.
- `GET /api/classes/[id]/gradebook` (`?format=json|xlsx`), `GET /api/classes/[id]/gradebook/student/[studentId]` (`?format=json|pdf`).

### E. Giao diện UI
- Tab **"Sổ điểm"** trong `ClassDetailView.tsx`: bảng lưới Excel-like có cột Online + Offline + Điểm TB tổng, chỉnh sửa điểm offline inline, nút "+ Cột điểm giấy", nút "Import Excel", nút "Xuất Sổ điểm Excel".
- Drawer **"Hồ sơ tiến bộ học sinh"** khi bấm tên HS trong lớp: biểu đồ đường điểm theo thời gian + nút **"Tải Phiếu báo điểm PDF"**.
- Modal **"Giao bài nhanh theo SGK"** ngay trên đầu tab Bài tập của lớp và `/teacher/assignments/new`: nhập mô tả trang sách + đính kèm ảnh/PDF đề → giao trong 10 giây.
- Cổng Phụ huynh (`/parent`): hiển thị thêm mục **Điểm kiểm tra trên lớp (giấy)** trong trang chi tiết của con.

### F. Seed & Kiểm thử
- `prisma/seed.ts`: tạo 1 bài giao nhanh SGK và 2 cột điểm kiểm tra trên giấy (15 phút & 1 tiết) có điểm cho lớp 12A1.
- Tests: unit (`gradebook-calc`), integration (IDOR sổ điểm, import Excel điểm giấy, phụ huynh chỉ thấy điểm con mình, PDF report card header `%PDF`), E2E (giao bài SGK → HS nộp ảnh → nhập điểm offline → kiểm tra sổ điểm & Cổng Phụ huynh).

---

## Phase 22 — Ngân hàng câu hỏi, Ma trận đề & Kỳ thi liên lớp

### A. Database & Migration (`phase22_question_bank_exams` — tương thích ngược 100%)
- `QuestionBankItem { id, ownerId, subject WorksheetSubject @default(GENERAL), type FieldType, prompt String, options Json?, answerKey Json, explanation String?, rubric Json?, skillTag SkillTag?, topicTag String?, level String?, difficulty Int @default(3), tags String[] @default([]), audioKey String?, imageKey String?, isShared Boolean @default(false), deletedAt DateTime?, createdAt, updatedAt }` (`@@index([ownerId, subject])`, `@@index([isShared, subject])`).
- `Field`: thêm `bankItemId String?`.
- `ExamVariant { id, assignmentId, code String, questionOrder Json, optionOrder Json, createdAt }` (`@@unique([assignmentId, code])`).
- `Submission`: thêm `examVariantId String?`.
- `ExamSession { id, ownerId, title String, worksheetId String, openAt DateTime?, dueAt DateTime?, timeLimitMin Int?, proctorConfig Json, createdAt, updatedAt }` (`@@index([ownerId])`).
- `Assignment`: thêm `examSessionId String?`.

### B. Pure Libs & Thuật toán
- `src/lib/exam/matrix-picker.ts`: hàm thuần `pickQuestionsByMatrix(pool, rows)` — kiểm tra đủ câu cho mỗi hàng ma trận trước khi bốc (ưu tiên dòng hẹp trước để tối đa khả năng thoả mãn không trùng câu), bốc ngẫu nhiên bằng Fisher-Yates; trả lỗi chi tiết hàng thiếu nếu kho không đủ.
- `src/lib/exam/variant-generator.ts`: hàm thuần `buildExamVariants(fields, count, startCode = 101)` — tạo `count` mã đề khác nhau (mặc định `101`, `102`, `103`, …) trộn thứ tự câu hỏi `ANSWER_SHEET` và `optionOrder` bên trong các câu trắc nghiệm.

### C. Services & Kiểm soát quyền
- `questionBankService.ts` (mới): CRUD câu hỏi (chỉ chủ sở hữu hoặc Admin sửa/xoá; GV khác chỉ xem/bốc câu có `isShared = true`); `saveFieldToQuestionBank(fieldId, teacherId)`; `generateWorksheetFromMatrix(teacherId, input)` (sao chép cả `audioKey`/`imageKey`, ghi `Field.bankItemId`).
- `examVariantService.ts` (mới): khi tạo/cập nhật bài giao có `variantCount > 1`, sinh `ExamVariant`; trong `startOrResumeSubmission`, chọn 1 `ExamVariant` theo phân bố đều `(existingCount % variants.length)` hoặc ngẫu nhiên, gán vào `Submission.examVariantId` và copy `questionOrder`/`optionOrder` của mã đề đó vào `Submission`. (Nhờ vậy `reportService.ts` thống kê theo `fieldId` gốc vẫn hoàn toàn chính xác, chỉ hiển thị thêm `examVariant.code`.)
- `examSessionService.ts` (mới): tạo `ExamSession` gắn nhiều lớp cùng lúc → tạo các `Assignment` liên kết `examSessionId`; `getExamSessionLiveSnapshot(examSessionId)` gộp trạng thái mọi lớp; `getExamSessionReport(examSessionId)` so sánh thống kê giữa từng lớp & toàn kỳ thi.
- Cập nhật `src/app/api/assignments/[id]/live/route.ts` hoặc tạo `/api/exams/[id]/live` để SSE nhận event từ nhiều `assignmentId` thuộc `ExamSession`.

### D. API Routes & Validators
- `/api/question-bank` (`GET`, `POST`), `/api/question-bank/[id]` (`PATCH`, `DELETE`), `/api/question-bank/from-field` (`POST`), `/api/question-bank/generate-worksheet` (`POST`).
- `/api/exams` (`GET`, `POST`), `/api/exams/[id]` (`GET`), `/api/exams/[id]/live` (`GET` + `?stream=1` SSE).
- Cập nhật `createAssignmentSchema` hỗ trợ `variantCount` (`1..24`).

### E. Giao diện UI
- `/teacher/question-bank`: kho câu hỏi với bộ lọc đa chiều (Môn, Loại câu, Chủ đề `topicTag`, Kỹ năng, Trình độ, Độ khó 1–5 sao, Tag, Chia sẻ), nút thêm câu / nhập từ đề, nút **"Tạo đề từ ma trận"** (bảng thêm từng dòng ma trận + xem trước số câu khả dụng trực tiếp).
- Trong `WorksheetEditor.tsx`: nút **"Lưu vào ngân hàng câu"** trên từng thẻ câu hỏi.
- Trong `/teacher/assignments/new`: tuỳ chọn **"Sinh nhiều mã đề (N mã)"** + mục mới `/teacher/exams` để tổ chức **Kỳ thi liên lớp** (chọn 1 đề, chọn nhiều lớp, 1 bảng cấu hình thi chung, mở màn Giám sát Live gộp và Báo cáo liên lớp).

### F. Seed & Kiểm thử
- `prisma/seed.ts`: nạp 25 `QuestionBankItem` (Tiếng Anh + Toán với `topicTag` & độ khó 1–5) + 1 `ExamSession` demo cho 2 lớp.
- Tests: unit (`pickQuestionsByMatrix`, `buildExamVariants`), integration (tạo đề 20 câu từ ma trận, sinh 4 mã đề, IDOR câu không share), E2E (tạo đề từ ma trận → giao 4 mã đề cho 2 lớp → kiểm tra HS nhận mã đề khác nhau & thống kê gộp đúng theo câu gốc).

---

## Phase 23 — Lịch dạy, Buổi học & Điểm danh

### A. Database & Migration (`phase23_schedule_attendance` — tương thích ngược 100%)
- **Enums mới:** `AttendanceStatus { PRESENT, EXCUSED, ABSENT, LATE }`, `SessionStatus { SCHEDULED, COMPLETED, CANCELLED }`.
- **Enum bổ sung:** `NotificationType` thêm `ATTENDANCE_ALERT`.
- `ClassScheduleRule { id, classId, dayOfWeek Int, startTime String, endTime String, title String?, meetingUrl String?, effectiveFrom DateTime, effectiveTo DateTime?, active Boolean @default(true), createdAt }` (`@@index([classId, active])`).
- `ClassSession { id, classId, ruleId String?, title String, startsAt DateTime, endsAt DateTime, status SessionStatus @default(SCHEDULED), isMakeup Boolean @default(false), meetingUrl String?, notes String?, lessonIds Json?, assignmentIds Json?, createdAt, updatedAt }` (`@@index([classId, startsAt])`, `@@unique([ruleId, startsAt])`).
- `AttendanceRecord { id, sessionId, studentId, status AttendanceStatus @default(PRESENT), note String?, markedById String?, markedAt DateTime @default(now()) }` (`@@unique([sessionId, studentId])`, `@@index([studentId])`).

### B. Pure Libs & Thuật toán
- `src/lib/schedule/recurrence.ts`: hàm thuần `expandScheduleOccurrences(rule, rangeStart, rangeEnd)` — tính đúng múi giờ địa phương/UTC cho từng thứ trong tuần (`0..6`), trả danh sách `{ startsAt, endsAt }` để insert idempotent (`skipDuplicates`).
- `src/lib/attendance-calc.ts`: tính tỉ lệ chuyên cần `(presentCount + lateCount * 0.8 + excusedCount * 0.5) / totalMarkedSessions` (có cấu hình rõ ràng & trả số buổi từng loại `present/excused/absent/late`).

### C. Services & Kiểm soát quyền
- `scheduleService.ts` (mới): CRUD quy tắc lặp tuần + sinh buổi học tự động cho 12 tuần tới (hoặc theo khoảng ngày lịch); `createMakeupSession`, `updateClassSession` (đổi giờ/huỷ/đính kèm link Meet/tài liệu/bài tập), `listScheduleForTeacher`, `listScheduleForStudent` (chỉ lớp đã ACTIVE).
- `attendanceService.ts` (mới):
  - `getSessionAttendance(sessionId)`: trả danh sách HS `ACTIVE` (`deletedAt: null`) của lớp + trạng thái hiện tại.
  - `saveSessionAttendance(sessionId, records[], actorId)`: lưu batch trong transaction; **tự động gửi thông báo `ATTENDANCE_ALERT`** cho phụ huynh đã liên kết nếu trạng thái mới chuyển sang `ABSENT` hoặc `LATE` (kèm tên buổi & ghi chú giáo viên).
  - `getMonthlyAttendanceReport(classId, year, month)`.
- Tích hợp chuyên cần vào `gradebookService.ts` (thêm cột `% Chuyên cần` & `Số buổi vắng` vào Sổ điểm Phase 21) và `parentService.ts` (hiển thị chuyên cần trên Cổng Phụ huynh).

### D. API Routes & Validators
- `/api/classes/[id]/schedule-rules` (`GET`, `POST`, `DELETE`)
- `/api/classes/[id]/sessions` (`GET`, `POST` buổi bù)
- `/api/schedule` (`GET` `?from=...&to=...` cho giáo viên hoặc học sinh)
- `/api/sessions/[id]` (`GET`, `PATCH`, `DELETE`)
- `/api/sessions/[id]/attendance` (`GET`, `PUT`)
- `/api/classes/[id]/attendance/report` (`GET` `?year=...&month=...`)

### E. Giao diện UI
- Trang `/teacher/schedule` & `/student/schedule` (thêm link trên `AppNavbar.tsx`): lịch xem **Tuần / Tháng** trên desktop và danh sách theo ngày mượt trên mobile 375px; nhấn buổi học mở drawer/trang chi tiết có link Google Meet/Zoom, danh sách bài giảng & bài tập buổi đó.
- Tab **"Lịch & Điểm danh"** trong `ClassDetailView.tsx`: cài đặt lịch lặp tuần, bảng điểm danh nhanh 1 chạm ("Tất cả có mặt", đổi từng HS Có mặt / Vắng phép / Vắng KP / Đi muộn + ghi chú), báo cáo chuyên cần tháng.

### F. Seed & Kiểm thử
- `prisma/seed.ts`: tạo lịch T2–T6 hằng tuần cho lớp 12A1, 4 buổi học và dữ liệu điểm danh mẫu (có 1 học sinh vắng & 1 học sinh đi muộn).
- Tests: unit (`expandScheduleOccurrences`, `attendance-calc`), integration (tự gửi `ATTENDANCE_ALERT` cho phụ huynh khi điểm danh `ABSENT`, IDOR giữa các lớp, xuất chuyên cần vào sổ điểm), E2E (tạo lịch → điểm danh buổi → kiểm tra chuông thông báo phụ huynh & cột chuyên cần trong Sổ điểm).

---

## Phase 24 — Học sinh, Flashcard SRS, Phụ huynh & Thông báo đa kênh

### A. Database & Migration (`phase24_student_parent_notifications` — tương thích ngược 100%)
- **Flashcard SRS:**
  - `FlashcardDeck { id, ownerId, classId?, title, description?, createdAt, updatedAt }` (`@@index([ownerId])`, `@@index([classId])`).
  - `Flashcard { id, deckId, front String, back String, phonetic String?, example String?, audioKey String?, order Int @default(0) }` (`@@index([deckId, order])`).
  - `FlashcardReview { id, flashcardId, studentId, easeFactor Float @default(2.5), intervalDays Int @default(0), repetitions Int @default(0), nextReviewAt DateTime @default(now()), lastReviewedAt DateTime? }` (`@@unique([flashcardId, studentId])`, `@@index([studentId, nextReviewAt])`).
- **Động lực học (Gamification):**
  - `Class`: thêm `enableGamification Boolean @default(true)`.
  - `StudentStreak { userId String @id, currentStreak Int @default(0), longestStreak Int @default(0), lastActivityDate String?, updatedAt }`.
  - `StudentBadge { id, userId, code String, earnedAt DateTime @default(now()) }` (`@@unique([userId, code])`).
- **Nhắn tin GV–PH & Báo cáo tuần:**
  - `ParentThread { id, classId, parentId, studentId, lastMessageAt DateTime @default(now()), createdAt }` (`@@unique([classId, parentId, studentId])`).
  - `ParentMessage { id, threadId, senderId, content String, readAt DateTime?, createdAt }` (`@@index([threadId, createdAt])`).
  - `WeeklyReportSent { id, parentId, studentId, weekKey String, sentAt DateTime @default(now()) }` (`@@unique([parentId, studentId, weekKey])`).
- **Thông báo đa kênh:**
  - `PushSubscription { id, userId, endpoint String @unique, p256dhEncrypted String, authEncrypted String, userAgent String?, createdAt }` (`@@index([userId])`).
  - `NotificationPreference { userId String @id, emailEnabled Boolean @default(true), emailAssignmentNew Boolean @default(true), emailDueReminder Boolean @default(true), emailWeeklyReport Boolean @default(true), pushEnabled Boolean @default(false), updatedAt }`.

### B. Pure Libs & Thuật toán
- **`src/lib/srs.ts`:** triển khai thuật toán SM-2 chuẩn (`computeNextSrsState(prev, quality)` với `quality: 0 | 3 | 4 | 5` tương ứng *Lại / Khó / Tốt / Dễ*):
  - Nếu `quality < 3`: `repetitions = 0`, `intervalDays = 1`.
  - Ngược lại: `rep 0 → 1d`, `rep 1 → 6d`, `rep >= 2 → round(interval * easeFactor)`, cập nhật `easeFactor = max(1.3, EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))`.
  - Tính `nextReviewAt = now + intervalDays * 86400_000`.
- **`src/lib/streak.ts`:** hàm thuần `advanceStreak(prev, activityDayVN)` theo múi giờ `Asia/Ho_Chi_Minh` (YYYY-MM-DD): cùng ngày → giữ nguyên; hôm qua → `current + 1`; cách > 1 ngày → reset `1`; cập nhật `longest = max(longest, current)`.

### C. Services & Kiểm soát quyền
- **`mistakeReviewService.ts` (mới):** chỉ lấy câu trả lời `isCorrect === false` từ các bài nộp ở trạng thái `GRADED`/`SUBMITTED` **đã thoả mãn `canRevealResult && assignment.showAnswerKey && !canStillAttempt`** (bảo đảm không rò rỉ đáp án bài đang làm hoặc chưa công bố). Cho phép luyện lại ngẫu nhiên/lọc theo môn/kỹ năng không lưu điểm chính thức.
- **`flashcardService.ts` (mới):** CRUD bộ thẻ cho giáo viên & cá nhân học sinh; trích xuất nhanh thẻ từ các câu `TEXT`/`VOCABULARY` của một worksheet; `getDueFlashcards(deckId, studentId)`, `submitFlashcardReview(flashcardId, studentId, quality)`.
- **`gamificationService.ts` (mới):** hook gọi từ `finalizeSubmissionInternal` khi nộp bài, cập nhật `StudentStreak` và trao huy hiệu (`FIRST_SUBMIT`, `ON_TIME_5`, `PERFECT_10`, `STREAK_7`); trả kết quả cho dashboard học sinh (ẩn nếu mọi lớp của HS đều tắt `enableGamification`).
- **`weeklyReportService.ts` (mới):** chạy Chủ nhật lúc 19:00 (`src/instrumentation.ts`), tổng hợp 7 ngày gần nhất cho từng cặp `(parentId, studentId)`: bài đã chấm + điểm TB, bài chưa nộp, chuyên cần, cảnh báo thi (chỉ nếu `shareProctorWithParent`), tạo thông báo + gửi Email nếu phụ huynh bật `emailWeeklyReport`.
- **`parentMessageService.ts` (mới):** kiểm tra nghiêm ngặt: người gửi chỉ là `TEACHER`/`CO_TEACHER`/`ADMIN` của `classId` HOẶC `PARENT` có `ParentLink.verifiedAt != null` với `studentId` và `studentId` đang `ACTIVE` trong `classId` → chống IDOR giữa các phụ huynh/giáo viên khác lớp; đánh dấu đã đọc và đếm chưa đọc.
- **`externalNotifyService.ts` (mới):**
  - Adapter **Web Push** (`web-push` với `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`; mã hoá `p256dh`/`auth` bằng `crypto-secrets.ts`; tự xoá subscription khi push server trả `410 Gone`).
  - Adapter **Email SMTP** (`nodemailer` dùng `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`; chỉ gửi khi cấu hình đủ env và người dùng bật tùy chọn trong `NotificationPreference`).
  - Adapter **Webhook / Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `ALERT_WEBHOOK_URL`)**: gửi cảnh báo lỗi hệ thống / deploy rollback và tuỳ chọn chuyển tiếp thông báo khẩn.

### D. API Routes & `.env.example`
- `/api/student/mistakes` (`GET`), `/api/flashcards` (`GET`, `POST`), `/api/flashcards/[deckId]/review` (`GET`, `POST`), `/api/flashcards/from-worksheet` (`POST`).
- `/api/messages/threads` (`GET`, `POST`), `/api/messages/threads/[threadId]` (`GET`, `POST`, `PATCH` mark-read).
- `/api/notifications/preferences` (`GET`, `PUT`), `/api/notifications/push` (`GET` publicKey, `POST` subscribe, `DELETE` unsubscribe).
- Cập nhật `.env.example`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`, `ALERT_WEBHOOK_URL`.

### E. Giao diện UI
- `public/sw.js` (Service Worker xử lý sự kiện `push` & `notificationclick` cho PWA).
- `/student/mistakes` (giao diện luyện lại từng câu sai kèm xem giải thích).
- `/student/flashcards` + `/teacher/worksheets?tab=flashcards` (lật thẻ 3D mượt trên mobile 375px, nút phát âm Web Speech, 4 nút SM-2).
- `StudentDashboardClient.tsx`: card Streak lửa + huy hiệu đạt được (khi bật gamification).
- `/messages`: hộp thư 1-1 Giáo viên ↔ Phụ huynh gắn nhãn tên học sinh & lớp, badge số tin chưa đọc trên `AppNavbar.tsx`.
- `/account`: thêm card **Cài đặt thông báo Email & Web Push** (nút xin quyền Push + các công tắc nhận mail).

### F. Seed & Kiểm thử
- `prisma/seed.ts`: tạo 1 bộ Flashcard Unit 7 (10 từ vựng), streak & huy hiệu mẫu cho `student1`, 1 hội thoại `ParentThread` mẫu giữa `teacher1` và `parent1`.
- Tests: unit (`srs.ts` SM-2, `streak.ts`), integration (luyện câu sai không lộ đáp án bài chưa mở, IDOR hội thoại `ParentThread`, mock transport cho SMTP & `web-push`), E2E (lật flashcard SRS, nhắn tin GV↔PH, ôn câu sai).

---

## Phase 25 — Quản lý kho học liệu, Thư viện công khai & AI hỗ trợ giáo viên

### A. Database & Migration (`phase25_library_discover_ai_public` — tương thích ngược 100%)
- `LibraryFolder { id, ownerId, parentId?, kind String, name String, color String?, createdAt, updatedAt }` (`@@index([ownerId, kind])`).
- `Worksheet`: thêm `folderId String?`, `tags String[] @default([])`, `isPublic Boolean @default(false)`, `publicLevel String?`, `publicHiddenByAdmin Boolean @default(false)`, `likeCount Int @default(0)`.
- `Lesson`: thêm `folderId String?`, `tags String[] @default([])`.
- `WorksheetVersion { id, worksheetId, versionNo Int, note String?, createdById String?, snapshot Json, createdAt }` (`@@unique([worksheetId, versionNo])`).
- `WorksheetLike { worksheetId, userId, createdAt }` (`@@id([worksheetId, userId])`).
- `TeacherFollow { followerId, teacherId, createdAt }` (`@@id([followerId, teacherId])`).
- `ContentReport { id, worksheetId, reporterId, reason String, status String @default("OPEN"), reviewedById?, reviewedAt?, createdAt }` (`@@index([status, createdAt])`).
- `AiUsageLog { id, userId, action String, dayKey String, tokensUsed Int?, createdAt }` (`@@index([userId, dayKey])`).
- `Assignment`: thêm `publicShareToken String? @unique`, `allowPublicPractice Boolean @default(false)`.
- `PublicAttempt { id, assignmentId, guestName String, answers Json, autoScore Float, maxScore Float, submittedAt DateTime @default(now()) }` (`@@index([assignmentId, submittedAt])`).

### B. Pure Libs & Thuật toán
- `src/lib/ai/gemini-prompt.ts`: xây dựng prompt chặt chẽ yêu cầu Gemini API trả JSON thuần (`responseMimeType: "application/json"`) khớp schema Zod của `Field` (`MULTIPLE_CHOICE`, `TRUE_FALSE_GROUP`, `TEXT`, `WORDSEARCH`, `ESSAY`); parser & sanitizer kiểm tra tính hợp lệ từng câu sinh ra trước khi trả về editor.

### C. Services & Kiểm soát quyền
- `folderService.ts` (mới): cây thư mục đa cấp (chặn vòng lặp cha–con khi di chuyển), gắn/lọc tag cho Worksheet & Bài giảng.
- `worksheetVersionService.ts` (mới): `createWorksheetSnapshot(worksheetId, actorId, note)` (tự động gọi trước khi giao bài hoặc khi bấm "Lưu phiên bản", giữ tối đa 30 bản gần nhất); `restoreWorksheetVersion(worksheetId, versionId, actorId)` (nếu worksheet **đã có bài nộp**, tự động tạo bản clone khôi phục hoặc chỉ cho khôi phục metadata/câu chưa có bài nộp để không bao giờ làm hỏng điểm học sinh đã nộp!).
- `discoverService.ts` (mới):
  - `listPublicWorksheets(filters)` & `getPublicWorksheetPreview(id)`: **explicit select TUYỆT ĐỐI KHÔNG BAO GIỜ trả `answerKey` hoặc `gradingOpts`**; ẩn bài có `publicHiddenByAdmin = true` hoặc `deletedAt != null`.
  - `clonePublicWorksheet(id, teacherId)`: clone đủ PDF/audio/ảnh/câu hỏi về kho riêng của giáo viên (chỉ khi `isPublic && !publicHiddenByAdmin && !deletedAt`).
  - `toggleWorksheetLike`, `toggleTeacherFollow`, `getTeacherPublicProfile(teacherId)`, `reportPublicWorksheet`, `adminModerateReport(reportId, action)`.
- `aiGeneratorService.ts` (mới): kiểm tra có `GEMINI_API_KEY` (nếu thiếu báo mã lỗi thân thiện chưa bật AI), kiểm tra hạn mức ngày `AI_DAILY_LIMIT_PER_TEACHER` (mặc định 20/ngày trên `AiUsageLog`), chỉ nhận văn bản đề/ngữ liệu của giáo viên (**không bao giờ nhận hay gửi thông tin học sinh**), gọi Gemini REST API với timeout 30s, trả mảng câu hỏi nháp để GV sửa trước khi lưu.
- `publicPracticeService.ts` (mới): `enablePublicPracticeLink(assignmentId)` (bắt buộc ép `proctorMode = OFF`, `requireCamera = false`, `requireFullscreen = false`), `getPublicPracticePayload(token)` (không lộ `answerKey`), `submitPublicPractice(token, guestName, answers)` (chấm thuần qua `gradeSubmission`, lưu `PublicAttempt` tách biệt khỏi `Submission` & bảng xếp hạng lớp).

### D. API Routes & `.env.example`
- `/api/folders` (`GET`, `POST`), `/api/folders/[id]` (`PATCH`, `DELETE`).
- `/api/worksheets/[id]/versions` (`GET`, `POST`), `/api/worksheets/[id]/versions/[versionId]/restore` (`POST`).
- `/api/discover` (`GET`), `/api/discover/[id]` (`GET`), `/api/discover/[id]/clone` (`POST`), `/api/discover/[id]/like` (`POST`), `/api/discover/[id]/report` (`POST`).
- `/api/teachers/[id]/profile` (`GET`), `/api/teachers/[id]/follow` (`POST`), `/api/admin/content-reports` (`GET`, `PATCH`).
- `POST /api/ai/generate-questions` (`requireRole(["TEACHER", "ADMIN"])`).
- `POST /api/assignments/[id]/public-link` & `GET/POST /api/public/practice/[token]`.
- Cập nhật `.env.example`: `GEMINI_API_KEY`, `GEMINI_MODEL`, `AI_DAILY_LIMIT_PER_TEACHER`.

### E. Giao diện UI
- `/teacher/worksheets`: thanh bên cây Thư mục + lọc Tag (thu gọn thành dropdown trên mobile 375px).
- `WorksheetEditor.tsx`: panel **"Lịch sử phiên bản"** (xem diff, khôi phục), nút **"AI tạo câu hỏi"** (nhập đoạn văn/chọn trang PDF, chọn số câu & loại câu, xem trước & sửa từng câu rồi bấm Thêm vào đề), công tắc **"Công khai lên Thư viện Khám phá"** kèm chọn trình độ.
- `/discover` & `/teachers/[id]`: trang Khám phá cộng đồng (tìm theo môn, trình độ, dạng câu), xem trước không đáp án, Clone 1 chạm, Tim yêu thích, Theo dõi GV, Báo cáo vi phạm.
- `/admin` (hoặc `/admin/moderation`): danh sách báo cáo vi phạm cho Admin ẩn/duyệt bài.
- `/practice/[token]`: trang làm bài mở không cần đăng nhập (nhập họ tên → làm bài → xem điểm ngay).

### F. Seed & Kiểm thử
- `prisma/seed.ts`: thêm 2 thư mục mẫu, 2 worksheet công khai trên `/discover`, 2 phiên bản lịch sử mẫu.
- Tests: unit (Gemini response parser & folder cycle guard), integration (discover preview tuyệt đối không lộ `answerKey` kể cả network payload, khôi phục phiên bản bảo toàn submission cũ, mock `fetch` Gemini API + quota 20/ngày, public practice chấm điểm không ghi vào bảng xếp hạng), E2E (discover clone, AI mock sinh câu & thêm vào đề, link `/practice/[token]`).

---

## Phase 26 — Tài khoản, Bảo mật nâng cao & Sẵn sàng mở rộng

### A. Database & Migration (`phase26_auth_security_scaling` — tương thích ngược 100%)
- `PasswordResetToken { id, userId, tokenHash String @unique, expiresAt DateTime, usedAt DateTime?, createdAt DateTime @default(now()) }` (`@@index([userId])`, `@@index([expiresAt])`).
- `LoginSessionLog { id, userId, provider String, ipMasked String?, userAgent String?, createdAt DateTime @default(now()) }` (`@@index([userId, createdAt])`).

### B. Pure Libs & Thuật toán
- `src/lib/ip-mask.ts`: hàm ẩn 2 octet cuối IPv4 (`192.168.1.42` → `192.168.x.x`) hoặc IPv6 giữ prefix /48 trước khi lưu `LoginSessionLog` (bảo vệ quyền riêng tư).
- **Adapter Redis (`src/lib/redis.ts`, `src/lib/proctor-bus.ts`, `src/lib/rate-limit.ts`):**
  - Tự tạo client Redis nhẹ qua `ioredis` (hoặc giao thức RESP chuẩn qua `net.Socket` nếu muốn 0 dependency nặng — ưu tiên `ioredis` nhẹ chuẩn production) chỉ khởi tạo khi `process.env.REDIS_URL` được cấu hình.
  - `proctor-bus.ts`: interface `ProctorBusDriver` (`InMemoryProctorBus` mặc định; `RedisProctorBus` dùng Redis Pub/Sub kênh `pivora:proctor:${assignmentId}` khi có `REDIS_URL`, tự fallback In-Memory khi mất kết nối).
  - `rate-limit.ts`: bổ sung `checkRateLimitAsync` dùng Redis `INCR` + `PEXPIRE` (và giữ `checkRateLimit` đồng bộ fallback để không vỡ caller hiện tại), cho phép chạy nhiều container app song song.

### C. Services & Kiểm soát quyền
- **`passwordResetService.ts` (mới):**
  - `requestPasswordReset(email, ip)`: rate limit chặt (5 lần / 15 phút / email + IP); chỉ xử lý nếu user tồn tại, `deletedAt: null`, `isLocked: false`; sinh 32 byte random token, lưu `SHA-256` hash hết hạn 30 phút (vô hiệu token cũ chưa dùng của user), gửi email qua `externalNotifyService` (nếu SMTP bật); **luôn trả cùng 1 thông điệp thành công** để chống dò email tồn tại.
  - `completePasswordReset(token, newPassword)`: kiểm tra hash hợp lệ, chưa dùng, chưa hết hạn; cập nhật `passwordHash`, `passwordChangedAt = now`, `mustChangePassword = false`, `usedAt = now` trong cùng 1 transaction; ghi `AuditLog`.
- **`src/lib/auth.ts`:**
  - Hoàn thiện `callbacks.signIn` cho Google OAuth: bắt buộc `profile?.email_verified === true`; tra `prisma.user.findUnique({ where: { email } })`; **từ chối tuyệt đối** nếu không tồn tại trong DB hoặc `deletedAt != null` hoặc `isLocked === true` (redirect `/login?error=AccountNotProvisioned` / `AccountLocked`); tuyệt đối không tự đăng ký người lạ.
  - Cập nhật kiểm tra 2FA TOTP khi đăng nhập cho cả `ADMIN` **và** `TEACHER` (`user.role === "ADMIN" || user.role === "TEACHER"`).
  - Ghi `LoginSessionLog` (đã ẩn IP) mỗi khi đăng nhập Credentials hoặc Google thành công.
- **`src/server/totpService.ts` & `src/app/api/account/totp/*`:** mở quyền bật/tắt/tạo mã dự phòng TOTP cho cả `ADMIN` và `TEACHER` (HS/PH vẫn giữ không bắt buộc).
- **`src/server/accountService.ts`:** thêm `listLoginHistory(userId)` (15 lần gần nhất) và `signOutAllDevices(userId)` (cập nhật `passwordChangedAt = new Date()` + ghi `AuditLog`).

### D. API Routes & `.env.example`
- `POST /api/auth/forgot-password` & `POST /api/auth/reset-password` (public có rate limit chặt).
- `GET /api/account/sessions` & `POST /api/account/logout-all` (`requireAuth`).
- Cập nhật `/api/account/totp/*` (`requireRole(["ADMIN", "TEACHER"])`).
- Cập nhật `.env.example`: `REDIS_URL`, làm rõ `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

### E. Giao diện UI
- `src/app/(auth)/forgot-password/page.tsx` & `src/app/(auth)/reset-password/page.tsx`: form yêu cầu link & đặt lại mật khẩu, thông báo rõ nếu hệ thống chưa cấu hình email SMTP thì liên hệ Admin/Giáo viên.
- `src/app/(auth)/login/page.tsx`: hiển thị nút **"Đăng nhập bằng Google"** chỉ khi `AUTH_GOOGLE_ID` đã cấu hình (truyền flag từ Server Component), hiển thị thông báo lỗi rõ ràng nếu email Google chưa được cấp tài khoản (`AccountNotProvisioned`).
- `src/app/account/AccountClient.tsx`: mở card Bảo mật 2FA TOTP cho cả **Giáo viên**; thêm bảng **Lịch sử đăng nhập gần đây** và nút **"Đăng xuất khỏi tất cả thiết bị khác"** (có Dialog xác nhận).

### F. Seed & Kiểm thử
- `prisma/seed.ts`: thêm vài dòng `LoginSessionLog` mẫu cho tài khoản demo.
- Tests: unit (`ip-mask`, `proctor-bus` & `rate-limit` với In-Memory + mock Redis), integration (Google OAuth từ chối email chưa được cấp, cho qua email đã cấp; quên mật khẩu token hết hạn/dùng 1 lần/chống dò email; Teacher bật 2FA & đăng nhập lại phải nhập mã; logout-all vô hiệu JWT cũ), E2E (Teacher bật 2FA + đăng nhập lại, quên mật khẩu + reset mật khẩu end-to-end với token, kiểm tra mobile 375px & dark mode).

---

## Ngoài phạm vi (chưa làm, chỉ ghi lại)
Quản lý học phí / thanh toán online (VNPay / VietQR / MoMo), bán khoá học / website cá nhân thương mại cho giáo viên, đa trường / đa cơ sở (Multi-tenant), app mobile native (iOS / Android) riêng ngoài PWA, tích hợp Zoom SDK bản quyền, biên tập video bằng AI, "gia sư AI" chat trực tiếp cho học sinh, cấp chứng chỉ, tích hợp Google Classroom / Microsoft Teams, import từ Liveworksheets.

---

## Tiến độ

_(Agent ghi vào đây sau mỗi Phase: đã làm gì, còn thiếu gì, quyết định nào khác plan và lý do, kết quả `lint / typecheck / test / test:e2e / build:check`, commit hash, tên nhánh.)_

### Phase 13 — Quản trị & vận hành (24/11/2026)

- **Nhánh:** `gemini/phase-13` → đã merge vào `main` (`8fb2631`..`c53b4c0`).
- **Migration Prisma:** `20261124155121_phase13_admin_ops` — tương thích ngược 100%.
- **Đã làm:** Chuyển quyền sở hữu lớp/worksheet (`TransferOwnershipDialog`), `AuditLog` + `/admin/audit`, nhập user hàng loạt từ Excel + xuất mật khẩu tạm 1 lần (`OneTimeExport`), TOTP 2FA cho Admin (`/account` + `/login`), `ErrorLog` + `/admin/errors` + cảnh báo rollback trong `scripts/auto-deploy.sh` + `scripts/verify-backup.sh`.
- **Kết quả kiểm tra:** `pnpm lint` 0 lỗi/0 cảnh báo, `pnpm typecheck` 0 lỗi, `pnpm test` 102/102, `pnpm test:e2e` 15/15, `pnpm build:check` pass.

### Phase 14 — Kho bài giảng dùng chung & Thùng rác 30 ngày đồng bộ Drive (25/11/2026)

- **Commits trên `main`:** `4e5f431` → `48bcc86` → `1266c0b` → `d3724f9` → `4f2b75e` → `4d9bfe5` → `4f5431d` → `8375772` → `6041c61` → `8202ea0` → `a343f47`.
- **Migrations Prisma:** `20261125020747_phase14_lesson_library`, `20261125031753_phase14_content_trash`, `20261125115352_class_trash`.
- **Đã làm:** Kho bài giảng dùng chung nhiều lớp (`ClassLesson`, `LessonLibrary`, tab Thư viện), Thùng rác 30 ngày đồng bộ Google Drive cho Worksheet/Bài giảng/Lớp học (`TrashView`, `syncTrashWithDrive`, `trashDriveOrphans`), cải tiến trang giao bài, nút quay lại ngữ cảnh, landing đa môn & login tối giản, tổng quan phụ huynh theo từng lớp.

### Phase 15 — Worksheet đa môn học, KaTeX, Đúng/Sai 4 ý THPT 2025 & Nộp ảnh (26/11/2026)

- **Commit trên `main`:** `a6a71ba`.
- **Migration Prisma:** `20261126012953_phase15_multi_subject_worksheets`.
- **Đã làm:** 11 môn học (`WorksheetSubject`, `src/lib/subjects.ts`), KaTeX (`MathText`), ngữ liệu đọc hiểu dùng chung (`Worksheet.passages`), loại câu `TRUE_FALSE_GROUP` (Đúng/Sai 4 ý chấm luỹ tiến THPT 2025), loại câu `PHOTO_UPLOAD` (chụp ảnh vở / tải PDF + nén ảnh client + `PhotoLightboxModal`), tab Thùng rác cho lớp học.

### Phase 16 — Giao bài linh hoạt, Chấm nâng cao & Trải nghiệm làm bài (26/11/2026)

- **Nhánh:** `phase-16` (merged fast-forward vào `main`).
- **Migration Prisma:** `20261126153353_phase16_flexible_assignments_grading` — tương thích ngược 100%.
- **Đã làm:**
  - **Giao bài theo nhóm & Ngoại lệ cá nhân:** Bảng `AssignmentTarget` (giao cho toàn lớp hoặc chọn từng học sinh, chặn IDOR ở API/permission/report/parent/proctor) và `AssignmentOverride` (`extraAttempts`, hạn riêng `dueAt`, `timeLimitMin`, ghi chú lý do, thông báo + `AuditLog`, UI `OverrideDialog` trong trang chấm bài).
  - **Nhắc nhở trước hạn 24h:** `Assignment.remindBeforeDue`, bảng `AssignmentReminderSent` (chống gửi trùng), `sendDueSoonReminders` chạy định kỳ mỗi 60 phút ở `src/instrumentation.ts`.
  - **Thang điểm quy đổi & Hệ số:** Enum `ScoreScale` (`SCALE_10`, `SCALE_100`, `IELTS`, `RAW`), `Assignment.weight`, `convertScoreToScale()` hiển thị trên kết quả học sinh, bảng điểm GV và cột quy đổi trong Excel export.
  - **Chấm nâng cao:** `Field.rubric` & `Answer.rubricScores` (`RubricEditor`, `computeRubricTotal`, chi tiết tiêu chí cho học sinh khi `revealResult` bật), ngân hàng nhận xét nhanh `TeacherCommentPreset` (`CommentPresetBar`, tối đa 100 mẫu), **Chấm theo câu** (`GradeByQuestionPanel`) kèm **Chấm ẩn danh (`Blind Grading`)** và `PATCH /api/submissions/[id]/grade` (`saveSingleFieldGrade`).
  - **Trải nghiệm làm bài & Đồng bộ:** Hàng đợi bản nháp ngoại tuyến `src/lib/offline-answer-queue.ts` (khôi phục an toàn theo `attemptVersion`, tự đồng bộ khi có mạng, xoá khi nộp/reset/stale), lưu bền trạng thái **Gắn cờ xem lại (Flag)** qua `F5`, thay `window.confirm` ở `/teacher/settings` bằng Radix `Dialog`.
  - **Tài liệu & Đổi tên PIVORA:** Cập nhật `README.md` (11 môn học, 11 loại câu, tính năng Phase 13–16, ngưỡng Camera AI chuẩn từ `camera-rules.ts`, URL clone `https://github.com/Bluenip/PIVORA.git`) và `docs/GOOGLE_DRIVE.md`, đổi remote `origin` sang `https://github.com/Bluenip/PIVORA.git`.
- **Kết quả kiểm tra:** `pnpm db:seed` pass; `pnpm lint` 0 lỗi / 0 cảnh báo; `pnpm typecheck` 0 lỗi; `pnpm test` 21/21 files (144/144 tests) pass; `pnpm test:e2e` 19/19 tests pass; `pnpm build:check` pass.
