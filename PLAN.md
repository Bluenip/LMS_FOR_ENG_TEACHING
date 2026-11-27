# PLAN — Pivora (EngClass LMS)

> **Tài liệu thiết kế & lộ trình duy nhất của dự án.** Mọi tính năng ở mục 1 đã hoàn thành trên `main`, **không làm lại**. Bản plan cũ (Phase 1–12) còn trong lịch sử git.
>
> Mỗi Phase từ Phase 16 → Phase 32 được mô tả chi tiết theo đúng 6 phần **(A. Database & Migration → B. Pure Libs & JSON Schema → C. Services & Quyền/Bảo mật → D. API Routes → E. UI & Responsive/i18n → F. Env/Cron/Seed/Test)** để triển khai nhất quán, không nhầm lẫn.
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
- `Field`: thêm `bankItemId String?`, `topicTag String?` (tự sao chép từ `QuestionBankItem.topicTag` khi tạo từ ma trận và cho GV gắn chủ đề trên `WorksheetEditor` để phục vụ Bản đồ năng lực Phase 30).
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

## Phase 27 — Live Quiz trên lớp, Exit Ticket & Điểm cộng Sao thưởng

### A. Database & Migration (`phase27_live_quiz_behavior_points` — tương thích ngược 100%)
- **Enums mới:** `LiveQuizMode { HOST_PACED, SELF_PACED }`, `LiveQuizStatus { LOBBY, QUESTION_OPEN, QUESTION_CLOSED, FINISHED }`.
- **Bảng mới:**
  - `LiveQuizSession { id, hostId, classId?, worksheetId?, title String, pinCode String @unique, mode LiveQuizMode @default(HOST_PACED), status LiveQuizStatus @default(LOBBY), currentIndex Int @default(0), questionStartedAt DateTime?, questionLimitSec Int @default(30), isExitTicket Boolean @default(false), questionsSnapshot Json, createdAt, endedAt DateTime? }` (`@@index([hostId, createdAt])`, `@@index([classId])`).
  - `LiveQuizParticipant { id, sessionId, userId?, displayName String, joinTokenHash String, totalScore Int @default(0), correctCount Int @default(0), streak Int @default(0), joinedAt DateTime @default(now()) }` (`@@unique([sessionId, joinTokenHash])`, `@@index([sessionId, totalScore])`).
  - `LiveQuizAnswer { id, sessionId, participantId, questionIndex Int, answer Json, isCorrect Boolean, responseMs Int, pointsAwarded Int @default(0), answeredAt DateTime @default(now()) }` (`@@unique([participantId, questionIndex])`, `@@index([sessionId, questionIndex])`).
  - `ClassBehaviorPreset { id, classId, label String, delta Int, icon String?, createdAt }` (`@@index([classId])`).
  - `StudentBehaviorPoint { id, classId, studentId, sessionId?, presetId?, delta Int, reason String, awardedById String, createdAt }` (`@@index([classId, studentId])`, `@@index([sessionId])`).

### B. Pure Libs & Thuật toán (`src/lib/live-quiz/*`)
1. **`src/lib/live-quiz/scoring.ts`:**
   - `computeLiveQuizPoints({ isCorrect, responseMs, limitMs, streak })`: trả `0` nếu sai; nếu đúng trả `Math.round(500 + 500 * clamp(1 - responseMs / limitMs, 0, 1)) + Math.min(streak, 5) * 50`.
2. **`src/lib/live-quiz/pin.ts`:**
   - `generateLiveQuizPin()`: sinh mã PIN 6 chữ số (`100000..999999`), kiểm tra tránh trùng toàn bảng `LiveQuizSession` (khớp ràng buộc `@unique`).
   - `sanitizeLiveQuestionForPlayer(q)`: chỉ trả `id`, `type`, `prompt`, `options`, `imageKey`, `timeLimitSec` — **tuyệt đối không trả `answerKey`** khi trạng thái là `QUESTION_OPEN`.
3. **`src/lib/live-quiz/live-bus.ts`:**
   - Tái sử dụng adapter `src/lib/redis.ts` (Phase 26) với fallback `InMemoryLiveQuizBus` trên kênh `pivora:livequiz:${sessionId}` để phát sự kiện `LOBBY_UPDATE`, `QUESTION_START`, `ANSWER_COUNT`, `QUESTION_REVEAL`, `SESSION_END`.

### C. Services & Kiểm soát quyền
- **`liveQuizService.ts` (mới):**
  - `createLiveQuizFromWorksheet(hostId, { worksheetId, classId?, mode, questionLimitSec })`: trích các câu tự chấm (`MULTIPLE_CHOICE`, `MULTI_SELECT`, `TRUE_FALSE`, `TEXT`, `NUMBER`) đóng băng vào `questionsSnapshot` (để sửa worksheet sau đó không làm sai lệch phiên live).
  - `createExitTicketSession(hostId, { classId?, title, type: "MULTIPLE_CHOICE"|"TEXT", prompt, options?, answerKey? })`: tạo nhanh phiên 1 câu hỏi (`isExitTicket = true`) không cần tạo worksheet trước.
  - `joinLiveQuiz(pinCode, { userId?, displayName })`: áp dụng rate limit trên `POST /api/live-quiz/join` để chống dò mã PIN; nếu phiên gắn `classId`, bắt buộc user đã đăng nhập & có `Enrollment.status === "ACTIVE"` (chống người ngoài phá lớp); nếu phiên mở không gắn lớp cho phép khách nhập tên và cấp `joinToken` lưu dạng `SHA-256` hash trong `LiveQuizParticipant.joinTokenHash` (dùng xác thực khách ở `/answer` và `/stream`).
  - `advanceLiveQuiz(sessionId, hostId, action: "OPEN"|"CLOSE"|"NEXT"|"FINISH")`: chỉ `hostId`, `ADMIN`, hoặc `CO_TEACHER`/`ASSISTANT` của `classId`; cập nhật trạng thái trong transaction, phát SSE; chỉ công bố phân bố đáp án `A/B/C/D` & đáp án đúng khi chuyển sang `QUESTION_CLOSED` hoặc `FINISHED`.
  - `submitLiveQuizAnswer(sessionId, participantAuth, { questionIndex, answer })`: xác thực trạng thái `QUESTION_OPEN` và đúng `currentIndex` (hoặc bất kỳ khi `SELF_PACED`), tính `responseMs` bằng đồng hồ server (`Date.now() - questionStartedAt`), chống nộp trùng bằng `@@unique([participantId, questionIndex])`, chấm thuần qua `src/lib/grading/` và tính điểm qua `computeLiveQuizPoints`.
  - `exportLiveQuizToOfflineGrade(sessionId, hostId, { columnTitle, maxScore })`: đẩy tỉ lệ đúng của các HS có `userId` sang `OfflineGradeColumn` (Phase 21) trong 1 chạm.
- **`behaviorPointService.ts` (mới):**
  - CRUD `ClassBehaviorPreset` (tự khởi tạo 4 mẫu mặc định nếu lớp chưa có: *Phát biểu hay +2*, *Làm bài tốt +2*, *Hỗ trợ bạn +1*, *Mất trật tự -1*).
  - `awardBehaviorPoints(classId, actorId, { studentIds[], delta, reason, sessionId?, presetId? })`: hỗ trợ cộng/trừ 1 hoặc nhiều HS cùng lúc, lọc HS `ACTIVE` (`deletedAt: null`), liên kết `ClassSession` (Phase 23) nếu có.
  - `getClassBehaviorSummary(classId, { from?, to? })`; tích hợp cột điểm cộng vào `gradebookService.ts` (Phase 21) và lịch sử sao thưởng của con vào `parentService.ts`.

### D. API Routes & Validators
- `/api/live-quiz` (`GET`, `POST`), `/api/live-quiz/[id]` (`GET`), `/api/live-quiz/[id]/control` (`POST`), `/api/live-quiz/[id]/stream` (`GET` SSE), `/api/live-quiz/join` (`POST`), `/api/live-quiz/[id]/answer` (`POST`), `/api/live-quiz/[id]/export-grade` (`POST`).
- `/api/classes/[id]/behavior/presets` (`GET`, `POST`, `DELETE`), `/api/classes/[id]/behavior/points` (`GET`, `POST`, `DELETE`).
- Bổ sung nhãn & lỗi API vào `messages/vi.ts`, `messages/en.ts`, `src/lib/i18n/api-errors.ts`.

### E. Giao diện UI (VI/EN, Dark mode, Mobile 375px)
- `/teacher/live-quiz/[id]`: **Màn hình trình chiếu cho giáo viên** (font lớn đọc từ cuối lớp, mã PIN + QR code lớn ở Lobby, đồng hồ đếm ngược, đếm số HS đã trả lời live, biểu đồ cột phân bố phương án sau mỗi câu, bảng xếp hạng Top 5 và nút chuyển điểm sang Sổ điểm).
- `/live` & `/live/[pin]`: **Màn tham gia của học sinh** tối ưu cảm ứng 375px (4 nút đáp án lớn ≥ 56px, phản hồi Đúng/Sai, streak và thứ hạng tức thì).
- Nút **"Mở Live Quiz"** trên thẻ Worksheet & nút **"Hỏi nhanh (Exit Ticket)"** trên `ClassDetailView.tsx`.
- Khối/Tab **"Sao thưởng & Điểm cộng"** trong `ClassDetailView.tsx` và tích hợp thao tác cộng/trừ nhanh ngay trong màn điểm danh buổi học `ClassSession`.

### F. Seed & Kiểm thử
- `prisma/seed.ts`: thêm 4 `ClassBehaviorPreset`, 6 `StudentBehaviorPoint` mẫu cho lớp 12A1 và 1 `LiveQuizSession` đã hoàn thành mẫu.
- Tests: unit (`computeLiveQuizPoints`, `sanitizeLiveQuestionForPlayer`, `generateLiveQuizPin`), integration (tuyệt đối không lộ `answerKey` khi `QUESTION_OPEN`, chặn người ngoài lớp join phiên gắn `classId`, chặn nộp trùng câu, IDOR điểm thưởng), E2E (GV tạo Live Quiz → HS tham gia trên 375px → trả lời → hiện biểu đồ cột & BXH; cộng sao thưởng và kiểm tra ở Cổng Phụ huynh).

---

## Phase 28 — Quét & Chấm Phiếu Tô Trắc Nghiệm Giấy bằng Camera (OMR)

### A. Database & Migration (`phase28_omr_paper_scanner` — tương thích ngược 100%)
- **Enum mới:** `OmrSheetTemplate { MC_20, MC_40, MC_50, THPT_2025 }`.
- **Bảng mới:**
  - `OmrExamSheet { id, ownerId, classId, assignmentId?, title String, template OmrSheetTemplate, answerKeyByVariant Json, pointsConfig Json, offlineColumnId?, createdAt, updatedAt }` (`@@index([classId, createdAt])`).
  - `OmrScanResult { id, sheetId, studentId?, detectedSbd String?, variantCode String?, scanImageKey String, rawBubbles Json, resolvedAnswers Json, score Float, maxScore Float, confidence Float, needsReview Boolean @default(false), confirmedById?, confirmedAt DateTime?, createdAt }` (`@@index([sheetId, createdAt])`, `@@index([studentId])`).

