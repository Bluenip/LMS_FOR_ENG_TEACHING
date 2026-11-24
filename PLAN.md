# PLAN — EngClass LMS (giai đoạn tiếp theo)

> **Dành cho agent viết code (Gemini).** Đây là plan **duy nhất** của dự án. Mọi thứ ở mục 1 đã làm xong, **không làm lại**. Bản plan cũ (Phase 1–12) còn trong lịch sử git.
>
> Làm **theo đúng thứ tự Phase**. Xong mỗi Phase phải: chạy được, có seed data cho tính năng mới, có test, đạt hết mục "Tiêu chí hoàn thành", rồi mới sang Phase sau. Khi xong, ghi vào mục **"Tiến độ"** ở cuối file. Sau mỗi Phase, Claude sẽ review và test lại (cả giao diện bằng trình duyệt) trước khi deploy.
>
> Không sao chép tên, logo, giao diện hay nội dung của TopWorksheets, Liveworksheets, SHub hay Dạy Mãi. Chỉ tham khảo **tính năng**.

---

## 1. Hiện trạng (đã có, KHÔNG làm lại)

**Stack:** Next.js 15 (App Router, Turbopack dev) + TypeScript strict + Prisma 6/PostgreSQL 16 + Auth.js v5 (JWT credentials) + Tailwind/shadcn + Radix Dialog + TanStack Query + pdfjs-dist + react-rnd + zod + exceljs + MediaPipe tasks-vision + Vitest/Playwright. Postgres local chạy bằng `podman` (container `engclass-postgres`).

- **Vai trò & tài khoản:**
  - 4 vai trò Admin / Giáo viên / Học sinh / Phụ huynh; phân quyền ở `src/middleware.ts` và `src/lib/permissions.ts` (`requireLayoutUser`, `requireAuth`, `requireRole`, `requireTeacherOfClass`, `requireTeacherOfAssignment`…).
  - **Không cho tự đăng ký:** admin tạo mọi tài khoản ở `/admin`; giáo viên tạo học sinh và phụ huynh trong lớp (`CreateAccountForm`).
  - Admin: reset mật khẩu (mật khẩu tạm, bắt đổi khi đăng nhập: `mustChangePassword`), khoá/mở, đổi vai trò (có xác nhận; đổi vai trò thì đăng xuất người đó; **chặn** hạ quyền giáo viên còn sở hữu lớp/worksheet).
  - **Thùng rác tài khoản:** xoá = chuyển vào thùng rác (`User.deletedAt`), khôi phục được trong 90 ngày, sau đó tự xoá vĩnh viễn (`purgeExpiredTrash`, chạy khi admin mở dashboard); có "Xoá vĩnh viễn" (gõ lại email).
  - Trang `/account` cho mọi vai trò: sửa hồ sơ (tên, email, SĐT, ngày sinh, giới tính, giới thiệu), ảnh đại diện, đổi mật khẩu (đăng xuất các thiết bị khác qua `passwordChangedAt`).
  - Phiên cũ (user bị xoá / khoá / đổi vai trò / đổi mật khẩu) được xoá qua `/api/auth/clear-session?reason=...`.
- **Admin xem toàn hệ thống:** tất cả lớp (`/teacher`), tất cả bài đã giao (`/teacher/assignments`, lọc theo giáo viên), tất cả worksheet (tab "Của giáo viên khác (tất cả)"); sửa / sao chép / giao được mọi thứ.
- **Lớp học:** mã vào lớp, duyệt học sinh, import học sinh từ Excel, bảng tin + bình luận, bài giảng chia chương (PDF / video / audio / link); lưu trữ (đóng) lớp phải **gõ tên lớp** để xác nhận.
- **Worksheet:**
  - 3 kiểu: ô trên PDF (overlay), phiếu trả lời, hoặc kết hợp.
  - 9 loại câu: `TEXT`, `NUMBER`, `MULTIPLE_CHOICE`, `MULTI_SELECT`, `TRUE_FALSE`, `DROPDOWN`, `CHECKBOX`, `ESSAY`, `DICTATION`.
  - Editor kéo thả, autosave, "Xem như học sinh"; file nghe giới hạn lượt nghe; tạo bài điền từ từ file Word.
  - Backup / Export (`.engclass.zip`, `.docx`); chia sẻ và clone giữa giáo viên.
- **Giao bài:** hạn nộp, giờ mở, giới hạn thời gian, số lượt (có thể không giới hạn), trộn câu, công bố điểm / đáp án, Focus Mode (1 câu / màn hình).
  - **Sửa bài đã giao** (`/teacher/assignments/new?edit=<id>`, `PATCH /api/assignments/[id]`): đổi lượt, hạn, thời gian, giám sát…; tăng lượt / lùi hạn thì báo học sinh. Nút **"Giao lại"** tạo bài mới từ cùng worksheet.
- **Chấm & báo cáo:** tự chấm, chấm tay tự luận, tự chấm lại khi đổi đáp án, thống kê từng câu (kể cả đáp án sai phổ biến), xuất Excel.
- **Bảng xếp hạng:** theo bài và theo lớp; ẩn danh; cache 60 giây.
- **Cổng phụ huynh:** liên kết với con (nhiều con), KPI, biểu đồ, nhận xét của giáo viên.
- **Chống gian lận:**
  - 4 mức OFF / MONITOR / LOCKDOWN / SEB; 4 hành động WARN / LOCK / RESTART / AUTO_SUBMIT; màn Live qua SSE.
  - **Camera AI** (MediaPipe FaceLandmarker + EfficientDet, chạy trên trình duyệt; `src/lib/proctor/camera-rules.ts`, `camera-detector.ts`, `src/hooks/useCameraProctor.ts`): tự hiệu chỉnh tư thế "nhìn màn hình" của từng học sinh trong 3 giây đầu; quay đầu > 25° / cúi > 20° trong 2,5s, không thấy mặt 3s, 2 người 1,5s, điện thoại (điểm ≥ 0,35, 2 lần liên tiếp); cảnh báo toast cho học sinh; `?camdebug=1` hiện góc đầu và điểm điện thoại.
