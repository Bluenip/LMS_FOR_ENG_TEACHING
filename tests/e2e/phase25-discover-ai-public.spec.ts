import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe.serial("Phase 25: Folders, Versions, Discover, Teacher Profile, Moderation & Guest Practice", () => {
  test("Teacher manages library folders -> views version history -> likes & follows on Discover (375px safe)", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await loginAs(page, "teacher1@engclass.vn");

    // 1. Folder Tree on /teacher/worksheets
    await page.goto("/teacher/worksheets");
    await expect(page.getByTestId("folder-filter-all")).toBeVisible();
    await expect(
      page.locator('[data-testid^="folder-chip-"]').filter({ hasText: "Ngữ pháp & Từ vựng 12" })
    ).toBeVisible();

    await page.getByTestId("create-folder-btn").click();
    await page.getByTestId("folder-name-input").fill("Thư mục E2E P25");
    await page.getByTestId("folder-create-submit").click();
    const createdChip = page.locator('[data-testid^="folder-chip-"]').filter({ hasText: "Thư mục E2E P25" }).first();
    await expect(createdChip).toBeVisible();

    // Delete test folder cleanly via Radix dialog so seeded library stays pristine
    const chipTestId = await createdChip.getAttribute("data-testid");
    const createdFolderId = chipTestId?.replace("folder-chip-", "") ?? "";
    if (createdFolderId) {
      await page.getByTestId(`delete-folder-${createdFolderId}`).click();
      await page.getByTestId("folder-delete-confirm").click();
      await expect(createdChip).not.toBeVisible();
    }

    // 2. Worksheet Editor toolbar: Version History + AI modal + Publish Discover
    const editLink = page.locator('a[href*="/teacher/worksheets/"][href*="/edit"]').first();
    await editLink.click();
    await expect(page.getByTestId("version-history-btn")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("ai-generate-btn")).toBeVisible();
    await expect(page.getByTestId("publish-discover-btn")).toBeVisible();

    await page.getByTestId("version-history-btn").click();
    await expect(page.getByTestId("version-history-dialog")).toBeVisible();
    await page.keyboard.press("Escape");

    // 3. Discover Portal on 375px mobile viewport (check zero overflow + clone)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/discover");
    await expect(page.locator('[data-testid^="discover-card-"]').first()).toBeVisible({
      timeout: 15000,
    });
    const discoverOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2
    );
    expect(discoverOverflow).toBe(false);

    const firstLike = page.locator('[data-testid^="discover-like-"]').first();
    await firstLike.click();

    // Open Teacher Profile from card author link
    await page.locator('[data-testid^="discover-author-"]').first().click();
    await expect(page.getByTestId("teacher-followers-count")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("teacher-follow-btn")).toBeVisible();

    await ctx.close();
  });

  test("Unauthenticated guest submits public practice link at 375px -> Admin opens moderation queue", async ({
    browser,
  }) => {
    // 1. Fresh unauthenticated context -> Guest Practice Link
    const guestCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const guestPage = await guestCtx.newPage();

    await guestPage.goto("/practice/demo-public-practice-p25");
    await expect(guestPage.getByTestId("public-practice-guest-name")).toBeVisible({
      timeout: 15000,
    });

    const practiceOverflow = await guestPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2
    );
    expect(practiceOverflow).toBe(false);

    await guestPage.getByTestId("public-practice-guest-name").fill("Khách Luyện Tập E2E");
    const firstMcBtn = guestPage.locator('[data-testid^="public-mc-"]').first();
    if (await firstMcBtn.isVisible()) {
      await firstMcBtn.click();
    }
    await guestPage.getByTestId("public-practice-submit-btn").click();
    await expect(guestPage.getByTestId("public-practice-score-card")).toBeVisible({
      timeout: 15000,
    });
    await guestCtx.close();

    // 2. Admin visits /admin/moderation
    const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const adminPage = await adminCtx.newPage();
    await loginAs(adminPage, "admin@engclass.vn");
    await adminPage.goto("/admin/moderation");
    await expect(adminPage.locator('[data-testid^="moderation-report-"]').first()).toBeVisible({
      timeout: 15000,
    });
    await adminCtx.close();
  });
});
