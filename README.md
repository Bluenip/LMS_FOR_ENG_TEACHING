# EngClass — Hệ thống LMS dạy tiếng Anh & Worksheet PDF tương tác

Nền tảng LMS hiện đại dành cho giáo viên, học sinh, phụ huynh và quản trị viên, nổi bật với **Worksheet PDF tương tác** (chế độ A Overlay kéo thả ô trực tiếp trên trang PDF, chế độ B Phiếu trả lời nhanh, và kết hợp A + B), **Bảng xếp hạng lớp**, **Cổng Phụ huynh**, và **Chế độ thi chống gian lận giám sát trực tiếp (SSE / Lockdown / SEB)**.

Tên hiển thị sản phẩm đổi được qua biến môi trường `NEXT_PUBLIC_APP_NAME` (mặc định: `EngClass`).

---

## Tech Stack

- **Next.js 15 (App Router) + TypeScript (strict)**
- **PostgreSQL + Prisma ORM**
- **Auth.js (NextAuth v5)** — Credentials (bcryptjs) + tuỳ chọn Google OAuth
- **Tailwind CSS + shadcn/ui** — Thiết kế theo EngClass Design System (Stitch)
- **pdfjs-dist** — Render PDF bằng `<canvas>` (lazy-load, không dùng `<iframe>`/`<embed>`)
- **react-rnd** — Vẽ, kéo và resize ô nhập liệu chuẩn hoá toạ độ `0..1`
- **zod** + **TanStack Query** + **exceljs**
- **StorageProvider** — `LocalStorageProvider` (`./uploads`) hoặc `S3StorageProvider` (S3 / R2 / MinIO) chọn qua `STORAGE_DRIVER`
- **Vitest** (unit & integration) + **Playwright** (E2E)

---

## Hướng dẫn chạy từ máy trắng

### 1. Chuẩn bị biến môi trường

```bash
cp .env.example .env
```

### 2. Khởi chạy PostgreSQL

```bash
docker compose up -d
```

*(Nếu muốn chạy kèm MinIO cho `STORAGE_DRIVER=s3`, chạy `docker compose --profile s3 up -d`.)*

### 3. Cài dependencies, migrate & seed dữ liệu mẫu

```bash
pnpm i
pnpm prisma migrate dev
pnpm db:seed
```

### 4. Chạy ứng dụng

```bash
pnpm dev
```

Mở trình duyệt tại [http://localhost:3000](http://localhost:3000).

---

## Tài khoản mẫu (sau khi chạy `pnpm db:seed`)

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

---

## Kiểm thử & Kiểm tra chất lượng

```bash
pnpm lint        # ESLint
pnpm typecheck   # TypeScript strict (tsc --noEmit)
pnpm test        # Vitest unit & integration tests
pnpm test:e2e    # Playwright E2E tests (cần cài Chromium: pnpm exec playwright install chromium)
pnpm build       # Production build
```