- **Google Drive:** Drive dùng chung (admin) và Drive riêng giáo viên, `STORAGE_DRIVER=drive`, backup lên Drive, nhập từ Drive (Picker), tự động backup, hàng đợi xoá. Tài liệu: `docs/GOOGLE_DRIVE.md`.
- **Giao diện:** sáng/tối, song ngữ VI/EN (`messages/vi.ts`, `messages/en.ts`, `useI18n()` / `getI18n()`, `tr("vi", "en")`); **dùng tốt trên điện thoại** (menu ☰, safe-area iPhone, ô nhập 16px chống zoom iOS); cài được như app (`src/app/manifest.ts`, `icon.tsx`, `apple-icon.tsx`). Khung chung các vai trò: `src/components/layout/RoleShell.tsx` + `AppNavbar.tsx`.
- **Khác:** thông báo trong app, trang quyền riêng tư `/privacy`, đăng nhập có giới hạn số lần (rate limit).
- **Lưu file:** `StorageProvider` (`src/lib/storage/`) driver `local` / `s3` / `drive`; file chỉ tải qua `/api/files/[...key]`, có kiểm tra quyền.
- **Deploy (production `https://lms.thaituan.site`):** Docker (`Dockerfile`, `compose.production.yml`) trên server riêng, Cloudflare Tunnel. Cron chạy `scripts/auto-deploy.sh` mỗi phút: **tự pull nhánh `main`**, backup DB, build, chạy migration, rollback image nếu app không healthy.

Trạng thái ngày 24/11/2026: `pnpm typecheck` 0 lỗi, `pnpm lint` 0 cảnh báo, `pnpm test` 88/88.

---

## 2. Quy ước bắt buộc (áp dụng cho mọi Phase)

- TypeScript strict. Không dùng `any` trừ khi có comment giải thích lý do.
- Logic nghiệp vụ đặt trong `src/server/*Service.ts`. Route và Server Action chỉ làm 3 việc: validate bằng zod, kiểm tra quyền, gọi service.
- Mọi chữ hiển thị đều có **cả tiếng Việt và tiếng Anh**: `m.*` từ `messages/vi.ts` + `messages/en.ts` (thêm key vào cả 2 file), hoặc `tr("…", "…")`. Thông báo lỗi API bằng tiếng Việt phải thêm bản dịch vào `src/lib/i18n/api-errors.ts`.
- Màu sắc: dùng các class màu đã có. Thêm màu mới thì phải thêm bản tối trong `src/app/globals.css` (mục "Dark mode").
- **Điện thoại:** mọi trang mới phải dùng được ở bề ngang 375px, không cuộn ngang; nút bấm ≥ 40px.
- **Hộp thoại xác nhận:** dùng `Dialog` (`src/components/ui/dialog.tsx`), **không dùng `window.confirm` / `alert`** (chặn trình duyệt tự động khi test). Hành động nguy hiểm (xoá, đóng lớp…) bắt gõ lại tên/email để xác nhận.
- **Migration Prisma:** đặt tên rõ ràng; field mới phải có default hợp lệ cho dữ liệu cũ. Migration phải **tương thích ngược** (deploy rollback app chứ không rollback DB): không xoá/đổi tên cột đang dùng trong cùng một lần deploy. Cập nhật `prisma/seed.ts`.
- **Không chạy `pnpm build` khi `pnpm dev` đang chạy** (chung thư mục `.next`). Muốn kiểm tra build thì dùng `pnpm build:check`.
- Mỗi Phase chạy đủ: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`. **Commit git sau mỗi Phase.**
- **KHÔNG push lên `main`** khi Claude chưa review: server tự deploy mọi commit trên `main` trong vòng 1 phút. Làm trên nhánh `gemini/phase-XX`, hoặc commit local rồi để Claude kiểm tra và push.
- Không commit `.env*` (trừ `.env.example`), secret, hay thư mục `file word test/`. Biến môi trường mới thêm vào `.env.example` kèm comment.

### Checklist bảo mật (Claude dùng để review sau mỗi Phase)
1. Không lộ đáp án (`answerKey`, `gradingOpts`, `explanation`) cho học sinh khi chưa được phép xem. Kiểm tra cả network response.
2. Kiểm tra quyền ở **mọi** endpoint (chống IDOR: thử đổi id lớp / bài / bài nộp / file / tài khoản sang của người khác). Admin được phép xem mọi thứ; giáo viên chỉ lớp của mình.
3. Không sửa được bài sau khi nộp hoặc hết giờ. Đồng hồ tính theo giờ server.
4. Upload kiểm tra loại file (magic bytes) và dung lượng. File không bao giờ public mặc định.
5. Phụ huynh chỉ thấy dữ liệu của con mình. Cài đặt ẩn danh / thời điểm hiện bảng xếp hạng / công bố điểm áp dụng ở server.
6. Token OAuth, secret, mã 2FA lưu ở dạng **mã hoá** hoặc hash; không ghi ra log, không trả về client.
7. Tài khoản trong thùng rác (`deletedAt != null`) không đăng nhập được và không xuất hiện trong danh sách chọn (lớp, liên kết phụ huynh, giao bài…).

---

## 3. Quy trình sau mỗi Phase: review → deploy → dọn dẹp

**Gemini (người viết code) làm:**
1. Làm trên nhánh `gemini/phase-XX` (tạo từ `main` mới nhất). Commit theo từng phần nhỏ, message rõ ràng.
2. Chạy đủ `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build:check`; ghi kết quả vào mục "Tiến độ".
3. Nếu có migration: ghi rõ tên migration và nó có tương thích ngược không.
4. **Dừng ở đây.** Không merge, không push lên `main`, không SSH vào server.

**Claude (review & deploy) làm:**
1. Review diff theo checklist bảo mật ở mục 2; test giao diện bằng trình duyệt: 4 vai trò, sáng/tối, VI/EN, khung điện thoại 375px.
2. Sửa lỗi tìm được (commit riêng trên cùng nhánh), rồi merge nhánh vào `main` bằng fast-forward và push.
3. Theo dõi deploy tự động: `ssh bluenip@100.71.200.54 'tail -f ~/apps/engclass/.deploy/cron.log'` cho tới khi thấy `Deployed <commit>; app is healthy`. Nếu thấy `Deployment failed` thì server đã tự quay về image cũ: đọc log, sửa, push lại. **Database không tự quay lại**, nên migration lỗi phải sửa bằng migration mới (hoặc khôi phục từ `~/apps/engclass/.deploy/backups/` sau khi xem xét kỹ).
4. Kiểm tra production: `https://lms.thaituan.site/login` trả 200, số migration đã chạy đúng (`docker compose ... exec app node_modules/.bin/prisma migrate status`). **Không seed dữ liệu mẫu trên production.**
5. **Kiểm tra giao diện đủ 4 vai trò** (Admin, Giáo viên, Học sinh, Phụ huynh) ở mỗi lần review, mỗi vai trò xem các trang liên quan tới Phase vừa làm, ở sáng/tối, VI/EN và khung điện thoại:
   - **Local (`localhost:3000`):** đăng nhập bằng tài khoản seed (mật khẩu chung trong `prisma/seed.ts`).
   - **Production:** **không ghi mật khẩu vào repo** (repo công khai). Claude không tự đăng nhập production bằng mật khẩu; chủ dự án tự đăng nhập sẵn 4 tài khoản test trong trình duyệt (mỗi vai trò một Chrome profile, hoặc lần lượt từng tài khoản khi Claude yêu cầu), Claude dùng các phiên đã đăng nhập đó để kiểm tra.