### B. Pure Libs & Thuật toán (`src/lib/omr/*` — 100% client-side Canvas + pure TS, không cần GPU server)
1. **`src/lib/omr/templates.ts`:** định nghĩa toạ độ chuẩn hoá `(0..1)` bên trong khung 4 ô vuông định vị góc (fiducial square markers) cho 4 mẫu phiếu (`MC_20`, `MC_40`, `MC_50`, và `THPT_2025` gồm 12 câu TN 4 chọn + 4 câu Đúng/Sai 4 ý + 6 câu trả lời ngắn tô số), kèm khu vực ô tô SBD (6 chữ số) và Mã đề (3 chữ số khớp `ExamVariant.code` Phase 22).
2. **`src/lib/omr/pdf-sheet-generator.ts`:** dùng `pdf-lib` + `@pdf-lib/fontkit` + `public/fonts/NotoSans-*.ttf` xuất file PDF phiếu tô A4 sắc nét có 4 fiducial markers góc, vùng SBD/Mã đề và tuỳ chọn in sẵn họ tên + SBD từng học sinh trong lớp.
3. **`src/lib/omr/perspective-warp.ts`:** nhận dữ liệu ảnh chuẩn `{ width, height, data: Uint8ClampedArray }` (chạy thuần được cả trên Node/Vitest lẫn Browser Canvas), chuyển grayscale, adaptive threshold tìm 4 fiducial markers ở 4 góc ảnh, giải ma trận homography 3×3 (`solveHomography8pt`) và nắn phẳng ảnh nghiêng về kích thước chuẩn `1000×1414`.
4. **`src/lib/omr/bubble-reader.ts`:** nhận ảnh `{ width, height, data: Uint8ClampedArray }`, tính tỉ lệ pixel tối trung bình bên trong từng ô tròn theo mẫu `templates.ts`; ngưỡng thích nghi cục bộ theo từng hàng (`fillRatio >= 0.42` và vượt ô tối thứ 2 ≥ `0.15` → chắc chắn; tô mờ `0.28..0.42` hoặc tô ≥ 2 ô gần nhau → gắn cờ `needsReview = true`).
5. **`src/lib/omr/grader.ts`:** đối chiếu `resolvedAnswers` với `answerKeyByVariant[variantCode]` (tái sử dụng chấm luỹ tiến chuẩn THPT 2025 cho phần Đúng/Sai 4 ý), trả `{ score, maxScore, perQuestion }`.

### C. Services & Kiểm soát quyền
- **`omrService.ts` (mới):**
  - `createOmrExamSheet`: tạo bài chấm OMR từ `Worksheet`/`Assignment` có sẵn (tự đọc đáp án theo từng `ExamVariant` Phase 22 nếu có) hoặc nhập bảng đáp án thủ công.
  - `generateOmrPdf(sheetId, actorId, { prefillStudents?: boolean })`: xuất PDF phiếu tô cho GV (`requireTeacherOfClass`, `ASSISTANT` trở lên).
  - `saveOmrScanResult(sheetId, actorId, { scanImageBuffer, mimeType, detectedSbd, variantCode, rawBubbles, resolvedAnswers })`: kiểm tra magic bytes JPG/PNG ≤ 8MB, lưu ảnh gốc tại `omr/${sheetId}/${uuid}.jpg` (dùng `DriveFileKind.SUBMISSION_FILE` hoặc bổ sung `OMR_SCAN`), tự ghép `studentId` theo SBD/danh sách lớp, **tính điểm lại trên server** bằng `omr/grader.ts` (không tin điểm gửi từ client).
  - `confirmAndSyncOmrToGradebook(sheetId, actorId)`: tạo hoặc cập nhật `OfflineGradeColumn` + `OfflineGradeEntry` (Phase 21) cho toàn bộ phiếu đã xác nhận và gửi thông báo điểm kèm ảnh phiếu chấm cho phụ huynh.
- Cập nhật `authorizeFileDownload` cho prefix `omr/${sheetId}/*` (GV lớp, Admin, học sinh sở hữu phiếu, và phụ huynh đã `verifiedAt != null` của học sinh đó).

### D. API Routes & Validators
- `/api/omr/sheets` (`GET`, `POST`), `/api/omr/sheets/[id]` (`GET`, `PATCH`, `DELETE`), `/api/omr/sheets/[id]/pdf` (`GET`), `/api/omr/sheets/[id]/scans` (`GET`, `POST`), `/api/omr/scans/[scanId]` (`PATCH` sửa câu tô mờ / đổi HS, `DELETE`), `/api/omr/sheets/[id]/sync-gradebook` (`POST`).

### E. Giao diện UI (VI/EN, Dark mode, ưu tiên Mobile 375px camera sau)
- `/teacher/classes/[id]/omr` & `/teacher/omr/[sheetId]/scan`:
  - Trình quét mở camera sau (`facingMode: "environment"`) có khung căn 4 góc tự động bắt phiếu + nút chọn ảnh từ thư viện (hữu ích trên máy tính và E2E test).
  - Màn duyệt kết quả vẽ vòng tròn xanh (đúng) / đỏ (sai) / vàng (tô mờ cần duyệt) đè lên ảnh phiếu đã nắn phẳng; chạm từng câu để chỉnh tay trong 1 chạm.
  - Bảng tổng hợp các phiếu đã quét, tỉ lệ đúng từng câu và nút **"Đẩy điểm vào Sổ điểm lớp"**.
- Cổng Học sinh & Phụ huynh: cho xem lại ảnh phiếu tô giấy đã khoanh xanh/đỏ ngay tại mục điểm kiểm tra giấy.

### F. Seed & Kiểm thử
- `prisma/seed.ts`: thêm 1 `OmrExamSheet` mẫu `MC_20` cho lớp 12A1 + 2 `OmrScanResult` mẫu (ảnh PNG sinh thuần qua `zlib.deflateSync`).
- Tests: unit (`solveHomography8pt`, `bubble-reader` trên ảnh synthetic tô rõ/tô mờ/tô 2 ô, `grader` cả `THPT_2025`, `pdf-sheet-generator` trả `%PDF`), integration (server chấm lại chống sửa điểm client, IDOR ảnh `omr/*`, đồng bộ sang `OfflineGradeColumn`), E2E (tạo bài OMR → tải ảnh phiếu synthetic → sửa 1 câu cờ vàng → đẩy sang Sổ điểm & kiểm tra 375px).

---

## Phase 29 — AI Chấm Bài Nâng Cao, OCR Ảnh Đề Thi & Chống Đạo Văn

### A. Database & Migration (`phase29_ai_ocr_grading_plagiarism` — tương thích ngược 100%)
- **Bảng mới:**
  - `AiGradingSuggestion { id, submissionId, fieldId, suggestedScore Float, suggestedRubricScores Json?, suggestedComment String, model String, appliedAt DateTime?, createdById String, createdAt }` (`@@unique([submissionId, fieldId])`).
  - `SimilarityReport { id, assignmentId, fieldId, submissionAId String, submissionBId String, similarity Float, matchedSpans Json, status String @default("OPEN"), reviewedById?, reviewedAt DateTime?, createdAt }` (`@@unique([assignmentId, fieldId, submissionAId, submissionBId])`, `@@index([assignmentId, similarity])`).

### B. Pure Libs & Thuật toán
1. **`src/lib/plagiarism/winnowing.ts` (100% nội bộ, không gọi API ngoài):**
   - `normalizeEssayText(text)`: chuẩn hoá chữ thường tiếng Việt/Anh, loại dấu câu thừa, giữ từ có dấu và map ngược chỉ số ký tự gốc.
   - `normalizeCodeTokens(code, language)`: loại comment, chuẩn hoá chuỗi/tên biến/khoảng trắng cho JS/Python/C++/Pascal để phát hiện chép code đổi tên biến.
   - Thuật toán **Winnowing** (k-gram `k = 5` từ cho `ESSAY`, `k = 7` token cho `CODE`; cửa sổ `w = 4`) chọn fingerprints, tính hệ số Jaccard & Containment và xuất `matchedSpans: Array<{ startA, endA, startB, endB }>` để tô màu đối chiếu song song.
2. **`src/lib/ai/ocr-prompt.ts`:**
   - Xây dựng prompt Gemini Vision nhận 1–5 ảnh chụp tờ đề giấy / trang PDF scan, yêu cầu trả JSON thuần (`responseMimeType: "application/json"`) khớp Zod schema của `Field` (`MULTIPLE_CHOICE`, `TRUE_FALSE_GROUP`, `TEXT`, `ESSAY`) kèm chuẩn hoá công thức Toán/Lý/Hoá thành `$...$` / `$$...$$`.
3. **`src/lib/ai/rubric-grade-prompt.ts`:**
   - Đóng gói ngữ cảnh chấm bài **đã ẩn danh 100% PII** (chỉ gửi đề câu hỏi, đáp án mẫu, `rubric`, và văn bản/ảnh bài làm — **tuyệt đối không gửi tên, email, mã HS, tên lớp**).
   - Parse kết quả `{ rubricScores, score, comment }` và kẹp điểm qua `computeRubricTotal` (Phase 16).

### C. Services & Kiểm soát quyền
- **`aiOcrService.ts` (mới):** `extractQuestionsFromImages(teacherId, files[])` — kiểm tra `GEMINI_API_KEY`, validate magic bytes JPG/PNG/WebP ≤ 6MB/ảnh (tối đa 5 ảnh), trừ hạn mức ngày trên `AiUsageLog` (Phase 25, `AI_DAILY_LIMIT_PER_TEACHER`), gọi Gemini Vision timeout 45s, trả câu hỏi nháp để GV sửa trước khi lưu.
- **`aiGradingService.ts` (mới):** `suggestManualGrade(submissionId, fieldId, teacherId)` — hỗ trợ `ESSAY`, `PHOTO_UPLOAD`, `CODE`; kiểm tra quyền GV lớp (`ASSISTANT` trở lên) và hạn mức `AiUsageLog`; lưu vào `AiGradingSuggestion` (**không tự ghi đè `Answer.score` hay `Answer.teacherNote`** — GV bấm "Áp dụng" mới gọi `saveSingleFieldGrade` và ghi `appliedAt`).
- **`similarityService.ts` (mới):** `runAssignmentSimilarityCheck(assignmentId, actorId, { fieldId?, minThreshold = 0.35 })` — so sánh chéo mọi cặp bài `SUBMITTED`/`GRADED` của 2 học sinh khác nhau (`studentA !== studentB`), bỏ qua bài quá ngắn (< 25 từ hoặc < 40 ký tự code), upsert `SimilarityReport`, cho GV cập nhật trạng thái `DISMISSED` hoặc `CONFIRMED`.

### D. API Routes & Validators
- `POST /api/ai/ocr-worksheet` (`requireRole(["TEACHER", "ADMIN"])`)
- `POST /api/submissions/[id]/ai-suggest-grade` (`requireSubmissionAccess` + `isTeacher`)
- `POST /api/assignments/[id]/similarity/scan`, `GET /api/assignments/[id]/similarity`, `PATCH /api/assignments/[id]/similarity/[reportId]` (`requireTeacherOfAssignment`)

