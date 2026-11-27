import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe.serial("Phase 24: Student Streak, Flashcard SRS, Mistakes Review, Parent-Teacher Inbox & Notification Prefs", () => {
  test("Student views Streak card -> studies Flashcards on 375px -> reviews Mistakes", async ({
    browser,
  }) => {
    const sCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const sPage = await sCtx.newPage();
    await loginAs(sPage, "student1@engclass.vn");

    // 1. Streak & Badges card on /student
    await expect(sPage.getByTestId("student-gamification-card")).toBeVisible();
    await expect(sPage.getByTestId("student-gamification-card")).toContainText("4 ngày liên tiếp");

    // 2. Study Flashcard with SM-2 rating on mobile 375px
    await sPage.goto("/student/flashcards");
    await expect(sPage.getByTestId("flashcard-deck-grid")).toBeVisible();
    await sPage.locator('[data-testid^="study-deck-"]').first().click();
    await expect(sPage.getByTestId("flashcard-flip-card")).toBeVisible();
    await sPage.getByTestId("flashcard-flip-card").click();
    await sPage.getByTestId("srs-btn-4").click();
    await expect(sPage.getByTestId("flashcard-flip-card")).toContainText("capable");

    const overflow = await sPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2
    );
    expect(overflow).toBe(false);

    // 3. Student Mistake Review page shows seeded mistake & explanation toggle
    await sPage.goto("/student/mistakes");
    await expect(sPage.getByTestId("mistakes-list")).toBeVisible();
    await sPage.locator('[data-testid^="reveal-mistake-"]').first().click();
    await expect(sPage.locator('[data-testid^="mistake-answer-"]').first()).toBeVisible();

    await sCtx.close();
  });

  test("Parent sends message -> Teacher sees unread badge & replies -> /account saves notification preferences", async ({
    browser,
  }) => {
    const msgText = `Tin nhan E2E PH24 ${Date.now()}`;
    const pCtx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    const pPage = await pCtx.newPage();
    await loginAs(pPage, "parent1@engclass.vn");

    await pPage.goto("/messages");
    await expect(pPage.getByTestId("messages-list")).toBeVisible();
    await pPage.getByTestId("message-input").fill(msgText);
    await pPage.getByTestId("send-message-btn").click();
    await expect(pPage.getByTestId("messages-list")).toContainText(msgText);

    // Account notification preferences persistence
    await pPage.goto("/account");
    await expect(pPage.getByTestId("notification-preferences-card")).toBeVisible();
    const weeklySwitch = pPage.getByTestId("pref-email-weekly");
    const wasChecked = (await weeklySwitch.getAttribute("data-state")) === "checked";
    const expectedState = wasChecked ? "unchecked" : "checked";
    const putPromise = pPage.waitForResponse(
      (r) => r.url().includes("/api/notifications/preferences") && r.request().method() === "PUT"
    );
    await weeklySwitch.click();
    const putRes = await putPromise;
    expect(putRes.ok()).toBe(true);
    await expect(pPage.getByTestId("pref-email-weekly")).toHaveAttribute(
      "data-state",
      expectedState
    );
    await pPage.reload();
    await expect(pPage.getByTestId("pref-email-weekly")).toHaveAttribute(
      "data-state",
      expectedState
    );
    await pCtx.close();

    // Teacher logs in, verifies unread badge & message, then replies
    const tCtx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    const tPage = await tCtx.newPage();
    await loginAs(tPage, "teacher1@engclass.vn");

    await expect(tPage.getByTestId("navbar-messages-badge")).toBeVisible({ timeout: 15000 });
    await tPage.getByTestId("navbar-messages-link").click();
    await expect(tPage.getByTestId("messages-list")).toContainText(msgText);
    const replyText = `GV da nhan E2E ${Date.now()}`;
    await tPage.getByTestId("message-input").fill(replyText);
    await tPage.getByTestId("send-message-btn").click();
    await expect(tPage.getByTestId("messages-list")).toContainText(replyText);
    await tCtx.close();
  });
});