**Dọn dẹp sau khi deploy xong:**
- **Máy local:** dừng `pnpm dev`; `podman stop engclass-postgres`; xoá `.next`, `.next-build`, `test-results`, `playwright-report`, `tsconfig.tsbuildinfo` và các script/ảnh test tạm. **Giữ lại** `node_modules`, dữ liệu Postgres local và thư mục `file word test/`. Xoá dữ liệu test tạo trong lúc kiểm tra (tài khoản, bài, worksheet thử) hoặc trả lại giá trị cũ.
- **Git:** xoá nhánh `gemini/phase-XX` đã merge (local và remote). `git status` phải sạch (trừ `file word test/`).
- **Trình duyệt:** đóng các tab đã mở để test.
- **Server:** script deploy đã tự giữ 3 bản backup DB mới nhất và 2 image app mới nhất. Không chạy `docker system prune` toàn máy (server còn chạy dự án khác).

---

## Phase 13 — Quản trị & vận hành

1. **Chuyển quyền sở hữu:**
   - Admin chuyển **lớp** và/hoặc **worksheet** của một giáo viên sang giáo viên khác (chọn từng mục hoặc "chuyển tất cả").
   - Đặt ở trang `/admin` (nút "Chuyển dữ liệu" trên dòng giáo viên) và gợi ý trong thông báo lỗi khi đổi vai trò / xoá giáo viên còn dữ liệu (`ROLE_HAS_CONTENT`).
   - Chuyển lớp thì bài đã giao, bài nộp, bài giảng đi theo lớp. File trên Drive giữ nguyên chỗ cũ (chỉ đổi `ownerId` trong DB).
   - Có xác nhận bằng Dialog và ghi vào nhật ký (mục 2).
2. **Nhật ký hoạt động (audit log):**
   - Model `AuditLog { id, actorId, action, targetType, targetId, summary, meta Json, createdAt }`.
   - Ghi khi: tạo / xoá / khôi phục / xoá vĩnh viễn tài khoản, đổi vai trò, khoá / mở, reset mật khẩu, chuyển quyền sở hữu, sửa bài đã giao, lưu trữ / xoá lớp, xoá worksheet.
   - Trang `/admin/audit`: lọc theo người làm, loại hành động, khoảng ngày; phân trang. Chỉ admin xem.
   - Không ghi mật khẩu hay token vào `meta`.