### E. Giao diện UI (VI/EN, Dark mode, Mobile 375px)
- `/teacher/worksheets` & `WorksheetEditor.tsx`: nút **"Quét ảnh đề giấy (AI OCR)"** (tải 1–5 ảnh chụp đề hoặc chuyển trang PDF scan → xem trước câu hỏi + công thức KaTeX đã trích xuất → chỉnh sửa → bấm Thêm vào đề).
- `grading/page.tsx` & `GradeByQuestionPanel.tsx`:
  - Nút **"AI gợi ý chấm"** cạnh Rubric/nhận xét → hiện hộp gợi ý điểm từng tiêu chí + nhận xét nháp kèm nút **"Áp dụng vào form"** / **"Bỏ qua"** và nhãn rõ *Gợi ý từ AI — giáo viên cần kiểm duyệt*.
  - Tab **"Kiểm tra tương đồng"** trên trang chấm bài: nút Quét, danh sách cặp bài giống cao xếp giảm dần, bấm mở Dialog so sánh 2 cột (tô màu vàng các đoạn trùng khớp), nút xác nhận/bỏ qua.

### F. Seed & Kiểm thử
- `prisma/seed.ts`: thêm 1 `SimilarityReport` mẫu giữa 2 bài tự luận demo để kiểm tra màn đối chiếu.
- Tests: unit (`winnowing.ts` cho văn bản tiếng Việt, sao chép 1 phần, đổi tên biến code; `ocr-prompt` & `rubric-grade-prompt` kiểm tra zero-PII), integration (mock `fetch` Gemini Vision OCR & suggest grade + quota `AiUsageLog`, xác nhận `ai-suggest-grade` không tự sửa `Answer.score`, IDOR similarity report), E2E (OCR mock → thêm câu vào đề; AI gợi ý chấm → áp dụng điểm; quét tương đồng & xem đối chiếu 2 cột).

---

## Phase 30 — Bản Đồ Năng Lực (Mastery), Cảnh Báo Sớm & Phân Tích Khảo Thí

### A. Database & Migration (`phase30_mastery_analytics_psychometrics` — tương thích ngược 100%)
- `Class`: thêm `atRiskScoreThreshold Float @default(5.0)` và `atRiskMissingCount Int @default(2)`.
- **Bảng mới:**
  - `RemedialPlanLog { id, classId, createdById, topicTags Json, targetStudentIds Json, assignmentId String, createdAt }` (`@@index([classId, createdAt])`).
- Không xoá/đổi cột cũ; số liệu Mastery và Item Analysis tổng hợp trực tiếp từ `Answer`, `Submission`, `Field.topicTag`/`skillTag`, `AttendanceRecord` (tối ưu truy vấn + cache ngắn 60s).

### B. Pure Libs & Thuật toán (`src/lib/analytics/*`)
1. **`src/lib/analytics/mastery.ts`:**
   - `computeMasteryMatrix(students, taggedAnswers)`: nhóm theo `(studentId, topicTag || skillTag)`, tính `accuracy = earnedPoints / maxPoints`, `attemptsCount`, gắn mức `MASTERED` (`>= 0.80`), `DEVELOPING` (`0.50..0.79`), `NEEDS_WORK` (`< 0.50`), `NO_DATA` (0 câu).
2. **`src/lib/analytics/at-risk.ts`:**
   - `detectAtRiskStudents(studentStats, config)` kiểm tra 3 tín hiệu rủi ro:
     1. Điểm TB 3 bài gần nhất < `atRiskScoreThreshold` hoặc tụt liên tục ≥ 1.5 điểm.
     2. Chưa nộp ≥ `atRiskMissingCount` bài quá hạn trong 30 ngày.
     3. Vắng không phép (`ABSENT`) ≥ 2 buổi trong 30 ngày (khi có dữ liệu Phase 23).
   - Xếp mức `HIGH` (≥ 2 tín hiệu) / `MEDIUM` (1 tín hiệu) kèm lý do VI/EN rõ ràng.
3. **`src/lib/analytics/item-analysis.ts`:**
   - **Độ khó (`pValue`):** `mean(score_i / maxPoints_i)` trên toàn bộ bài nộp (`> 0.85` quá dễ, `< 0.25` quá khó).
   - **Độ phân biệt (`discriminationIndex`):** tách 27% nhóm điểm cao nhất (`U`) và 27% thấp nhất (`L`) (khi có ≥ 6 bài nộp), tính `D = p_U - p_L` (`-1..+1`) kết hợp hệ số **Point-Biserial (`r_pb`)** giữa điểm câu và tổng điểm phần còn lại.
   - **Phân tích phương án nhiễu (Distractor Analysis):** tỉ lệ chọn A/B/C/D ở nhóm cao vs nhóm thấp; gắn cờ **`CHECK_KEY`** khi `D < 0` (nhóm điểm thấp làm đúng nhiều hơn nhóm điểm cao — dấu hiệu sai đáp án cài đặt).

### C. Services & Kiểm soát quyền
- **`masteryAnalyticsService.ts` (mới):**
  - `getClassMasteryMatrix(classId, { from?, to?, subject? })` (`requireTeacherOfClass`, `ASSISTANT` trở lên).
  - `getStudentMasteryProfile(studentId, viewer)` (HS tự xem bản đồ của mình, PH chỉ xem của con đã liên kết, GV xem HS trong lớp mình — chống IDOR).
  - `getClassAtRiskStudents(classId)` & `getTeacherAtRiskSummary(teacherId)` (hiển thị tổng hợp trên `/teacher`).
  - `createRemedialAssignmentFromWeakTopics(classId, actorId, { topicTags[], studentIds[], questionCount, dueAt? })`: tự bốc câu từ `QuestionBankItem` (Phase 22) theo các `topicTags` yếu → tạo Worksheet `[Ôn bù] ...` → tạo `Assignment` gắn `AssignmentTarget` (Phase 16) cho đúng `studentIds` → ghi `RemedialPlanLog`.
- **`reportService.ts`:** bổ sung `getAssignmentItemAnalysis(assignmentId)` gọi `item-analysis.ts`, trả `pValue`, `discriminationIndex`, `pointBiserial`, phân bố phương án nhiễu và cờ `GOOD` / `TOO_EASY` / `TOO_HARD` / `CHECK_KEY`.

### D. API Routes & Validators
- `GET /api/classes/[id]/mastery` & `POST /api/classes/[id]/remedial` (`requireTeacherOfClass`)
- `GET /api/classes/[id]/at-risk` & `GET /api/teacher/at-risk`
- `GET /api/student/mastery` & `GET /api/parent/children/[studentId]/mastery`
- `GET /api/assignments/[id]/item-analysis` (`requireTeacherOfAssignment`)

### E. Giao diện UI (VI/EN, Dark mode, Mobile 375px)
- Tab **"Thống kê"** trong `ClassDetailView.tsx`: thêm sub-tab **"Bản đồ năng lực"** (heatmap Xanh/Vàng/Đỏ cuộn ngang có cột tên HS cố định trái, chọn chủ đề Đỏ → bấm **"Tạo bài ôn bù cho nhóm này"**) và card **"Học sinh cần quan tâm (At-Risk)"** (xuất hiện cả ở đầu dashboard `/teacher`).
- Trang `/teacher/assignments/[id]/grading`: thêm bảng **Phân tích câu hỏi (Item Analysis)** hiển thị Độ khó, Độ phân biệt, cảnh báo đỏ *"Kiểm tra lại đáp án"* khi `D < 0` và biểu đồ phương án nhiễu.
- Dashboard Học sinh (`/student`) & Cổng Phụ huynh (`/parent`): thêm card **"Điểm mạnh & Chủ đề cần ôn"**.

### F. Seed & Kiểm thử
- `prisma/seed.ts`: gán `topicTag` đồng bộ cho các câu hỏi đã chấm của lớp 12A1 để heatmap có đủ 3 mức Xanh/Vàng/Đỏ và ít nhất 1 HS ở trạng thái `At-Risk`.
- Tests: unit (`mastery.ts`, `at-risk.ts`, `item-analysis.ts` gồm case `D < 0` bật `CHECK_KEY`), integration (IDOR mastery HS/PH/GV, tạo bài ôn bù đúng `AssignmentTarget` + `RemedialPlanLog`), E2E (xem heatmap → tạo bài ôn bù 1 chạm → xác minh chỉ HS nhóm yếu thấy bài; xem bảng Item Analysis).

---

## Phase 31 — Công Cụ Làm Bài Nội Bộ, Video Tương Tác, Bài Tập Nhóm & Q&A Câu Hỏi

### A. Database & Migration (`phase31_exam_tools_video_groups_qa` — tương thích ngược 100%)
- `Assignment`: thêm `allowedTools Json?` (`{ calculator?: boolean, scratchpad?: boolean, periodicTable?: boolean, formulaSheet?: boolean, highlighter?: boolean, tts?: boolean }`), `isGroupAssignment Boolean @default(false)`, `peerReviewEnabled Boolean @default(false)`, `peerReviewsPerStudent Int @default(1)`.
- **Video tương tác (kiểu Edpuzzle):**
  - `LessonVideoCheckpoint { id, lessonItemId, timestampSec Int, type FieldType, prompt String, options Json?, answerKey Json?, order Int @default(0), createdAt }` (`@@index([lessonItemId, timestampSec])`).
  - `LessonVideoProgress { id, lessonItemId, studentId, maxWatchedSec Int @default(0), durationSec Int @default(0), checkpointAnswers Json?, completed Boolean @default(false), updatedAt }` (`@@unique([lessonItemId, studentId])`).
- **Bài tập nhóm:**
  - `ClassGroup { id, classId, name String, createdAt }` (`@@index([classId])`).
  - `ClassGroupMember { groupId, studentId, isLeader Boolean @default(false) }` (`@@id([groupId, studentId])`, `@@index([studentId])`).
  - `Submission`: thêm `groupId String?`, `memberScoreOverrides Json?` (`Record<studentId, number>` nếu GV điều chỉnh điểm riêng từng thành viên).
- **Chấm chéo ẩn danh (Peer Review):**
  - `PeerReviewAssignment { id, assignmentId, submissionId, reviewerId, rubricScores Json?, comment String?, submittedAt DateTime?, createdAt }` (`@@unique([submissionId, reviewerId])`, `@@index([assignmentId, reviewerId])`).
- **Hỏi đáp gắn từng câu (Question Q&A):**
  - `QuestionDoubt { id, assignmentId, fieldId, studentId, question String, teacherReply String?, repliedById?, repliedAt DateTime?, isPublicToClass Boolean @default(true), createdAt }` (`@@index([assignmentId, fieldId])`).

### B. Pure Libs & Thuật toán
1. **`src/lib/exam-tools/calculator.ts`:** bộ tính biểu thức khoa học viết thuần bằng thuật toán Shunting-Yard (`+ - * / ^ ( )`, `sin/cos/tan/log/ln/sqrt/pi/e`, độ/radian) — **tuyệt đối không dùng `eval` hay `new Function`**.
2. **`src/lib/exam-tools/periodic-table.ts`:** dữ liệu tĩnh 118 nguyên tố (ký hiệu, số hiệu, nguyên tử khối, nhóm, chu kỳ, tên VI/EN) dùng tra cứu nhanh không cần mạng.
3. **`src/lib/peer-review/matcher.ts`:** hàm thuần `assignPeerReviewers(submissions, reviewsPerStudent)` ghép hoán vị không điểm cố định (derangement) bảo đảm không HS nào tự chấm bài mình và mỗi bài nhận đều số lượt góp ý.

