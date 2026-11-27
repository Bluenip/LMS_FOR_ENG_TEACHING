import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import ExcelJS from "exceljs";
import { generateTotp } from "../../src/lib/totp";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe("Phase 13: Admin Ops, Ownership Transfer, Audit, Bulk Import, 2FA & IDOR", () => {
  const stamp = Date.now();
  const tempEmails: string[] = [];
  const tempClassIds: string[] = [];
  const tempWorksheetIds: string[] = [];
  const tempErrorMsgs: string[] = [];

  test.afterAll(async () => {
    if (tempErrorMsgs.length > 0) {
      await prisma.errorLog.deleteMany({ where: { message: { in: tempErrorMsgs } } });
    }
    await prisma.auditLog.deleteMany({
      where: { summary: { contains: String(stamp) } },
    });
    if (tempClassIds.length > 0) {
      await prisma.class.deleteMany({ where: { id: { in: tempClassIds } } });
    }
    if (tempWorksheetIds.length > 0) {
      await prisma.worksheet.deleteMany({ where: { id: { in: tempWorksheetIds } } });
    }
    if (tempEmails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: tempEmails } } });
    }
    await prisma.$disconnect();
  });

  test("IDOR: unauthenticated, teacher, and student cannot access Phase 13 admin/TOTP endpoints", async ({
    browser,
    request,
  }) => {
    const teacher1 = await prisma.user.findUniqueOrThrow({
      where: { email: "teacher1@engclass.vn" },
      select: { id: true },
    });

    // 1. Unauthenticated requests -> 401
    for (const url of [
      "/api/admin/audit",
      "/api/admin/errors",
      `/api/admin/users/${teacher1.id}/owned-content`,
      "/api/admin/users/bulk-import/template",
      "/api/account/totp",
    ]) {
      const r = await request.get(url);
      expect(r.status(), `Unauth GET ${url}`).toBe(401);
    }

    const rTransferUnauth = await request.post(`/api/admin/users/${teacher1.id}/transfer`, {
      data: { toUserId: teacher1.id, transferAll: true },
    });
    expect(rTransferUnauth.status()).toBe(401);

    // 2. Teacher gets 403 on all admin/TOTP endpoints and is redirected away from /admin/audit & /admin/errors
    const tCtx = await browser.newContext();
    const tPage = await tCtx.newPage();
    await loginAs(tPage, "teacher1@engclass.vn");

    const teacherStatuses = await tPage.evaluate(async (tid: string) => {
      const checks: Array<[string, RequestInit?]> = [
        ["/api/admin/audit"],
        ["/api/admin/errors"],
        [`/api/admin/users/${tid}/owned-content`],
        [`/api/admin/users/${tid}/transfer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toUserId: tid, transferAll: true }) }],
        ["/api/admin/users/bulk-import/template"],
        ["/api/admin/users/bulk-import/credentials/nonexistent"],
      ];
      const out: Record<string, number> = {};
      for (const [url, init] of checks) {
        const res = await fetch(url, init);
        out[url] = res.status;
      }
      return out;
    }, teacher1.id);

    for (const [url, status] of Object.entries(teacherStatuses)) {
      expect(status, `Teacher access to ${url}`).toBe(403);
    }

    await tPage.goto("/admin/audit");
    await expect(tPage).toHaveURL(/\/teacher/);
    await tPage.goto("/admin/errors");
    await expect(tPage).toHaveURL(/\/teacher/);
    await tCtx.close();

    // 3. Student also gets 403 on admin & TOTP endpoints
    const sCtx = await browser.newContext();
    const sPage = await sCtx.newPage();
    await loginAs(sPage, "student1@engclass.vn");
    const studentAuditStatus = await sPage.evaluate(async () => (await fetch("/api/admin/audit")).status);
    const studentErrorsStatus = await sPage.evaluate(async () => (await fetch("/api/admin/errors")).status);
    const studentTotpStatus = await sPage.evaluate(async () => (await fetch("/api/account/totp")).status);
    expect(studentAuditStatus).toBe(403);
    expect(studentErrorsStatus).toBe(403);
    expect(studentTotpStatus).toBe(403);
    await sCtx.close();
  });

  test("Admin transfers all content from Teacher A to B, demotes A, verifies /admin/audit, /admin/errors, and 375px mobile", async ({
    browser,
  }) => {
    const pwHash = await bcrypt.hash("password123", 10);
    const tAEmail = `e2e-p13-ta-${stamp}@test.vn`;
    const tBEmail = `e2e-p13-tb-${stamp}@test.vn`;
    tempEmails.push(tAEmail, tBEmail);

    const tA = await prisma.user.create({
      data: { name: `GV Nguon ${stamp}`, email: tAEmail, role: "TEACHER", passwordHash: pwHash },
    });
    const tB = await prisma.user.create({
      data: { name: `GV Nhan ${stamp}`, email: tBEmail, role: "TEACHER", passwordHash: pwHash },
    });
    const cls = await prisma.class.create({
      data: {
        name: `Lop Chuyen ${stamp}`,
        joinCode: `T${String(stamp).slice(-5)}`,
        teacherId: tA.id,
      },
    });
    const ws = await prisma.worksheet.create({
      data: { ownerId: tA.id, title: `WS Chuyen ${stamp}` },
    });
    tempClassIds.push(cls.id);
    tempWorksheetIds.push(ws.id);

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await loginAs(page, "admin@engclass.vn");
    await page.goto("/admin");

    // Search for Teacher A to isolate the row
    await page.fill('input[placeholder*="Tìm tên"]', tAEmail);
    const row = page.locator("tbody tr", { hasText: tAEmail });
    await expect(row).toBeVisible();

    // Attempting to demote A before transfer triggers ROLE_HAS_CONTENT dialog with transfer shortcut
    await row.locator("select").selectOption("STUDENT");
    await page.getByRole("button", { name: "Xác nhận" }).click();
    await expect(page.getByText(/đang sở hữu 1 lớp học và 1 bài tập/i)).toBeVisible();

    // Click "Chuyển dữ liệu ngay" inside the dialog -> opens TransferOwnershipDialog
    await page.getByRole("button", { name: "Chuyển dữ liệu ngay" }).click();
    await page.locator("#transfer-recipient").selectOption(tB.id);
    await page.getByRole("button", { name: "Tiếp tục xác nhận" }).click();
    await page.getByRole("button", { name: "Xác nhận chuyển" }).click();

    await expect(page.getByText(/Đã chuyển 1 lớp và 1 worksheet/)).toBeVisible({ timeout: 10000 });

    // Now demoting Teacher A to STUDENT succeeds
    await row.locator("select").selectOption("STUDENT");
    await page.getByRole("button", { name: "Xác nhận" }).click();
    await expect(page.getByText("Đã cập nhật tài khoản!")).toBeVisible({ timeout: 10000 });

    // Verify in DB
    const updatedA = await prisma.user.findUniqueOrThrow({ where: { id: tA.id } });
    expect(updatedA.role).toBe("STUDENT");
    const updatedCls = await prisma.class.findUniqueOrThrow({ where: { id: cls.id } });
    expect(updatedCls.teacherId).toBe(tB.id);
    const updatedWs = await prisma.worksheet.findUniqueOrThrow({ where: { id: ws.id } });
    expect(updatedWs.ownerId).toBe(tB.id);

    // Check /admin/audit shows BOTH OWNERSHIP_TRANSFERRED & USER_ROLE_CHANGED
    await page.goto("/admin/audit");
    await expect(page.getByText(new RegExp(`Chuyển 1 lớp và 1 worksheet.*${tAEmail}`))).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(new RegExp(`Đổi vai trò.*${tAEmail}`))).toBeVisible({
      timeout: 10000,
    });

    // Submit a client error and verify it appears in /admin/errors
    const clientErrMsg = `E2E Client Error ${stamp}`;
    tempErrorMsgs.push(clientErrMsg);
    const errResStatus = await page.evaluate(async (msg: string) => {
      const r = await fetch("/api/errors/client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, path: "/admin" }),
      });
      return r.status;
    }, clientErrMsg);
    expect(errResStatus).toBe(201);

    await page.goto("/admin/errors");
    await expect(page.getByText(clientErrMsg)).toBeVisible({ timeout: 10000 });

    // Verify mobile 375px layout has no horizontal overflow on /admin/audit and /admin/errors
    await page.setViewportSize({ width: 375, height: 812 });
    for (const path of ["/admin/audit", "/admin/errors"]) {
      await page.goto(path);
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `Horizontal overflow on ${path} at 375px`).toBeLessThanOrEqual(2);
    }

    await ctx.close();
  });

  test("Admin bulk imports 30 valid + 3 error accounts from Excel via UI and downloads temp passwords once", async ({
    browser,
  }) => {
    // Prepare a trashed user so row 12 hits EMAIL_IN_TRASH
    const pwHash = await bcrypt.hash("password123", 10);
    const trashedEmail = `e2e-p13-trashed-${stamp}@test.vn`;
    tempEmails.push(trashedEmail);
    await prisma.user.create({
      data: {
        name: "E2E Trashed",
        email: trashedEmail,
        role: "STUDENT",
        passwordHash: pwHash,
        deletedAt: new Date(),
      },
    });

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Accounts");
    sheet.addRow(["Họ tên", "Email", "Vai trò", "Lớp", "Mật khẩu"]);
    let validCount = 0;
    for (let excelRow = 2; excelRow <= 34; excelRow++) {
      if (excelRow === 5) {
        sheet.addRow(["Dup Admin", "admin@engclass.vn", "STUDENT", "", ""]);
      } else if (excelRow === 12) {
        sheet.addRow(["In Trash", trashedEmail, "STUDENT", "", ""]);
      } else if (excelRow === 25) {
        sheet.addRow(["Wrong Role", `e2e-p13-bad-${stamp}@test.vn`, "WIZARD", "", ""]);
      } else {
        validCount++;
        const em = `e2e-p13-b${validCount}-${stamp}@test.vn`;
        tempEmails.push(em);
        sheet.addRow([`E2E Bulk ${validCount}`, em, "STUDENT", "", ""]);
      }
    }
    const excelBuffer = Buffer.from(await wb.xlsx.writeBuffer());

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await loginAs(page, "admin@engclass.vn");
    await page.goto("/admin");

    const fileInput = page.locator('input[type="file"][accept*=".xlsx"]');
    await fileInput.setInputFiles({
      name: "bulk-users.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: excelBuffer,
    });

    const previewBox = page.getByTestId("bulk-import-preview");
    await expect(previewBox).toBeVisible({ timeout: 15000 });
    await expect(previewBox).toContainText("Tổng: 33");
    await expect(previewBox).toContainText("Hợp lệ: 30");
    await expect(previewBox).toContainText("Lỗi: 3");
    await expect(previewBox).toContainText("#5");
    await expect(previewBox).toContainText("#12");
    await expect(previewBox).toContainText("#25");

    // Commit via confirmation dialog
    await page.getByRole("button", { name: "Tạo 30 tài khoản hợp lệ" }).click();
    await page.getByRole("button", { name: "Xác nhận" }).click();

    const resultBox = page.getByTestId("bulk-import-result");
    await expect(resultBox).toBeVisible({ timeout: 20000 });
    await expect(resultBox).toContainText("Đã tạo 30 tài khoản");

    // Download one-time temporary passwords Excel
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Tải Excel mật khẩu tạm/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("pivora-temp-passwords.xlsx");

    // Button is now disabled after one-time download
    await expect(page.getByRole("button", { name: /Đã tải/ })).toBeDisabled();

    await ctx.close();
  });

  test("Admin enables 2FA (TOTP) in /account and must enter 6-digit code to sign in again", async ({
    browser,
  }) => {
    const pwHash = await bcrypt.hash("TotpAdminPass123!", 10);
    const admin2faEmail = `e2e-p13-2fa-${stamp}@test.vn`;
    tempEmails.push(admin2faEmail);
    await prisma.user.create({
      data: {
        name: "Admin 2FA E2E",
        email: admin2faEmail,
        role: "ADMIN",
        passwordHash: pwHash,
      },
    });

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await loginAs(page, admin2faEmail, "TotpAdminPass123!");

    // Go to /account and enable 2FA
    await page.goto("/account");
    const totpSection = page.getByTestId("admin-totp-section");
    await expect(totpSection).toBeVisible();
    await page.getByRole("button", { name: "Bật xác thực 2 bước" }).click();

    const manualKeyEl = page.getByTestId("totp-manual-key");
    await expect(manualKeyEl).toBeVisible({ timeout: 10000 });
    const manualKey = ((await manualKeyEl.textContent()) ?? "").replace(/\s+/g, "");
    expect(manualKey.length).toBeGreaterThanOrEqual(16);

    const setupCode = generateTotp(manualKey);
    await page.getByTestId("totp-setup-code-input").fill(setupCode);
    await page.getByRole("button", { name: "Xác nhận bật 2FA" }).click();

    // Backup codes displayed once
    const backupBox = page.getByTestId("totp-backup-codes");
    await expect(backupBox).toBeVisible({ timeout: 10000 });
    const firstBackupCode = (await backupBox.locator("code").first().textContent())?.trim() ?? "";
    expect(firstBackupCode).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    // Sign out
    await page.goto("/api/auth/clear-session?reason=session");
    await page.waitForURL(/\/login/);

    // Attempt to sign in with email + password -> must ask for 2FA code
    await page.fill('input[name="email"]', admin2faEmail);
    await page.fill('input[name="password"]', "TotpAdminPass123!");
    await page.click('button[type="submit"]');

    const totpInput = page.getByTestId("login-totp-input");
    await expect(totpInput).toBeVisible({ timeout: 10000 });

    // Wrong 2FA code fails
    await totpInput.fill("000000");
    await page.click('button[type="submit"]');
    await expect(page.locator('form [role="alert"]')).toContainText(/Mã xác thực 2 bước không đúng/);

    // Advance past the setup step window in DB so we verify a real 6-digit TOTP login without sleeping 30s
    await prisma.user.update({
      where: { email: admin2faEmail },
      data: { totpLastStep: Math.floor(Date.now() / 30_000) - 1 },
    });
    const loginTotpCode = generateTotp(manualKey);
    await totpInput.fill(loginTotpCode);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 20000 });

    // Sign out again and verify single-use backup code login also works
    await page.goto("/api/auth/clear-session?reason=session");
    await page.waitForURL(/\/login/);
    await page.fill('input[name="email"]', admin2faEmail);
    await page.fill('input[name="password"]', "TotpAdminPass123!");
    await page.click('button[type="submit"]');
    await expect(totpInput).toBeVisible({ timeout: 10000 });
    await totpInput.fill(firstBackupCode);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 20000 });

    await ctx.close();
  });
});