3. **Admin tạo tài khoản hàng loạt từ Excel:** tải file mẫu, cột (họ tên, email, vai trò, lớp tuỳ chọn, mật khẩu tuỳ chọn). Xem trước, báo lỗi từng dòng (email trùng, email đang ở thùng rác, vai trò sai), rồi mới tạo. Xuất file Excel danh sách mật khẩu tạm vừa sinh (chỉ tải được một lần).
4. **Đăng nhập 2 bước (TOTP) cho admin:** bật ở `/account` (QR + mã dự phòng). Khi đã bật thì đăng nhập phải nhập mã 6 số. Secret TOTP mã hoá bằng key trong env.
5. **Theo dõi lỗi & cảnh báo vận hành:**
   - Ghi lỗi server và client vào bảng `ErrorLog` (hoặc Sentry nếu có `SENTRY_DSN`), trang `/admin/errors` xem 100 lỗi gần nhất.
   - `scripts/auto-deploy.sh`: khi deploy thất bại / rollback thì tạo thông báo cho mọi admin (ghi một dòng vào DB qua `docker compose exec`, hoặc gọi một endpoint nội bộ có token).
   - Script `scripts/verify-backup.sh`: khôi phục bản backup DB mới nhất vào một container Postgres tạm, đếm số bản ghi các bảng chính, rồi xoá container. Ghi hướng dẫn chạy hằng tuần vào `README.md`.
   - **Dọn dẹp tự động trong `scripts/auto-deploy.sh`** (sau khi deploy thành công):
     - Xoá build cache Docker cũ hơn 7 ngày: `docker builder prune -f --filter until=168h` (hiện cache chiếm ~66 GB). Chỉ dọn cache, không xoá image của dự án khác.
     - Xoá image `engclass-app` lơ lửng (dangling) do build lỗi để lại.
     - Cắt `~/apps/engclass/.deploy/cron.log` khi lớn hơn 5 MB (giữ 2.000 dòng cuối).

**Tiêu chí hoàn thành:** chuyển toàn bộ lớp + worksheet của giáo viên A sang B rồi hạ quyền A thành công; mọi hành động ở mục 2 hiện trong `/admin/audit`; import 30 tài khoản từ Excel có 3 dòng lỗi được báo đúng dòng; admin bật 2FA và đăng nhập lại phải nhập mã; test IDOR cho mọi API mới.

---

## Phase 14 — Giao bài linh hoạt

1. **Ngoại lệ cho từng học sinh:**
   - Model `AssignmentOverride { assignmentId, studentId, extraAttempts, dueAt?, timeLimitMin? }`.
   - Trang chấm / báo cáo bài: nút "Cho thêm lượt" và "Gia hạn riêng" trên dòng học sinh. Học sinh nhận thông báo.
   - Mọi chỗ kiểm tra số lượt, hạn nộp, thời gian (`submissionService`, trang làm bài, danh sách bài của học sinh) phải dùng giá trị sau khi áp ngoại lệ.
2. **Giao cho một nhóm học sinh:** khi giao bài có thể chọn "Cả lớp" hoặc một số học sinh (model `AssignmentTarget { assignmentId, studentId }`; không có bản ghi = cả lớp). Học sinh ngoài nhóm không thấy bài; thống kê "Đã nộp x/y" tính theo nhóm.
3. **Nhắc hạn nộp:** job trong `src/instrumentation.ts` mỗi giờ: học sinh chưa nộp và còn ≤ 24 giờ thì nhận thông báo (mỗi bài chỉ nhắc 1 lần, lưu dấu để không nhắc lại). Giáo viên tắt được trong cài đặt bài.
4. **Ngân hàng nhận xét & rubric:**
   - Giáo viên lưu câu nhận xét hay dùng, bấm chèn nhanh khi chấm.
   - Rubric cho câu tự luận: các tiêu chí (ví dụ Grammar 0–3, Vocabulary 0–3, Coherence 0–4), tổng điểm tự cộng vào điểm câu; học sinh xem được bảng rubric khi được công bố điểm.

**Tiêu chí hoàn thành:** học sinh A được thêm 1 lượt và gia hạn riêng làm được bài trong khi học sinh B thì không; bài giao cho 3 học sinh không hiện với học sinh khác; job nhắc hạn có unit test (giờ giả lập); chấm 1 bài tự luận bằng rubric.

---

## Phase 15 — Camera AI nâng cao

1. **Trang "Thử camera" cho giáo viên** (`/teacher/settings/camera-test`): mở camera của chính giáo viên, hiện trực tiếp số khuôn mặt, góc quay / cúi (sau hiệu chỉnh), điểm điện thoại, và log các sự kiện sẽ bị ghi; dùng đúng `useCameraProctor` + `CameraRulesEngine` như khi thi.
2. **Độ nhạy theo từng bài:** thêm vào cài đặt giao bài (và form sửa bài): mức "Nhẹ / Vừa / Chặt" (bộ số có sẵn cho `CameraRuleConfig`), và lựa chọn sự kiện nào **tính là vi phạm** (hiện `CAMERA_LOOK_AWAY` luôn chỉ là "nghi vấn", xem `src/server/proctorService.ts`). Lưu trong `Assignment` (ví dụ `cameraSensitivity`, `cameraCountLookAway`), áp dụng ở server.
3. **Phát hiện mắt liếc:** dùng điểm mống mắt (iris landmarks 468–477) để ước lượng hướng nhìn; thêm sự kiện `CAMERA_GAZE_AWAY` (nghi vấn) khi liếc sang bên quá ngưỡng trong 3s. Có unit test cho hàm ước lượng.
4. **Phát hiện tiếng nói (tuỳ chọn theo bài):** dùng Web Audio (`AnalyserNode`) đo mức âm lượng giọng nói kéo dài; sự kiện `MIC_VOICE` (nghi vấn). **Không ghi âm, không gửi âm thanh lên server**; xin quyền micro rõ ràng ở trang quy chế thi.
5. **Dòng thời gian vi phạm có ảnh:** trong báo cáo từng bài nộp, hiện các sự kiện theo thời gian kèm ảnh chụp (đã có `cameraSnapshots`), bấm ảnh để phóng to; lọc theo loại sự kiện.
6. **Điện thoại làm bài:** trên mobile không có toàn màn hình như máy tính. Thay bằng: phát hiện rời app / khoá màn hình (`visibilitychange`, `pagehide`) và thông báo rõ cho học sinh ở trang quy chế; camera AI vẫn chạy được trên điện thoại (camera trước).