### C. Services & Kiểm soát quyền
- **`videoLessonService.ts` (mới):** CRUD `LessonVideoCheckpoint` (chỉ chủ sở hữu bài giảng / Admin); `getLessonVideoForStudent` (**không trả `answerKey`** của checkpoint chưa làm); `submitCheckpointAnswer` (chấm thuần & lưu vào `LessonVideoProgress`); `reportVideoHeartbeat` (cập nhật `maxWatchedSec` phục vụ chặn tua nhanh lần xem đầu).
- **`classGroupService.ts` (mới):** CRUD nhóm & chia nhóm ngẫu nhiên theo sĩ số; khi `assignment.isGroupAssignment === true`, `startOrResumeSubmission` dùng chung 1 `Submission` theo `groupId` (các thành viên cùng làm/xem, 1 đại diện nộp bài); đồng thời cập nhật kiểm tra quyền ở `requireSubmissionAccess`, `autosaveSubmissionAnswers`, `submitByStudent`, `getStudentAssignmentPayload` và `authorizeFileDownload` cho phép mọi thành viên `ClassGroupMember` thuộc `submission.groupId` truy cập (chặn người ngoài nhóm); `reportService.ts` và `gradebookService.ts` phân bổ điểm tới từng thành viên (ưu tiên `memberScoreOverrides[studentId]` nếu có).
- **`peerReviewService.ts` (mới):** `generatePeerReviewPairs(assignmentId, actorId)` (chạy sau khi đóng nộp hoặc khi GV kích hoạt); `getMyPeerReviews(assignmentId, studentId)` trả bài làm **ẩn danh tuyệt đối** (xoá sạch `student.name`, `student.email`, `studentId` ở server); `submitPeerReview(peerReviewId, reviewerId, { rubricScores, comment })`.
- **`questionDoubtService.ts` (mới):** HS chỉ được tạo `QuestionDoubt` cho bài đã nộp và `canRevealResult === true` (không hỏi trong lúc đang thi); GV trả lời 1 lần và chọn `isPublicToClass` để cả lớp cùng đọc giải thích chung ngay dưới câu hỏi đó.

### D. API Routes & Validators
- `/api/lessons/items/[itemId]/checkpoints` (`GET`, `POST`, `DELETE`) & `/api/lessons/items/[itemId]/video-progress` (`GET`, `POST`).
- `/api/classes/[id]/groups` (`GET`, `POST`, `PATCH`, `DELETE`, `POST .../auto-assign`).
- `/api/assignments/[id]/peer-reviews/assign` (`POST`), `/api/assignments/[id]/peer-reviews` (`GET`), `/api/peer-reviews/[id]` (`PUT`).
- `/api/assignments/[id]/doubts` (`GET`, `POST`), `/api/doubts/[id]/reply` (`PATCH`).
- Cập nhật `createAssignmentSchema`/`updateAssignmentSchema` thêm `allowedTools`, `isGroupAssignment`, `peerReviewEnabled`, `peerReviewsPerStudent`.

### E. Giao diện UI (VI/EN, Dark mode, Mobile 375px)
- **`src/components/worksheet/ExamToolsDrawer.tsx`** tích hợp ngay trong `/student/assignments/[id]/do`: chỉ hiển thị công cụ GV bật (`Máy tính khoa học`, `Bảng nháp vẽ tay`, `Bảng tuần hoàn`, `Bảng công thức`, `Bút dạ quang highlight trên PassageCard`, nút `Đọc đề TTS` & chỉnh cỡ chữ) mở dạng drawer nổi ngay trong trang để HS không phải chuyển tab gây dính chống gian lận.
- **`InteractiveVideoPlayer.tsx`:** tự dừng video tại `timestampSec`, mở câu hỏi checkpoint, chặn kéo tua vượt `maxWatchedSec`, hiển thị `% đã xem` cho GV.
- Quản lý nhóm trong `ClassDetailView.tsx` + màn **Chấm chéo ẩn danh** trên trang kết quả bài tập của HS + hàng đợi **Hỏi đáp câu hỏi (`DoubtQueue`)** trên trang chấm bài của GV và khung hỏi đáp dưới từng câu sai của HS.

### F. Seed & Kiểm thử
- `prisma/seed.ts`: bật `allowedTools` (máy tính + bảng nháp + highlighter) cho 1 bài mẫu; tạo 2 `ClassGroup` trong lớp 12A1; thêm 2 `LessonVideoCheckpoint` và 1 `QuestionDoubt` đã có phản hồi của GV.
- Tests: unit (`calculator.ts` biểu thức khoa học & chống input độc hại, `matcher.ts` derangement), integration (peer review ẩn danh tuyệt đối không lộ tên/email, bài tập nhóm đồng bộ điểm + override, checkpoint không lộ `answerKey`, Q&A chặn gửi trước khi nộp bài), E2E (dùng máy tính & highlight ngữ liệu trong `/do`, trả lời checkpoint video, gửi & trả lời QuestionDoubt).

---

## Phase 32 — Vận Hành Phòng Thi Trực Tiếp, Học Kỳ, Đơn Xin Nghỉ, Đồng Bộ Lịch & Chuẩn Quốc Tế

### A. Database & Migration (`phase32_exam_ops_terms_interop` — tương thích ngược 100%)
- **Enum mới:** `LeaveRequestStatus { PENDING, APPROVED, REJECTED }`.
- **Bảng mới:**
  - `AcademicTerm { id, name String, startsAt DateTime, endsAt DateTime, isLocked Boolean @default(false), isActive Boolean @default(true), createdAt, updatedAt }` (`@@index([isActive, startsAt])`).
  - `LeaveRequest { id, classId, sessionId, studentId, parentId, reason String, status LeaveRequestStatus @default(PENDING), reviewedById?, reviewNote String?, reviewedAt DateTime?, createdAt }` (`@@unique([sessionId, studentId])`, `@@index([classId, status])`).
  - `CalendarFeedToken { id, userId String @unique, tokenHash String @unique, createdAt, rotatedAt DateTime @default(now()) }`.
  - `SystemPreCheckLog { id, userId, assignmentId?, browserInfo String, pingMs Int?, cameraOk Boolean, micOk Boolean, batteryPct Int?, passed Boolean, checkedAt DateTime @default(now()) }` (`@@index([assignmentId, userId])`).
  - `SystemBanner { id, message String, level String @default("INFO"), maintenanceMode Boolean @default(false), startsAt DateTime?, endsAt DateTime?, active Boolean @default(false), updatedById?, updatedAt }`.
- `Class`: thêm `termId String?`, `gradebookLockedAt DateTime?`, `gradebookLockedById String?`.

### B. Pure Libs & Thuật toán
1. **`src/lib/calendar/ics-generator.ts`:** sinh chuẩn **RFC 5545 iCalendar (`.ics`)** (escape ký tự đặc biệt, gập dòng 75 octet, `DTSTART`/`DTEND`/`UID`/`SUMMARY` theo UTC) từ danh sách `ClassSession` và hạn nộp `Assignment`.
2. **`src/lib/import/standard-exam-parsers.ts`:**
   - `parseAikenText(text)`: chuẩn Aiken (`QUESTION`, `A. ...`, `ANSWER: B`) → mảng `Field` `MULTIPLE_CHOICE`.
   - `parseMoodleXml(xml)`: parse bằng XML parser an toàn tắt hoàn toàn entity expansion (`processEntities: false`, **tuyệt đối không bật XXE / Billion Laughs**) hỗ trợ `multichoice`, `truefalse`, `shortanswer`, `essay` → mảng `Field` / `QuestionBankItem`.
   - `parseQuizizzCsv(csv)` & `parseAnkiCsv(csv)` / `exportAnkiCsv(cards)`: nhập trắc nghiệm từ CSV và nhập/xuất Flashcard định dạng Anki TSV/CSV.

### C. Services & Kiểm soát quyền
- **`liveRescueService.ts` (mới):** sử dụng `proctor-bus.ts` (Phase 26) cho 3 tác vụ cứu hộ trực tiếp từ màn Giám sát Live (mọi hành động ghi `AuditLog`):
  1. `sendDirectExamMessage(assignmentId, studentId, message, actorId)`: phát event `TEACHER_MESSAGE` qua SSE hiện popup tức thì trên `/do` của đúng HS đó.
  2. `grantEmergencyExtraTime(assignmentId, studentId, extraMin, actorId)`: cộng ngay `extraMin` (`1..60` phút) vào `AssignmentOverride.timeLimitMin` và phát `TIME_EXTENDED` cập nhật đồng hồ trên màn hình HS không cần tải lại trang.
  3. `unlockForDeviceSwitch(submissionId, actorId)`: gỡ khoá trên `Submission` bằng cách đặt `lockedAt = null`, cấp mới/xoá `attemptToken` (vì enum `SubmissionStatus` giữ `IN_PROGRESS | SUBMITTED | GRADED`, trạng thái khoá dùng `lockedAt` và chống đa thiết bị dùng `attemptToken`), phát SSE `SUBMISSION_UNLOCKED` kèm ghi chú đổi thiết bị.
- **`preCheckService.ts` (mới):** lưu `SystemPreCheckLog` và tổng hợp danh sách sẵn sàng thiết bị cho GV trước giờ thi.
- **`leaveRequestService.ts` (mới):** phụ huynh có `ParentLink.verifiedAt != null` gửi đơn xin nghỉ cho `ClassSession` sắp tới của con; khi GV bấm `APPROVE`, trong cùng 1 transaction tự động upsert `AttendanceRecord { status: "EXCUSED", note: reason }` (Phase 23) và gửi thông báo xác nhận cho phụ huynh.
- **`calendarFeedService.ts` (mới):** sinh/thu hồi token bí mật (lưu `SHA-256` hash trong `CalendarFeedToken`, chỉ trả raw token 1 lần), xuất file `.ics` đúng phạm vi lịch của `TEACHER` / `STUDENT` / `PARENT` (từ chối user bị khoá hoặc nằm trong thùng rác).
- **`termService.ts` (mới):** CRUD `AcademicTerm` (Admin), gán lớp vào học kỳ, khoá/mở khoá sổ điểm (`gradebookLockedAt` — khi đã khoá, `offlineGradeService` & `saveTeacherManualGrading` từ chối sửa điểm trừ khi Admin mở khoá), xuất gói **Hồ sơ tổng kết cuối kỳ (ZIP gồm Sổ điểm Excel + Phiếu báo điểm PDF từng HS)**.
- **`standardImportService.ts` (mới):** nhập hàng loạt từ Aiken / Moodle XML / Quizizz CSV vào Worksheet hoặc `QuestionBankItem`; nhập/xuất Anki CSV vào `FlashcardDeck`.
- **`adminSystemOpsService.ts` (mới):** thu thập chỉ số hệ thống cho Admin (`fs.statfs` dung lượng đĩa, kích thước DB từ `pg_database_size`, dung lượng bảng, thời điểm backup gần nhất) và quản lý `SystemBanner` / chế độ bảo trì (vì `src/middleware.ts` chạy Edge Runtime không gọi Prisma, kiểm tra `maintenanceMode` qua cache 5 giây trong Node.js tại `requireLayoutUser()` và guard API `requireAuth`/`requireRole` trả `503 MAINTENANCE_MODE`, luôn cho qua `ADMIN`, `/login`, `/api/health`, `/api/system/banner`, `/api/auth/*`).

