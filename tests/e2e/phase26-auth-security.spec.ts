import crypto from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateTotp } from "../../src/lib/totp";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe.serial("Phase 26: Forgot/Reset Password E2E, Teacher 2FA Login & Session History", () => {
  const stamp = Date.now();
  const tempEmails: string[] = [];

  test.afterAll(async () => {
    if (tempEmails.length > 0) {
      const users = await prisma.user.findMany({
        where: { email: { in: tempEmails } },
        select: { id: true },
      });
      const ids = users.map((u) => u.id);
      if (ids.length > 0) {
        await prisma.passwordResetToken.deleteMany({ where: { userId: { in: ids } } });
        await prisma.loginSessionLog.deleteMany({ where: { userId: { in: ids } } });
        await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
        await prisma.user.deleteMany({ where: { id: { in: ids } } });
      }
    }
    await prisma.$disconnect();
  });

  test("Forgot password request -> token reset -> sign in with new password (375px safe)", async ({
    browser,
  }) => {
    const email = `e2e_reset_${stamp}@test.local`;
    tempEmails.push(email);
    const passwordHash = await bcrypt.hash("OldSecret123!", 10);
    const createdUser = await prisma.user.create({
      data: {
        email,
        name: "P26 Reset E2E Teacher",
        role: "TEACHER",
        passwordHash,
      },
    });

    const plainToken = crypto.randomBytes(32).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        userId: createdUser.id,
        tokenHash: crypto.createHash("sha256").update(plainToken).digest("hex"),
        expiresAt: new Date(Date.now() + 20 * 60_000),
      },
    });

    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();

    // 1. /login -> /forgot-password link
    await page.goto("/login");
    await expect(page.getByTestId("forgot-password-link")).toBeVisible();
    await page.getByTestId("forgot-password-link").click();
    await page.waitForURL(/\/forgot-password/, { timeout: 15000 });

    const overflowForgot = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2
    );
    expect(overflowForgot).toBe(false);

    await page.getByTestId("forgot-email-input").fill("teacher2@engclass.vn");
    await page.getByTestId("forgot-submit-btn").click();
    await expect(page.getByTestId("forgot-password-success")).toBeVisible({ timeout: 15000 });

    // 2. /reset-password with real valid token -> resets password & logs in cleanly
    await page.goto(`/reset-password?token=${plainToken}`);
    await page.getByTestId("reset-new-password").fill("BrandNewPass456!");
    await page.getByTestId("reset-confirm-password").fill("BrandNewPass456!");
    await page.getByTestId("reset-submit-btn").click();
    await expect(page.getByTestId("reset-password-success")).toBeVisible({ timeout: 15000 });

    await loginAs(page, email, "BrandNewPass456!");
    await expect(page).toHaveURL(/\/teacher/);

    await ctx.close();
  });

  test("Teacher enables TOTP 2FA on /account -> signs in with 2FA code -> views Session History on 375px", async ({
    browser,
  }) => {
    const email = `e2e_totp_${stamp}@test.local`;
    tempEmails.push(email);
    await prisma.user.create({
      data: {
        email,
        name: "P26 2FA Teacher",
        role: "TEACHER",
        passwordHash: await bcrypt.hash("TeacherPass123!", 10),
      },
    });

    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await loginAs(page, email, "TeacherPass123!");

    await page.goto("/account");
    await expect(page.getByTestId("admin-totp-section")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("login-sessions-section")).toBeVisible();
    await expect(page.locator('[data-testid^="login-session-row-"]').first()).toBeVisible();

    const overflowAccount = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2
    );
    expect(overflowAccount).toBe(false);

    // Enable 2FA for Teacher
    const totpCard = page.getByTestId("admin-totp-section");
    await totpCard.getByRole("button", { name: /Bật xác thực 2 bước|Enable two-factor/i }).click();
    await expect(page.getByTestId("totp-manual-key")).toBeVisible({ timeout: 10000 });
    const manualKeyText = (await page.getByTestId("totp-manual-key").textContent()) ?? "";
    const secret = manualKeyText.replace(/\s+/g, "");
    const step = Math.floor(Date.now() / 1000 / 30);
    const enableCode = generateTotp(secret, (step - 1) * 30_000);

    await page.getByTestId("totp-setup-code-input").fill(enableCode);
    await totpCard.getByRole("button", { name: /Xác nhận bật 2FA|Confirm & enable/i }).click();
    await expect(page.getByTestId("totp-backup-codes")).toBeVisible({ timeout: 10000 });

    // Open fresh context -> sign in with password -> prompted for 2FA code -> verify & enter /teacher
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await ctx2.newPage();
    await page2.goto("/login");
    await page2.fill('input[name="email"]', email);
    await page2.fill('input[name="password"]', "TeacherPass123!");
    await page2.click('button[type="submit"]');
    await expect(page2.getByTestId("login-totp-input")).toBeVisible({ timeout: 10000 });

    const loginCode = generateTotp(secret, (step + 1) * 30_000);
    await page2.getByTestId("login-totp-input").fill(loginCode);
    await page2.click('button[type="submit"]');
    await page2.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });

    await page2.goto("/account");
    await page2.getByTestId("logout-all-devices-btn").click();
    await expect(page2.getByTestId("confirm-logout-all-btn")).toBeVisible();
    await page2.keyboard.press("Escape");

    await ctx.close();
    await ctx2.close();
  });
});