**Tiêu chí hoàn thành:** giáo viên thấy số liệu trực tiếp ở trang thử camera; đổi mức độ nhạy làm thay đổi ngưỡng (unit test); `CAMERA_GAZE_AWAY` và `MIC_VOICE` có test với dữ liệu giả; e2e dùng `window.__engclassCameraMock` kiểm tra dòng thời gian vi phạm.

---

## Phase 16 — Thêm dạng câu hỏi (so với TopWorksheets)

TopWorksheets có: Written answer, Dropdown, **Join**, Checkbox, **Highlight**, **Drag & drop**, **Wordsearch**, **Draw**, **Speech to text**, **Voice answer**, **Image answer**, **Fill on image**. EngClass còn thiếu các dạng in đậm. Làm theo thứ tự ưu tiên dưới đây.

Với **mỗi** dạng mới phải có:
- Giá trị mới trong enum `FieldType`.
- Định dạng `answerKey` và hàm chấm thuần trong `src/lib/grading/` kèm unit test.
- Editor: vẽ được ô trên PDF (overlay) và/hoặc thêm vào phiếu trả lời.
- Giao diện học sinh dùng được trên mobile 375px (chạm thay cho kéo).
- Hiển thị kết quả và đáp án (tuân theo `revealKey`).
- Hỗ trợ trong Backup/Export và xuất Word.
- Seed 1 worksheet mẫu.

1. **`MATCH` — Nối cột (Join):** các điểm neo `{ id, side: "L" | "R", x, y }` trên PDF; học sinh kéo đường nối (mobile: chạm trái rồi chạm phải). `answerKey: { pairs: [["L1", "R3"], …] }`; chấm theo số cặp đúng, có tuỳ chọn "đúng hết mới có điểm".
2. **`DRAG_DROP` — Kéo thả:** ngân hàng thẻ (chữ hoặc ảnh) và các ô đích trên PDF. `answerKey: { slots: { slotId: ["tokenId"] } }`; tuỳ chọn mỗi thẻ dùng 1 lần.
3. **`SPEAKING` — Nói (Speech to text):** Web Speech API (`en-US` / `en-GB`); trình duyệt không hỗ trợ thì cho gõ thay. Chấm bằng khoảng cách từ của `src/lib/grading/dictation.ts`. Số lần thử mặc định 3; lưu văn bản nhận dạng và (tuỳ chọn) file ghi âm.
4. **`VOICE_ANSWER` — Ghi âm trả lời:** `MediaRecorder` (webm / opus), giới hạn thời lượng, lưu qua `StorageProvider` (riêng tư). Chấm tay; giáo viên nghe ngay trong modal chấm.
5. **`IMAGE_ANSWER` — Nộp ảnh / file:** tối đa N ảnh; nén ở client (cạnh dài ≤ 2000px, JPEG 0.8); kiểm tra magic bytes. Chấm tay; giáo viên **vẽ / ghi chú lên ảnh** (lớp chú thích riêng, không ghi đè ảnh gốc).
6. **`HIGHLIGHT` — Tô chọn từ** trong đoạn văn (phiếu trả lời). `answerKey: { tokens: [indices] }`; chấm thành phần, trừ điểm khi tô sai.
7. **`ORDERING` — Sắp xếp thứ tự** câu hoặc từ. Chấm theo vị trí đúng hoặc theo LCS.
8. **`WORDSEARCH` — Tìm chữ:** sinh lưới từ danh sách từ, lưu seed để lưới không đổi. Chấm theo số từ tìm được.
9. **`DRAW` — Vẽ** trên vùng ô (canvas, lưu PNG). Chấm tay.
10. **Worksheet từ ảnh (Fill on image):** tải JPG / PNG / WebP làm nền thay PDF; mỗi ảnh = 1 trang; editor và overlay giữ nguyên.
11. **Gợi ý ô trống tự động:** khi upload PDF, dùng `pdfjs getTextContent()` tìm `____`, `[   ]`, `( … )` và đề xuất ô `TEXT` / `CHECKBOX` đúng vị trí; "Chấp nhận tất cả" hoặc chọn từng ô.

**Tiêu chí hoàn thành:** mỗi dạng câu có unit test chấm điểm và 1 kịch bản e2e (giáo viên tạo → học sinh làm → giáo viên xem kết quả); không lộ `answerKey`; đúng ở sáng/tối, VI/EN và trên điện thoại.

---

## Phase 17 — Workbook, trả bài & trợ giảng

1. **Workbook (sổ bài tập):** `Workbook { id, ownerId, title, description }`, `WorkbookItem { workbookId, worksheetId, order }`.
   - Giao workbook cho lớp: tạo assignment cho từng worksheet, dùng chung cài đặt; tuỳ chọn mở dần (bài sau mở khi đã nộp bài trước).
   - **Bảng kết quả workbook:** hàng = học sinh, cột = worksheet; ô hiện điểm (`10 / 10`, "Chờ chấm", hoặc trống); lọc, xuất Excel.