### D. API Routes & Validators
- `POST /api/assignments/[id]/live/rescue` (`requireTeacherOfAssignment`, actions: `MESSAGE` | `EXTEND_TIME` | `UNLOCK_DEVICE`).
- `POST /api/precheck` (`requireAuth`) & `GET /api/assignments/[id]/precheck` (`requireTeacherOfAssignment`).
- `/api/leave-requests` (`GET`, `POST` phụ huynh), `PATCH /api/leave-requests/[id]` (`requireTeacherOfClass`).
- `GET/POST/DELETE /api/account/calendar-token` (`requireAuth`) & `GET /api/calendar/feed?token=...`.
- `/api/admin/terms` (`GET`, `POST`, `PATCH`), `POST /api/classes/[id]/gradebook/lock`, `GET /api/classes/[id]/gradebook/archive-zip`.
- `POST /api/import/standard` (`Aiken` / `MoodleXML` / `QuizizzCSV`) & `POST/GET /api/flashcards/[deckId]/anki-csv`.
- `GET /api/admin/system-health` & `GET/PUT /api/admin/banner` (`requireRole(["ADMIN"])`), `GET /api/system/banner`.

### E. Giao diện UI (VI/EN, Dark mode, Mobile 375px)
- Màn Giám sát Live (`/teacher/assignments/[id]/live` & `/teacher/exams/[id]/live`): thêm menu cứu hộ trên từng dòng HS (*Nhắn riêng*, *+5/+10 phút*, *Mở khoá đổi máy*); trang `/do` lắng nghe SSE hiển thị thông báo GV & cộng đồng hồ tức thì.
- Trang `/student/precheck` (và nút truy cập nhanh ngay ở `/rules`): tự đo ping mạng, kiểm tra camera, micro, trình duyệt, pin và lưu kết quả; GV xem cột trạng thái thiết bị trước giờ thi.
- Cổng Phụ huynh (`/parent`): nút **"Gửi đơn xin nghỉ"** cho buổi học sắp tới; trong `ClassDetailView.tsx` (tab Lịch & Điểm danh): danh sách đơn xin nghỉ duyệt 1 chạm.
- Trang `/account` & `/teacher/schedule` / `/student/schedule`: hộp **"Đồng bộ lịch Google / Apple Calendar (.ics)"** kèm nút sao chép URL và tạo lại token.
- `/admin/terms` & `/admin/system`: quản lý Học kỳ, xem bảng giám sát tài nguyên/DB/dung lượng đĩa, bật/tắt banner thông báo & chế độ bảo trì; nút **Khoá sổ điểm** & **Tải gói tổng kết ZIP** trong tab Sổ điểm; thêm tab nhập **Aiken / Moodle XML / Quizizz CSV** và **Anki CSV** trong kho đề & flashcard.

### F. Seed & Kiểm thử
- `prisma/seed.ts`: tạo 1 `AcademicTerm` mặc định (*Năm học 2026–2027 — Học kỳ 1*) gắn các lớp demo và 1 `LeaveRequest` mẫu ở trạng thái `PENDING`.
- Tests: unit (`ics-generator` chuẩn RFC 5545, `parseAikenText`, `parseMoodleXml` chống XXE, `parseQuizizzCsv`, `parseAnkiCsv`), integration (duyệt đơn nghỉ tự ghi `AttendanceRecord EXCUSED`, khoá sổ điểm chặn sửa điểm tay/offline, token `.ics` thu hồi trả `401`, cứu hộ cộng giờ cập nhật `AssignmentOverride` + `AuditLog`), E2E (GV gửi tin nhắn & cộng giờ từ màn Live → HS thấy ngay trên `/do`; PH gửi đơn nghỉ → GV duyệt → kiểm tra điểm danh `EXCUSED`; import đề Aiken; Admin bật banner hệ thống).

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

### Phase 17 — Nâng cấp Worksheet Studio, Import Word Đa Dạng & Chú thích Ảnh Chấm Bài (27/11/2026)

- **Nhánh:** `phase-17` (merged fast-forward vào `main`).
- **Migration Prisma:** `20261126161706_phase17_studio_annotations_image_ws` (`WorksheetPage.imageKey`, `Field.imageKey`, `Assignment.shuffleOptions`, `Submission.optionOrder`, `Answer.annotations`) — tương thích ngược 100%.
- **Đã làm:**
  - **Studio Undo/Redo & Toolbar gọn 2 hàng:** `src/lib/worksheet/editor-history.ts` (giới hạn 50 bước, gộp thao tác 400ms, phím tắt `Ctrl+Z` / `Ctrl+Shift+Z` & nút toolbar); tối ưu thanh công cụ 2 hàng + huy hiệu tải PDF không nhảy bố cục.
  - **Import Đề Word/Text đa dạng & Thanh công thức KaTeX:** `src/lib/worksheet/word-exam-parser.ts` + `POST /api/worksheets/parse-word-exam` nhận diện Trắc nghiệm A/B/C/D (in đậm/gạch chân/`*`/bảng đáp án), Đúng/Sai 4 ý THPT 2025, điền từ `__đáp án__`, tự luận; nâng cấp hộp thoại Word trên `/teacher/worksheets`; `FormulaToolbar.tsx` chèn nhanh ký hiệu Cơ bản / Giải tích / Hình học / Hoá học.
  - **Fill on Image, Ảnh minh hoạ câu hỏi & Tự quét ô trống PDF:** `src/lib/image-meta.ts` kiểm tra magic bytes + chuẩn hoá kích thước trang 595pt; `POST /api/worksheets/[id]/images` + `POST/DELETE /api/worksheets/[id]/field-image` + bảo vệ anti-IDOR trong `authorizeFileDownload` và đóng gói qua `.engclass.zip` / clone; `src/lib/worksheet/pdf-blank-detector.ts` quét gợi ý `TEXT`/`CHECKBOX` và lọc trùng IoU > 0.3; cập nhật `prisma/seed.ts` thêm worksheet mẫu Toán Fill-on-Image.
  - **Trộn phương án, Xuất PDF in ấn Tiếng Việt & Chú thích chấm ảnh:** `Assignment.shuffleOptions` xáo trộn thứ tự phương án theo từng `Submission.optionOrder` vẫn chấm đúng `option.id`; `src/lib/pdf/export-printable-pdf.ts` + `@pdf-lib/fontkit` + `public/fonts/NotoSans-*.ttf` xuất `PDF (HS)` / `PDF (ĐA)` tại `GET /api/worksheets/[id]/export?format=pdf`; `PhotoAnnotatorModal.tsx` + `PUT /api/submissions/[id]/annotations` cho giáo viên vẽ bút đỏ/tick/hình học trên ảnh bài làm, đồng thời chỉ hiển thị chế độ chỉ đọc cho học sinh khi `revealResult === true`.
  - **Rà soát PLAN.md tới Phase 32:** Bổ sung 6 chi tiết kỹ thuật không phá vỡ tương thích cho Phase 22, 27, 28, 29, 31, 32 (`Field.topicTag`, `generateLiveQuizPin` toàn bảng, OMR buffer thuần Node, `Answer.teacherNote`, quyền nhóm `ClassGroupMember`, `unlockForDeviceSwitch` dùng `lockedAt` + `attemptToken` và kiểm tra `maintenanceMode` ở Node runtime).
- **Kết quả kiểm tra:** `pnpm db:seed` pass (idempotent x2); `pnpm lint` 0 lỗi / 0 cảnh báo; `pnpm typecheck` 0 lỗi; `pnpm test` 23/23 files (152/152 tests) pass; `pnpm test:e2e` 21/21 tests pass; `pnpm build:check` pass.

### Phase 18 — Camera AI nâng cao & Chống gian lận Mobile (27/11/2026)

- **Nhánh:** `phase-18` (merged fast-forward vào `main`).
- **Migration Prisma:** `20261126202405_phase18_camera_ai_advanced` (`enum CameraSensitivity`, bổ sung `CAMERA_GAZE_AWAY`, `MIC_VOICE`, `MOBILE_APP_SWITCH` vào `ProctorEventType`, và thêm `cameraSensitivity`, `cameraCountLookAway`, `requireMicMonitor` trên `Assignment`) — tương thích ngược 100%.
- **Đã làm:**
  - **Camera AI nâng cao:** Thêm `CAMERA_SENSITIVITY_PRESETS` (`LOW` / `MEDIUM` / `HIGH`), `getCameraConfigForSensitivity`, `estimateIrisGazeFromLandmarks` (iris landmarks `468`/`473` so với khoé mắt `33`/`133` và `362`/`263`), sự kiện `CAMERA_GAZE_AWAY` (không chồng trùng khi `CAMERA_LOOK_AWAY` đang kích hoạt), tuỳ chọn `cameraCountLookAway` trong `proctorService.ts` (mặc định không trừ điểm vi phạm quay đầu trừ khi cả `cameraEnforce` và `cameraCountLookAway` đều bật).
  - **Giám sát Micro chỉ trong RAM:** `src/lib/proctor/mic-monitor.ts` + `src/hooks/useMicProctor.ts` chỉ tính RMS dải tần giọng nói `300–3400Hz` qua `AnalyserNode` trong RAM (tuyệt đối không `MediaRecorder`, không blob, không tải âm thanh lên server), phát `MIC_VOICE` khi vượt ngưỡng ≥ 2.5s (cooldown 20s), kèm `window.__engclassMicMock` và bước kiểm tra + đồng ý trên `/rules` + huy hiệu live ở `/do`.
  - **Chống gian lận Mobile:** `src/lib/proctor/mobile-detect.ts` tự bỏ qua khoá toàn màn hình khi `!document.fullscreenEnabled` hoặc màn hình di động, hiển thị banner Mobile trên `/rules` và `/do`, ghi nhận `MOBILE_APP_SWITCH` qua `visibilitychange` + `pagehide` (khử trùng lặp 1.5s) và cập nhật `getLiveProctoringSnapshot`.
  - **UI Giáo viên & Sandbox thử nghiệm:** Thêm `/teacher/settings/camera-test` (gắn link từ `/teacher/settings` và `/teacher/assignments/new`) chạy `useCameraProctor` + `useMicProctor` ở chế độ `dryRun`, nâng cấp form giao bài `/teacher/assignments/new`, và nâng cấp Nhật ký giám sát thi trên `/grading` với chip lọc `Tất cả / Camera / Màn hình / Âm thanh` cùng xem ảnh snapshot bằng `PhotoLightboxModal` ngay trong trang (`z-[70] pointer-events-auto`).
- **Kết quả kiểm tra:** `pnpm db:seed` pass (idempotent x2); `pnpm lint` 0 lỗi / 0 cảnh báo; `pnpm typecheck` 0 lỗi; `pnpm test` 25/25 files (158/158 tests) pass; `pnpm test:e2e` 24/24 tests pass; `pnpm build:check` pass.

### Phase 19 — Thêm 9 Dạng Câu Hỏi Tương Tác & Đặc Thù Môn Học (27/11/2026)