2. **Trả bài & yêu cầu làm lại:** trạng thái bài nộp mới `RETURNED`. Giáo viên nhận xét rồi "Trả bài" → học sinh được sửa và **nộp lại** (không tính thêm lượt); lưu lịch sử các lần nộp.
3. **Tab "Bài nộp" của lớp:** mọi bài nộp; lọc theo bài, học sinh, trạng thái ("Chờ chấm", "Đã trả", "Đã chấm"); chấm hàng loạt.
4. **Đồng giáo viên / trợ giảng:** `ClassTeacher { classId, userId, role: "OWNER" | "CO_TEACHER" | "ASSISTANT" }`.
   - `CO_TEACHER`: như chủ lớp nhưng không xoá / lưu trữ lớp. `ASSISTANT`: chỉ chấm bài và điểm danh.
   - Sửa `requireTeacherOfClass`, `requireTeacherOfAssignment` và mọi chỗ đang so `cls.teacherId === user.id` (kể cả danh sách lớp / bài / worksheet ở `/teacher`).
5. **Thống kê lớp:** điểm trung bình theo tuần, tỉ lệ nộp, học sinh chưa nộp nhiều nhất.

**Tiêu chí hoàn thành:** giao 1 workbook 5 bài, thấy bảng ma trận kết quả; trả 1 bài và học sinh nộp lại được; trợ giảng chấm được nhưng không xoá được lớp; test IDOR cho API mới.

---

## Phase 18 — Bài nộp ảnh / file & điểm offline (so với Dạy Mãi)

1. **Bài tập "theo sách / file có sẵn":** giáo viên giao một đề (PDF, ảnh hoặc chỉ mô tả "Làm bài 3 trang 45 SGK"); học sinh **chụp ảnh bài làm trên giấy** và nộp (dùng luồng `IMAGE_ANSWER` của Phase 16). Giáo viên chấm bằng ghi chú lên ảnh, cho điểm và nhận xét.
2. **Nhập điểm offline:** nhập điểm bài kiểm tra trên giấy cho cả lớp (bảng hoặc import Excel); tính vào báo cáo và cổng phụ huynh.
3. **Sổ điểm lớp:** gộp điểm online + offline + tỉ lệ nộp bài + (sau Phase 20) chuyên cần; xuất Excel / PDF theo tháng hoặc theo kỳ.

**Tiêu chí hoàn thành:** học sinh nộp 3 ảnh từ điện thoại, giáo viên chấm có chú thích và học sinh xem lại được; điểm offline hiện trên trang phụ huynh.

---

## Phase 19 — Ngân hàng câu hỏi & tổ chức kỳ thi

1. **Ngân hàng câu hỏi:** `QuestionBankItem { id, ownerId, type, prompt, options, answerKey, explanation, skillTag, level (A1–C2 hoặc lớp 1–12), difficulty (1–5), tags[], audioKey?, imageKey? }`. Lưu câu từ phiếu trả lời vào ngân hàng; tìm và lọc theo tag, kỹ năng, độ khó; chia sẻ giữa giáo viên.
2. **Tạo đề từ ma trận:** ví dụ "10 câu Grammar độ khó 2, 5 câu Reading độ khó 3" → bốc câu ngẫu nhiên thành worksheet dạng phiếu trả lời.
3. **Nhiều mã đề:** trộn thứ tự câu và đáp án thành N mã; học sinh nhận ngẫu nhiên một mã; thống kê gộp theo câu gốc.
4. **Kỳ thi nhiều lớp:** một kỳ thi cho nhiều lớp cùng lúc, dùng chế độ chống gian lận đã có; màn Live gộp các lớp; báo cáo theo lớp và toàn kỳ thi.

**Tiêu chí hoàn thành:** tạo đề 20 câu từ ma trận, sinh 4 mã đề, 2 lớp thi cùng lúc, thống kê đúng theo câu gốc.

---

## Phase 20 — Lịch dạy, buổi học & điểm danh (so với Dạy Mãi)

1. **Thời khoá biểu lớp:** buổi lặp lại hằng tuần (ví dụ T2 và T6, 18:00–19:30); trang "Lịch dạy" xem theo tuần / tháng; đổi buổi, thêm buổi bù.
2. **Buổi học:** link học online (Google Meet / Zoom do giáo viên tự dán; **không** tích hợp Zoom bản quyền); đính kèm tài liệu và bài tập của buổi.
3. **Điểm danh:** có mặt / vắng có phép / vắng không phép / đi muộn; thông báo phụ huynh khi vắng; báo cáo chuyên cần theo tháng.

**Tiêu chí hoàn thành:** tạo lịch cho 1 lớp, điểm danh 1 buổi, phụ huynh nhận thông báo vắng; sổ điểm ở Phase 18 có thêm cột chuyên cần.

---

## Phase 21 — Học sinh, phụ huynh & thông báo

1. **Ôn câu sai:** trang "Câu mình hay sai" của học sinh gom các câu đã trả lời sai (chỉ những bài đã được công bố đáp án); nút "Luyện lại" tạo phiên luyện tập không tính điểm.
2. **Động lực học:** chuỗi ngày làm bài (streak) và huy hiệu đơn giản (nộp đúng hạn 5 lần, điểm tuyệt đối…); hiện ở dashboard học sinh; giáo viên tắt được theo lớp.
3. **Báo cáo tuần cho phụ huynh:** mỗi Chủ nhật tạo bản tóm tắt (điểm, bài chưa nộp, vi phạm nếu `shareProctorWithParent`, chuyên cần) gửi dạng thông báo trong app (và email nếu bật mục 5).
4. **Nhắn tin giáo viên – phụ huynh:** hội thoại 1-1 theo từng học sinh; chỉ giáo viên của lớp và phụ huynh đã liên kết; có báo chưa đọc.
5. **Thông báo ngoài app:**
   - **Web push** (VAPID, service worker) cho điện thoại và máy tính; người dùng bật/tắt ở `/account`.
   - **Email** (SMTP qua biến môi trường) cho: bài mới, sắp hết hạn, reset mật khẩu, báo cáo tuần. Người dùng chọn loại muốn nhận.

**Tiêu chí hoàn thành:** học sinh luyện lại câu sai không ảnh hưởng điểm; phụ huynh nhận báo cáo tuần; nhắn tin không đọc được hội thoại của người khác (test IDOR); web push hoạt động trên Chrome Android và Safari iOS (đã cài vào màn hình chính).

---

## Phase 22 — Thư viện, AI & quản lý worksheet

1. **Thư mục & tag cho worksheet:** giáo viên xếp worksheet vào thư mục (Unit, khối lớp…), gắn tag, tìm kiếm và lọc trong "Kho của tôi".
2. **Lịch sử phiên bản worksheet:** lưu bản chụp khi giáo viên bấm "Lưu phiên bản" hoặc trước mỗi lần giao bài; xem và khôi phục bản cũ (không ảnh hưởng bài nộp đã có).
3. **Thư viện công khai:** "Công khai" một worksheet → hiện ở trang "Khám phá" (tìm theo trình độ, chủ đề, kỹ năng, dạng câu); giáo viên khác "Dùng bài này" để clone. Không lộ `answerKey` ở trang xem trước; có nút báo cáo vi phạm, admin duyệt và ẩn bài.
4. **Yêu thích & theo dõi giáo viên;** hồ sơ công khai của giáo viên (danh sách worksheet công khai).
5. **AI tạo câu hỏi** (Gemini API, biến `GEMINI_API_KEY`): từ một đoạn văn hoặc trang PDF sinh trắc nghiệm, câu hỏi mở, điền từ, wordsearch; giáo viên **xem lại và sửa trước khi lưu** vào phiếu hoặc ngân hàng câu hỏi; giới hạn lượt / ngày / giáo viên; không gửi dữ liệu học sinh lên AI.
6. **Giao bài bằng link (lớp mở):** link làm bài không cần tài khoản, học sinh nhập tên trước khi làm; chỉ cho bài luyện tập, tắt chống gian lận, không tính vào bảng xếp hạng lớp.

**Tiêu chí hoàn thành:** khôi phục được phiên bản cũ của worksheet; worksheet công khai clone được mà không lộ đáp án; AI sinh 10 câu từ một đoạn văn và giáo viên sửa trước khi lưu (test với API được mock).

---

## Ngoài phạm vi (chưa làm, chỉ ghi lại)
App mobile native, thanh toán / học phí, bán bài giảng, website cá nhân cho giáo viên, tích hợp Zoom bản quyền, biên tập video bằng AI, "gia sư AI" cho học sinh, chứng chỉ, tích hợp Google Classroom / Microsoft Teams, import từ Liveworksheets.

---

## Tiến độ

_(Agent ghi vào đây sau mỗi Phase: đã làm gì, còn thiếu gì, quyết định nào khác plan và lý do, kết quả `lint / typecheck / test / test:e2e`, commit hash, tên nhánh.)_

### Phase 13 — Quản trị & vận hành (24/11/2026)