- **Nhánh:** `phase-19` (merged fast-forward vào `main`).
- **Migration Prisma:** `20261126205715_phase19_interactive_field_types` (bổ sung 9 giá trị vào `enum FieldType`: `MATCH`, `DRAG_DROP`, `SPEAKING`, `VOICE_ANSWER`, `HIGHLIGHT`, `ORDERING`, `WORDSEARCH`, `DRAW`, `CODE`) — tương thích ngược 100%.
- **Đã làm:**
  - **Logic chấm & Sinh đề an toàn:** Mở rộng `src/lib/grading/types.ts` (bộ phân biệt `isTrueFalseGroupAnswer` an toàn, `FieldOptionsValue`, type guards riêng cho từng loại), bổ sung các module chấm thuần `match.ts`, `drag-drop.ts`, `speaking.ts`, `highlight.ts`, `ordering.ts` (`LCS` & `EXACT_POS`), `wordsearch.ts` (`mulberry32`, `generateWordsearchGrid`, xác thực toạ độ thẳng hàng) và tích hợp vào `src/lib/grading/index.ts`, `regradeService.ts`, `reportService.ts`.
  - **Bảo mật & Upload Media:** Cập nhật `src/server/submissionService.ts` để sinh ma trận `WORDSEARCH` ở server, ẩn `wordHints` khi `showWordList !== true`, không bao giờ lộ `answerKey`; `sanitizeAnswerValueForSubmission` chặn giả mạo `fileKey`/`audioKey`; `POST /api/submissions/[id]/files` xác thực magic bytes chặt chẽ cho PNG (`DRAW`) và WebM/OGG/MP4/WAV (`VOICE_ANSWER` / `SPEAKING`).
  - **Giao diện tương tác 12 module (`src/components/worksheet/interactive/`):** `MatchQuestionInput` (SVG nối cột + chạm ghép trên mobile), `DragDropQuestionInput` (HTML5 DnD + chạm gán), `SpeakingQuestionInput` (Web Speech API + nhập tay dự phòng), `VoiceAnswerInput` (`MediaRecorder` + phát lại + tải file), `HighlightQuestionInput`, `OrderingQuestionInput` (DnD + ↑/↓), `WordsearchQuestionInput` (chọn ô đầu-cuối thẳng hàng), `DrawQuestionInput` (Canvas vẽ tay/tẩy/undo + lưu PNG), `CodeQuestionInput` (sandbox Web Worker JS timeout 2s), `InteractiveQuestionInput`, `InteractiveFieldEditor`, `InteractiveAnswerReview`; tích hợp vào `WorksheetEditor`, `FocusQuestionRunner`, `OverlayFieldInput`, `AnswerSheetPanel`, `GradeByQuestionPanel`, trang chấm bài, `src/lib/subjects.ts` (20 loại câu, `INFORMATICS` ưu tiên `CODE`), PDF in ấn và gói `.engclass.zip`/`.docx`.
  - **Seed & Kiểm thử:** Cập nhật `prisma/seed.ts` (worksheet + assignment Phase 19 tổng hợp cả 9 dạng câu mới), bổ sung `tests/unit/phase19-interactive-grading.test.ts`, `tests/integration/phase19-interactive-security.test.ts` và `tests/e2e/phase19-interactive-fields.spec.ts`.
- **Kết quả kiểm tra:** `pnpm db:seed` pass (idempotent x2); `pnpm lint` 0 lỗi / 0 cảnh báo; `pnpm typecheck` 0 lỗi; `pnpm test` 27/27 files (167/167 tests) pass; `pnpm test:e2e` 26/26 tests pass; `pnpm build:check` pass.

### Phase 20 — Workbook, Trả bài làm lại, Tiến độ Bài giảng, Bảng tin & Đồng giáo viên (27/11/2026)

- **Nhánh:** `phase-20` (merged fast-forward vào `main`).
- **Migration Prisma:** `20261126213441_phase20_workbook_coteacher_classroom` (`enum ClassRole`, `SubmissionStatus.RETURNED`, `NotificationType.SUBMISSION_RETURNED`, `Workbook`, `WorkbookItem`, `Assignment` unlock chain, `SubmissionRevision`, `ClassTeacher`, `Field.topicTag`, `LessonItemProgress`, `Post` `pinned`/`commentsLocked`/`attachments`, `PostPoll`/`Option`/`Vote`, `PostReaction`) — tương thích ngược 100%.
- **Đã làm:**
  - **Workbook & Mở dần tuần tự:** `workbookService.ts` + `WorkbookLibrary.tsx` (`/teacher/worksheets?tab=workbooks`) + `/teacher/classes/[id]/workbooks/[workbookId]` (ma trận điểm cả lớp + xuất Excel); `startOrResumeSubmission` & `getStudentAssignmentPayload` chặn `PREREQUISITE_NOT_SUBMITTED` (403) và `student/do/page.tsx` hiển thị màn hình khoá lộ trình dẫn thẳng tới bài tiên quyết.
  - **Trả bài làm lại & Lịch sử sửa bài:** `returnSubmissionForRevision` (`POST /api/submissions/[id]/return`) lưu `SubmissionRevision`, đặt `RETURNED`, gửi `SUBMISSION_RETURNED`, vẫn giấu `answerKey` (`canRevealResult = false`) và cho học sinh sửa/nộp lại trên cùng lượt mà không tốn `maxAttempts`; `grading/page.tsx` bổ sung nút Trả bài + lịch sử revision + **Phổ điểm (`ScoreHistogramChart`)** + lọc **`topicTag`**.
  - **Đồng giáo viên / Trợ giảng & Lớp học:** `src/lib/class-roles.ts` + `permissions.ts` (`OWNER > CO_TEACHER > ASSISTANT`) cập nhật đồng bộ `requireTeacherOfClass`, `requireTeacherOfAssignment`, `requireMemberOfClass`, `requireSubmissionAccess`, `authorizeFileDownload` và quyền chi tiết trên các route; `ClassTeachersSection`, `ClassSubmissionsTab`, `ClassAnalyticsTab` (trend 12 tuần + HS chưa nộp), nút **Nhân bản lớp (`cloneClass`)**.
  - **Tiến độ Bài giảng & Bảng tin nâng cao:** `lessonProgressService.ts` (`POST /api/lessons/items/[itemId]/progress`) gắn tick xanh `Đã học` / tỉ lệ xem lớp; `postService.ts` + `PostCard.tsx` hỗ trợ đính kèm file an toàn, ghim bài, khoá bình luận (`COMMENTS_LOCKED`), Poll 1/nhiều lựa chọn và emoji reaction.
  - **Seed & Kiểm thử:** Cập nhật `prisma/seed.ts` (workbook 3 buổi tuần tự + bài `GRADED` của `student1`, `teacher2` là `ASSISTANT` lớp 12A1, bài ghim + poll); bổ sung `phase20-analytics-roles.test.ts`, `phase20-workbook-return-roles.test.ts` và `phase20-workbook-classroom.spec.ts`.
- **Kết quả kiểm tra:** `pnpm db:seed` pass (idempotent x2); `pnpm lint` 0 lỗi / 0 cảnh báo; `pnpm typecheck` 0 lỗi; `pnpm test` 29/29 files (176/176 tests) pass; `pnpm test:e2e` 29/29 tests pass; `pnpm build:check` pass.

### Phase 21 — Giao bài nhanh theo SGK, Điểm Offline & Sổ điểm tổng hợp (27/11/2026)

- **Nhánh:** `phase-21` (merged fast-forward vào `main`).
- **Migration Prisma:** `20261126220858_phase21_offline_grades_gradebook` (`Assignment.isQuickTextbook`, `promptText`, `attachmentKeys`, bảng `OfflineGradeColumn`, `OfflineGradeEntry`) — tương thích ngược 100%.
- **Đã làm:**
  - **Thuật toán Sổ điểm thuần:** `src/lib/gradebook-calc.ts` (`normalizeToScale10`, `parseDateBoundary`, `isWithinDateRange`, `computeWeightedAvg10` hỗ trợ trọng số hỗn hợp + lọc khoảng ngày + hook chuyên cần Phase 23, `computeSubmissionRatePct`).
  - **Giao bài nhanh theo SGK:** `assignmentService.ts` (`uploadQuickAssignmentAttachment` kiểm tra magic bytes JPG/PNG/WebP/`%PDF-`, `createQuickTextbookAssignment` tự tạo worksheet `[SGK]` chứa câu `PHOTO_UPLOAD` và giao ngay cho lớp), `authorizeFileDownload` chặn IDOR cho `assignments/quick/*`, `QuickTextbookModal.tsx` gắn tại Tab Bài tập của lớp và `/teacher/assignments/new`, và `student/do/page.tsx` hiển thị yêu cầu + tài liệu SGK ở cả màn hình bắt đầu và khi làm bài.
  - **Điểm Offline & Sổ điểm tổng hợp:** `offlineGradeService.ts` (CRUD cột điểm giấy, lưu điểm inline kèm kiểm tra học sinh thuộc lớp và khoảng điểm, import điểm hàng loạt từ Excel theo email/họ tên có xem trước & báo lỗi từng dòng), `gradebookService.ts` (`getClassGradebook`, `getStudentGradebookDetail`, `exportClassGradebookExcel`, `exportStudentReportCardPdf` dùng `@pdf-lib/fontkit` + `NotoSans-*.ttf`), 8 API routes mới, `ClassGradebookTab.tsx` (bảng lưới kiểu Excel, sửa điểm inline, lọc ngày, dialog Radix chuẩn), `StudentProgressDrawer.tsx` (biểu đồ tiến bộ SVG + tải Phiếu báo điểm PDF) và mục **Điểm kiểm tra trên lớp (giấy)** trên Cổng Phụ huynh `/parent` (tuyệt đối chỉ trả điểm của con mình và TB lớp ẩn danh).
  - **Seed & Kiểm thử:** Cập nhật `prisma/seed.ts` (1 bài giao nhanh SGK + 2 cột điểm giấy 15p & 1 tiết cho lớp 12A1), bổ sung `phase21-gradebook-calc.test.ts`, `phase21-gradebook-offline-parent.test.ts` và `phase21-quick-gradebook.spec.ts`.
- **Kết quả kiểm tra:** `pnpm db:seed` pass (idempotent x2); `pnpm lint` 0 lỗi / 0 cảnh báo; `pnpm typecheck` 0 lỗi; `pnpm test` 31/31 files (182/182 tests) pass; `pnpm test:e2e` 31/31 tests pass; `pnpm build:check` pass.

### Phase 22 — Ngân hàng câu hỏi, Ma trận đề & Kỳ thi liên lớp (27/11/2026)