- **Nhánh:** `gemini/phase-13` (tạo từ `main` tại `7d199af`, chưa merge/chưa push lên `main`).
- **Commits:** `8fb2631` → `af4351e` → `0a4d36d` → `c8111a7` → `c9928d4` → `c9681e4` → `bb45221` (+ commit cập nhật `PLAN.md`).
- **Migration Prisma:** `20261124155121_phase13_admin_ops` — **tương thích ngược 100%** (chỉ thêm giá trị enum `NotificationType.SYSTEM_ALERT`, thêm các cột nullable / có default `false` trên `User` cho TOTP, và tạo 3 bảng mới `AuditLog`, `ErrorLog`, `OneTimeExport`; không xoá hay đổi tên cột cũ).
- **Đã làm:**
  1. **Chuyển quyền sở hữu:** `getUserOwnedContent` + `transferOwnership` trong `src/server/adminService.ts`, API `GET /api/admin/users/[id]/owned-content` và `POST /api/admin/users/[id]/transfer` (chỉ Admin, loại trừ tài khoản trong thùng rác khỏi danh sách nhận), `TransferOwnershipDialog` chọn từng lớp/worksheet hoặc "Chuyển tất cả" với bước xác nhận Dialog; cập nhật `DriveFile.ownerId` / `DriveUpload.ownerId` trong DB mà không di chuyển file Drive; thay `window.confirm` khi đổi vai trò ở `/admin` bằng Dialog và gắn nút chuyển dữ liệu trực tiếp khi gặp `ROLE_HAS_CONTENT` cũng như trong `DeleteAccountDialog`.
  2. **Nhật ký hoạt động (Audit Log):** `src/server/auditService.ts` (có `sanitizeAuditMeta` tự động lọc bỏ mọi key chứa `password/secret/token/hash/totp/backupCode`), API `GET /api/admin/audit` (chỉ Admin), trang `/admin/audit` lọc theo người thực hiện, hành động, khoảng ngày, từ khoá và phân trang; đã gắn ghi log cho đủ các hành động: tạo / nhập hàng loạt / xoá vào thùng rác / khôi phục / xoá vĩnh viễn tài khoản, đổi vai trò, khoá / mở, đặt lại mật khẩu, chuyển quyền sở hữu, sửa bài đã giao, lưu trữ / mở lại / xoá lớp, xoá worksheet, bật / tắt 2FA.
  3. **Nhập tài khoản hàng loạt từ Excel:** `src/server/bulkImportService.ts`, API `/api/admin/users/bulk-import/{template,preview,commit,credentials/[id]}` (kiểm tra magic bytes `.xlsx` & dung lượng ≤ 5MB), UI `BulkImportUsersCard` trên `/admin`: tải file mẫu, xem trước báo lỗi chính xác từng dòng (trùng email trong DB, trùng trong file, email ở thùng rác, vai trò sai, mật khẩu ngắn, lớp không tồn tại), tạo tài khoản hàng loạt, xuất Excel mật khẩu tạm mã hoá AES-256-GCM trong bảng `OneTimeExport` chỉ tải được **1 lần duy nhất** (xác nhận nguyên tử, xoá payload ngay sau khi tải, trả `410` ở lần tải thứ 2, chặn IDOR giữa các admin).
  4. **Đăng nhập 2 bước (TOTP) cho Admin:** triển khai thuần RFC 4226/6238 trong `src/lib/totp.ts` + QR nội bộ (`qrcode`) + `src/lib/crypto-secrets.ts` (AES-256-GCM) + `src/server/totpService.ts` + API `/api/account/totp/*` (chỉ Admin); quản lý bật/tắt/tạo lại mã dự phòng tại `/account` (`AdminTotpSection`), luồng đăng nhập 2 bước trên `/login` + `src/lib/auth.ts` (hỗ trợ mã 6 số có chống replay theo `totpLastStep` và 8 mã dự phòng dùng 1 lần lưu dạng hash `scrypt`).
  5. **Theo dõi lỗi & vận hành:**
     - `src/server/errorLogService.ts`, bắt lỗi server trong `handleApiError` và `onRequestError` (`src/instrumentation.ts`), bắt lỗi client qua `ErrorReporter` + `src/app/error.tsx` → `POST /api/errors/client` (có rate limit), tùy chọn chuyển tiếp Sentry qua `SENTRY_DSN`, trang `/admin/errors` xem 100 lỗi gần nhất.
     - `scripts/auto-deploy.sh`: ghi thông báo `Notification` trực tiếp vào Postgres cho mọi admin đang hoạt động khi deploy thất bại/rollback; thêm dọn dẹp sau deploy thành công (`docker builder prune -f --filter until=168h`, xoá dangling image có label `org.engclass.app=engclass-app`, cắt `cron.log` giữ 2.000 dòng cuối khi > 5 MB).
     - `scripts/verify-backup.sh` + hướng dẫn chạy hằng tuần trong `README.md` (đã chạy test khôi phục thực tế trên container Postgres 16 tạm).
  6. **Seed & i18n:** cập nhật `prisma/seed.ts` thêm dữ liệu mẫu cho `AuditLog` và `ErrorLog`; song ngữ VI/EN đầy đủ (`tr(...)` và `src/lib/i18n/api-errors.ts`), hỗ trợ dark mode và mobile 375px.
- **Quyết định khác/bổ sung so với plan & lý do:**
  - Dùng thêm bảng `OneTimeExport` (mã hoá AES-256-GCM, TTL 30 phút, claim nguyên tử) thay vì lưu RAM cho file Excel mật khẩu tạm tải 1 lần, giúp an toàn khi chạy đa tiến trình hoặc restart container và chống IDOR.
  - Mã hoá TOTP dùng `TOTP_ENCRYPTION_KEY` (khuyến nghị) và tự fallback sang khóa dẫn xuất từ `AUTH_SECRET` có gắn nhãn nguồn khóa (`v1:totp` vs `v1:auth`), nhờ đó 2FA hoạt động ngay cả khi production chưa kịp thêm `TOTP_ENCRYPTION_KEY`, và khi thêm sau cũng không làm hỏng secret đã mã hoá trước đó.
  - Bổ sung `LABEL org.engclass.app="engclass-app"` vào `Dockerfile` để `auto-deploy.sh` chỉ dọn dangling image của EngClass, tuyệt đối không ảnh hưởng dự án khác trên cùng server.
- **Còn thiếu:** Không có (đạt toàn bộ tiêu chí hoàn thành Phase 13).
- **Kết quả kiểm tra:**
  - `pnpm lint`: 0 lỗi, 0 cảnh báo.
  - `pnpm typecheck`: 0 lỗi.
  - `pnpm test`: **102/102** pass (14/14 file, gồm 9 unit test + 5 integration test mới cho Phase 13).
  - `pnpm test:e2e`: **15/15** pass (gồm 4 kịch bản E2E mới cho Phase 13: IDOR toàn bộ API mới, chuyển quyền + hạ quyền + `/admin/audit` + `/admin/errors` + mobile 375px, import Excel 30 hợp lệ + 3 dòng lỗi + tải mật khẩu tạm 1 lần, bật 2FA & đăng nhập lại bằng mã TOTP + mã dự phòng).
  - `pnpm build:check`: pass (64/64 routes).
  - `scripts/verify-backup.sh`: đã chạy kiểm thử khôi phục thực tế thành công trên Postgres 16 (`bash -n` 0 lỗi cho cả `auto-deploy.sh` và `verify-backup.sh`).