- **Nhánh:** `phase-22` (merged fast-forward vào `main`).
- **Migration Prisma:** `20261126224702_phase22_question_bank_exams` (bổ sung bảng `QuestionBankItem`, `ExamVariant`, `ExamSession`, cùng các trường `Field.bankItemId`, `Assignment.examSessionId`, `Submission.examVariantId`, kế thừa `Field.topicTag` của Phase 20) — tương thích ngược 100%.
- **Đã làm:**
  - **Thuật toán Ma trận & Sinh mã đề thuần:** `src/lib/exam/matrix-picker.ts` (`matchesMatrixRow`, `countAvailableForMatrixRow`, `fisherYatesShuffle`, `pickQuestionsByMatrix` ưu tiên bốc dòng hẹp trước để tránh tranh chấp câu giữa các dòng) và `src/lib/exam/variant-generator.ts` (`buildExamVariants` sinh N mã đề `101..124` với hoán vị thứ tự câu và đáp án A/B/C/D).
  - **Ngân hàng câu hỏi & Sinh đề từ ma trận:** `src/server/questionBankService.ts` (`MatrixInsufficientError` 400 có chi tiết hàng thiếu câu, CRUD kèm chặn IDOR `isShared`, `saveFieldToQuestionBank` lưu nhanh câu hỏi từ phiếu, `previewMatrixAvailability`, `generateWorksheetFromMatrix` nhân bản cả ảnh/audio đính kèm) + 4 API routes `/api/question-bank*` + UI `/teacher/question-bank` (lọc đa chiều môn/dạng/chủ đề/kỹ năng/độ khó, dialog tạo câu & sinh đề từ ma trận) và nút **"Lưu vào ngân hàng câu"** trong `WorksheetEditor.tsx`.
  - **Nhiều mã đề chống nhìn bài & Chấm chuẩn:** `src/server/examVariantService.ts` (`generateVariantsForAssignment`, `pickExamVariantForNewSubmission` chia vòng tròn cân bằng), tích hợp vào `assignmentService.ts` (`variantCount` trong form `/teacher/assignments/new`), `submissionService.ts` (hiển thị thứ tự câu & đáp án theo mã đề khi làm bài và chấm theo `answerKey` chuẩn), `student/do/page.tsx` (`exam-variant-badge`) và `grading/page.tsx` (huy hiệu mã đề + thống kê `variantBreakdown` trong `reportService.ts`).
  - **Kỳ thi liên lớp & Giám sát gộp live:** `src/server/examSessionService.ts` (`assertExamSessionAccess`, `listExamSessions`, `createExamSession`, `getExamSessionReport` với xếp hạng gộp toàn khối & phân bố theo lớp, `getExamSessionLiveSnapshot`) + 3 API routes `/api/exams*` (kể cả SSE `/api/exams/[id]/live` gộp các `assignmentIds`), UI `/teacher/exams` và `/teacher/exams/[id]` (tab Giám sát trực tiếp gộp SSE & tab Báo cáo xếp hạng liên lớp), gắn link điều hướng trong `RoleShell.tsx`.
  - **Seed & Kiểm thử:** Cập nhật `prisma/seed.ts` (thêm lớp `ENG12B` với `createdAt` cũ hơn `ENG12A` để giữ nguyên thứ tự mặc định của `teacher1`, 25 câu ngân hàng mẫu cho Tiếng Anh & Toán, 1 Kỳ thi thử liên lớp 4 mã đề `101..104` ở chế độ `MONITOR`), bổ sung `tests/unit/phase22-matrix-variants.test.ts`, `tests/integration/phase22-bank-variants-exams.test.ts` và `tests/e2e/phase22-question-bank-exams.spec.ts`.
- **Kết quả kiểm tra:** `pnpm db:seed` pass (idempotent x2); `pnpm lint` 0 lỗi / 0 cảnh báo; `pnpm typecheck` 0 lỗi; `pnpm test` 33/33 files (188/188 tests) pass; `pnpm test:e2e` 33/33 tests pass; `pnpm build:check` pass.

### Phase 23 — Lịch dạy, Buổi học & Điểm danh (27/11/2026)

- **Nhánh:** `phase-23` (merged fast-forward vào `main`).
- **Migration Prisma:** `20261127014608_phase23_schedule_attendance` (bổ sung enum `AttendanceStatus`, `SessionStatus`, giá trị `NotificationType.ATTENDANCE_ALERT`, các bảng `ClassScheduleRule`, `ClassSession`, `AttendanceRecord`) — tương thích ngược 100%.
- **Đã làm:**
  - **Thuật toán Lịch & Chuyên cần thuần:** `src/lib/schedule/recurrence.ts` (`parseTimeToMinutes`, `expandScheduleOccurrences`, `getMonthBoundariesUtc` neo theo múi giờ UTC+7 không lệch thứ) và `src/lib/attendance-calc.ts` (`computeAttendanceSummary` theo trọng số `Có mặt=1`, `Đi muộn=0.8`, `Vắng phép=0.5`, `Vắng KP=0`).
  - **Services & Chống IDOR:** `src/server/scheduleService.ts` (lịch lặp tuần tự sinh buổi học `skipDuplicates`, buổi bù/tăng cường, chỉnh sửa link Meet/Zoom, bài giảng & bài tập đính kèm thuộc đúng lớp, lịch toàn trường cho GV/HS), `src/server/attendanceService.ts` (lưu điểm danh giao dịch batch, chặn IDOR học sinh ngoài lớp, chỉ gửi `ATTENDANCE_ALERT` cho phụ huynh đã xác minh khi trạng thái chuyển mới sang `ABSENT`/`LATE`, báo cáo chuyên cần tháng); tích hợp cột `% Chuyên cần` & `Vắng KP` vào `gradebookService.ts` (Sổ điểm web, Excel, Phiếu báo điểm PDF) và mục **Chuyên cần & Điểm danh trên lớp** trong `parentService.ts` (chỉ trả dữ liệu của con mình).
  - **API Routes & Giao diện UI:** 6 nhóm route `/api/classes/[id]/schedule-rules`, `/api/classes/[id]/sessions`, `/api/classes/[id]/attendance/report`, `/api/schedule`, `/api/sessions/[id]`, `/api/sessions/[id]/attendance`; trang `/teacher/schedule` & `/student/schedule` (`ScheduleCalendarView.tsx` Tuần/Tháng + danh sách mobile 375px); tab **"Lịch & Điểm danh"** (`ClassScheduleTab.tsx`), modal điểm danh 1 chạm (`AttendanceSheetDialog.tsx` có nút **"Tất cả có mặt"**), cập nhật `ClassGradebookTab.tsx`, `StudentProgressDrawer.tsx`, `src/app/parent/page.tsx` và `RoleShell.tsx`.
  - **Seed & Kiểm thử:** Cập nhật `prisma/seed.ts` (2 quy tắc lịch T2/T6, 4 buổi học & dữ liệu điểm danh mẫu cho lớp 12A1), bổ sung `tests/unit/phase23-schedule-attendance.test.ts`, `tests/integration/phase23-schedule-attendance.test.ts` và `tests/e2e/phase23-schedule-attendance.spec.ts`.
- **Kết quả kiểm tra:** `pnpm db:seed` pass (idempotent x2); `pnpm lint` 0 lỗi / 0 cảnh báo; `pnpm typecheck` 0 lỗi; `pnpm test` 35/35 files (194/194 tests) pass; `pnpm test:e2e` 35/35 tests pass; `pnpm build:check` pass.

### Phase 24 — Học sinh, Flashcard SRS, Phụ huynh & Thông báo đa kênh (27/11/2026)

- **Nhánh:** `phase-24` (merged fast-forward vào `main`).
- **Migration Prisma:** `20261127021315_phase24_student_parent_notifications` (bổ sung bảng `FlashcardDeck`, `Flashcard`, `FlashcardReview`, `StudentStreak`, `StudentBadge`, `ParentThread`, `ParentMessage`, `WeeklyReportSent`, `PushSubscription`, `NotificationPreference`, trường `Class.enableGamification`, và giá trị `PARENT_MESSAGE`, `WEEKLY_REPORT` trong `enum NotificationType`) — tương thích ngược 100%.
- **Đã làm:**
  - **Thuật toán thuần SM-2 & Streak VN:** `src/lib/srs.ts` (`computeNextSrsState` với `quality: 0 | 3 | 4 | 5`) và `src/lib/streak.ts` (`getVnDayKey`, `advanceStreak`, `getVnWeekKey` theo múi giờ UTC+7); mở rộng `src/lib/crypto-secrets.ts` thêm mục đích `"push"`.
  - **Services & Tự động hoá:**
    - `src/server/mistakeReviewService.ts`: tổng hợp câu sai chỉ từ bài đã công bố (`canRevealResult && showAnswerKey && !canStillAttempt`), chống lộ đáp án bài đang làm/còn lượt.
    - `src/server/flashcardService.ts`: CRUD bộ thẻ giáo viên/cá nhân, trích xuất thẻ từ Worksheet (`TEXT`/`DICTATION`/`MULTIPLE_CHOICE`/`NUMBER`), hàng đợi ôn tập & lưu trạng thái SM-2.
    - `src/server/gamificationService.ts`: cập nhật `StudentStreak` & trao huy hiệu (`FIRST_SUBMIT`, `ON_TIME_5`, `PERFECT_10`, `STREAK_7`) trong `finalizeSubmissionInternal` (`submissionService.ts`) + tuỳ chọn tắt/bật theo lớp (`ClassDetailView.tsx` & `classService.ts`).
    - `src/server/parentMessageService.ts`: hộp thư 1-1 GV–PH với chặn IDOR chặt theo `Enrollment(ACTIVE)` + `ParentLink(verifiedAt != null)`, đánh dấu đã đọc & đếm chưa đọc.
    - `src/server/externalNotifyService.ts`: adapter Web Push (`web-push` mã hoá khoá `p256dh`/`auth` bằng AES-256-GCM, tự xoá subscription khi nhận `410 Gone`), SMTP (`nodemailer` kiểm tra `NotificationPreference`), Telegram/Webhook (`sendWebhookAlert`), cập nhật `.env.example` và `next.config.ts`.
    - `src/server/weeklyReportService.ts`: tổng kết 7 ngày (bài đã chấm, bài chưa nộp, chuyên cần, cảnh báo thi chia sẻ) chạy tự động Chủ nhật 19:00 qua `src/instrumentation.ts` với chống trùng lặp qua `WeeklyReportSent`.
  - **API Routes & Giao diện UI:** 8 nhóm route (`/api/student/mistakes`, `/api/flashcards*`, `/api/messages/threads*`, `/api/notifications/preferences`, `/api/notifications/push`), `public/sw.js` (`push` & `notificationclick`), `/student/flashcards`, `/student/mistakes`, tab **Flashcard** trong `/teacher/worksheets`, thẻ Streak & Huy hiệu trên `StudentDashboardClient.tsx`, `/messages` + badge chưa đọc trên `AppNavbar.tsx` / `RoleShell.tsx`, và thẻ **Cài đặt thông báo Email & Web Push** trong `/account` (`NotificationPreferencesSection.tsx`).
  - **Seed & Kiểm thử:** Cập nhật `prisma/seed.ts` (1 bộ Flashcard Unit 7 gồm 10 từ, streak/badge mẫu cho `student1`, 1 hội thoại `ParentThread` mẫu `teacher1 ↔ parent1`), bổ sung `tests/unit/phase24-srs-streak.test.ts`, `tests/integration/phase24-mistakes-flashcards-messages-notify.test.ts` và `tests/e2e/phase24-student-parent-inbox.spec.ts`.
- **Kết quả kiểm tra:** `pnpm db:seed` pass (idempotent x2); `pnpm lint` 0 lỗi / 0 cảnh báo; `pnpm typecheck` 0 lỗi; `pnpm test` 37/37 files (201/201 tests) pass; `pnpm test:e2e` 37/37 tests pass; `pnpm build:check` pass.

### Phase 25 — Thư mục phân tầng, Lịch sử phiên bản, Discover, AI tạo câu hỏi & Link luyện tập mở (Đã hoàn tất)
- **Database & Migration:** Áp dụng migration `20261127024430_phase25_library_discover_ai_public` bổ sung `LibraryFolder`, `Worksheet` (`folderId`, `tags`, `isPublic`, `publicLevel`, `publicHiddenByAdmin`, `likeCount`), `Lesson` (`folderId`, `tags`), `WorksheetVersion`, `WorksheetLike`, `TeacherFollow`, `ContentReport`, `AiUsageLog`, `Assignment` (`publicShareToken`, `allowPublicPractice`) và `PublicAttempt`.
- **Đã làm:**
  - **Thư mục phân tầng & Tag (`folderService.ts`, `src/lib/folders/tree.ts`):** Cây thư mục đa cấp cho học liệu, chống vòng lặp `wouldCreateFolderCycle`, xoá thư mục an toàn giữ nguyên phiếu, bộ lọc & chọn thư mục trực tiếp trên `/teacher/worksheets` và hỗ trợ `folderId`/`tags` cho bài giảng (`lessonService.ts`).
  - **Lịch sử phiên bản (`worksheetVersionService.ts`):** Chụp snapshot tối đa 30 bản/phiếu (tự động chụp trước khi giao bài trong `assignmentService.ts` và chụp thủ công trên `WorksheetEditor.tsx`), khôi phục an toàn (tự động nhân bản sang phiếu mới nếu đã có học sinh nộp bài để bảo toàn dữ liệu chấm).
  - **Discover, Hồ sơ giáo viên & Kiểm duyệt (`discoverService.ts`):** Xuất bản phiếu lên `/discover`, xem trước không lộ `answerKey` (`STUDENT_FIELD_SELECT`), thích/bỏ thích, sao chép về kho (`cloneWorksheetForTeacher`), trang hồ sơ `/teachers/[id]` + theo dõi giáo viên, và hàng đợi kiểm duyệt `/admin/moderation` (`HIDE`/`DISMISS`/`RESTORE` kèm Audit Log).
  - **AI tạo câu hỏi (`aiGeneratorService.ts`, `src/lib/ai/gemini-prompt.ts`):** Tích hợp Gemini Flash có kiểm soát hạn mức ngày qua `AiUsageLog` (`AI_DAILY_LIMIT_PER_TEACHER`), chuẩn hoá JSON an toàn cho 5 dạng câu (`MULTIPLE_CHOICE`, `TRUE_FALSE_GROUP`, `TEXT`, `WORDSEARCH`, `ESSAY`) và modal sinh/chèn nhanh trên `WorksheetEditor.tsx`.
  - **Link luyện tập mở cho khách (`publicPracticeService.ts`, `/practice/[token]`):** Bật/tắt & thống kê lượt làm của khách ngay trong trang chấm bài (`/teacher/assignments/[id]/grading`), chấm điểm tức thì tách biệt hoàn toàn với `Submission` và bảng xếp hạng lớp.
  - **Seed & Kiểm thử:** Cập nhật `prisma/seed.ts` (thư mục mẫu, 2 bản `WorksheetVersion`, 2 phiếu Discover công khai, báo cáo mẫu và link `/practice/demo-public-practice-p25`), bổ sung `tests/unit/phase25-ai-and-folders.test.ts`, `tests/integration/phase25-discover-versions-ai-public.test.ts` và `tests/e2e/phase25-discover-ai-public.spec.ts`.
- **Kết quả kiểm tra:** `pnpm db:seed` pass (idempotent x2); `pnpm lint` 0 lỗi / 0 cảnh báo; `pnpm typecheck` 0 lỗi; `pnpm test` 39/39 files (211/211 tests) pass; `pnpm test:e2e` 39/39 tests pass; `pnpm build:check` pass.

### Phase 26 — Tài khoản, Bảo mật nâng cao & Sẵn sàng mở rộng (Đã hoàn tất)
- **Database & Migration:** Áp dụng migration `20261127031600_phase26_auth_security_scaling` bổ sung `PasswordResetToken` (token hash SHA-256, hiệu lực 30 phút, dùng 1 lần) và `LoginSessionLog` (ghi provider, IP đã ẩn qua `maskIpAddress`, User-Agent).
- **Đã làm:**
  - **Thuần libs & Redis Adapter:** `src/lib/ip-mask.ts` (`maskIpAddress` ẩn 2 octet cuối IPv4 và giữ prefix `/48` IPv6), `src/lib/redis.ts` (client `ioredis` lười khởi tạo khi có `REDIS_URL`), `src/lib/rate-limit.ts` (`checkRateLimitAsync` dùng Redis `INCR`/`PEXPIRE` có fallback In-Memory) và `src/lib/proctor-bus.ts` (`ProctorBusDriver`, `InMemoryProctorBus`, `RedisProctorBus` kênh `pivora:proctor:${assignmentId}` có fallback). Cập nhật `.env.example` và `next.config.ts`.
  - **Quên / Đặt lại mật khẩu (`passwordResetService.ts`, `/forgot-password`, `/reset-password`):** Chống dò email tồn tại, giới hạn tần suất 5 lần / 15 phút, gửi link qua SMTP nếu bật, vô hiệu token cũ, đặt lại mật khẩu và tự đăng xuất các phiên cũ qua `passwordChangedAt` kèm `AuditLog` (`PASSWORD_RESET_COMPLETED`).
  - **Google OAuth Allow-list & 2FA Giáo viên (`authSecurityService.ts`, `src/lib/auth.ts`, `totpService.ts`):** Khoá chặt Google OAuth chỉ cho email đã được Admin/GV cấp sẵn tài khoản (`email_verified` + không bị xoá/khoá), mở xác thực 2 bước TOTP cho cả `ADMIN` và `TEACHER` (học sinh/phụ huynh giữ 403), ghi nhận `LoginSessionLog` cho cả Credentials và Google, tách `/login` (`LoginClient.tsx` + Server `page.tsx`) truyền cờ `googleEnabled`.
  - **Quản lý phiên (`/account`):** Thêm `listLoginHistory` & `signOutAllDevices` (`accountService.ts`), API `/api/account/sessions` & `/api/account/logout-all`, hiển thị bảng lịch sử đăng nhập gần đây và nút **Đăng xuất khỏi mọi thiết bị khác** (kèm Radix Dialog xác nhận) trên `AccountClient.tsx`.
  - **Seed & Kiểm thử:** Cập nhật `prisma/seed.ts` (dữ liệu `LoginSessionLog` mẫu), cập nhật `phase13-admin-ops` kiểm tra Teacher 2FA hợp lệ / Student bị 403, bổ sung `tests/unit/phase26-security-redis.test.ts`, `tests/integration/phase26-auth-reset-totp-sessions.test.ts` và `tests/e2e/phase26-auth-security.spec.ts`.
- **Kết quả kiểm tra:** `pnpm db:seed` pass (idempotent x2); `pnpm lint` 0 lỗi / 0 cảnh báo; `pnpm typecheck` 0 lỗi; `pnpm test` 41/41 files (218/218 tests) pass; `pnpm test:e2e` 41/41 tests pass; `pnpm build:check` pass.

### Phase 27 — Live Quiz trên lớp, Exit Ticket & Điểm cộng Sao thưởng (Đã hoàn tất, chờ merge cùng Phase 28–32)
- **Database & Migration:** `20261127043530_phase27_live_quiz_behavior_points` (chỉ thêm bảng/enum, tương thích ngược): `LiveQuizSession`, `LiveQuizParticipant`, `LiveQuizAnswer`, `ClassBehaviorPreset`, `StudentBehaviorPoint`, enum `LiveQuizMode`, `LiveQuizStatus`.
- **Đã làm:**
  - **Pure libs (`src/lib/live-quiz/*`):** `computeLiveQuizPoints`, `liveQuizRatioToScore`, `generateLiveQuizPin` (truyền hàm `exists` vào để lib không phụ thuộc DB), `sanitizeLiveQuestionForPlayer`, `InMemoryLiveQuizBus` / `RedisLiveQuizBus` kênh `pivora:livequiz:${sessionId}`.
  - **`liveQuizService.ts`:** tạo phiên từ worksheet (đóng băng câu tự chấm vào `questionsSnapshot`), Exit Ticket 1 câu, join (phiên gắn lớp bắt buộc HS đăng nhập & `ACTIVE`; phiên mở cho khách nhập tên), `advanceLiveQuiz` dùng cập nhật có điều kiện (chống bấm đôi nhảy câu), chấm qua `gradeField` + đồng hồ server, chống nộp trùng, view GV/HS tách riêng, `exportLiveQuizToOfflineGrade` sang cột điểm giấy Phase 21.
  - **`behaviorPointService.ts`:** tự tạo 4 mẫu mặc định, cộng/trừ nhiều HS (chỉ HS `ACTIVE`), gắn `ClassSession`, tổng hợp theo lớp; cột **Sao thưởng** trong `gradebookService` và mục **Sao thưởng & Điểm cộng** trong `parentService` / Cổng phụ huynh.
  - **API:** `/api/live-quiz` (GET/POST), `/[id]` (GET), `/[id]/control`, `/[id]/stream` (SSE), `/join` (rate limit 20 lần/phút/IP), `/[id]/answer`, `/[id]/export-grade`; `/api/classes/[id]/behavior/presets` & `/points` (GET/POST/DELETE). Bản dịch lỗi trong `api-errors.ts`.
  - **UI:** màn trình chiếu `/teacher/live-quiz/[id]` (PIN + QR, đếm ngược, số HS đã trả lời, biểu đồ cột, Top 5, chuyển điểm sang Sổ điểm), `/live` & `/live/[pin]` tối ưu 375px (nút đáp án ≥ 64px), nút **Live** trên thẻ worksheet, nút **Hỏi nhanh** và tab **Sao thưởng** trong `ClassDetailView`, nút cộng/trừ nhanh trong hộp thoại điểm danh, link **Live Quiz** trong menu học sinh.
  - **Seed & Kiểm thử:** 4 preset + 6 điểm cộng cho 12A1, 1 phiên Live Quiz đã kết thúc (PIN `246810`); `tests/unit/phase27-live-quiz.test.ts`, `tests/integration/phase27-live-quiz-behavior.test.ts`, `tests/e2e/phase27-live-quiz-behavior.spec.ts`.
- **Quyết định khác plan:**
  - Join token của người chơi nằm trong cookie httpOnly `pivora_lq_<sessionId>` (EventSource không gửi được header); SSE chỉ phát tín hiệu đổi trạng thái, client tự tải lại state, nên không có nội dung câu hỏi đi qua stream.
  - Chế độ GV điều khiển: kết quả Đúng/Sai chỉ hiện khi đóng câu (tránh HS báo đáp án cho nhau khi câu còn mở); chế độ HS tự làm thì phản hồi ngay.
  - Màn GV tự đóng câu khi hết giờ hoặc khi mọi HS đã trả lời.
- **Kết quả kiểm tra (kiểm tra nhẹ theo phase, bộ đầy đủ chạy 1 lần sau Phase 32):** `pnpm db:seed` pass (x2); `pnpm lint` 0 lỗi / 0 cảnh báo; `pnpm typecheck` 0 lỗi; `pnpm test` 43/43 files (227/227 tests) pass; E2E Phase 27 2/2 pass. Chưa chạy: toàn bộ `pnpm test:e2e`, `pnpm build:check`. Nhánh `phase-27-32`.
