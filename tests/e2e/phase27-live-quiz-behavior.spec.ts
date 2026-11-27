import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

async function getClass1(page: Page) {
  const data = await page.evaluate(async () => (await fetch("/api/classes")).json());
  const cls = (data.classes as Array<{ id: string; joinCode: string }>).find((c) => c.joinCode === "ENG12A");
  expect(cls).toBeTruthy();
  return cls!.id;
}

test.describe.serial("Phase 27: Live Quiz, Exit Ticket & behavior points", () => {
  test("Teacher runs an exit ticket on the projector, student joins on a 375px phone, answers, sees bar chart & leaderboard", async ({
    browser,
  }) => {
    const tCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const tPage = await tCtx.newPage();
    await loginAs(tPage, "teacher1@engclass.vn");
    const classId = await getClass1(tPage);

    // Worksheet cards offer "Live"
    await tPage.goto("/teacher/worksheets");
    await expect(tPage.locator('[data-testid^="live-quiz-open-"]').first()).toBeVisible();

    // Exit ticket from the class page
    await tPage.goto(`/teacher/classes/${classId}`);
    await tPage.getByTestId("exit-ticket-btn").click();
    await tPage.getByTestId("exit-ticket-prompt").fill("Which word is a verb?");
    await tPage.getByTestId("exit-ticket-option-0").fill("table");
    await tPage.getByTestId("exit-ticket-option-1").fill("run");
    await tPage.getByTestId("exit-ticket-option-2").fill("blue");
    await tPage.getByTestId("exit-ticket-option-3").fill("happy");
    await tPage.getByRole("radio", { name: /B/ }).check();
    await tPage.getByTestId("exit-ticket-create").click();
    await tPage.waitForURL(/\/teacher\/live-quiz\//, { timeout: 20000 });
    const pin = (await tPage.getByTestId("live-pin").textContent())!.trim();
    expect(pin).toMatch(/^\d{6}$/);

    // Student on a phone
    const sCtx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const sPage = await sCtx.newPage();
    await loginAs(sPage, "student1@engclass.vn");
    await sPage.goto("/live");
    await sPage.getByTestId("live-pin-input").fill(pin);
    await sPage.getByTestId("live-pin-submit").click();
    await sPage.waitForURL(new RegExp(`/live/${pin}`));
    await sPage.getByTestId("live-join-button").click();
    await expect(sPage.getByTestId("live-player")).toBeVisible();

    await expect(tPage.getByTestId("live-participant-count")).toHaveText("1", { timeout: 20000 });
    await tPage.getByTestId("live-start").click();

    const optionB = sPage.getByTestId("live-option-B");
    await expect(optionB).toBeVisible({ timeout: 20000 });
    const box = await optionB.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(56);
    const noHorizontalScroll = await sPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noHorizontalScroll).toBe(true);
    await optionB.click();

    // Everyone answered → the host screen closes the question and reveals the chart
    await expect(tPage.getByTestId("live-distribution")).toBeVisible({ timeout: 20000 });
    await expect(tPage.getByTestId("live-leaderboard")).toBeVisible();
    await expect(sPage.getByTestId("live-feedback")).toContainText(/Chính xác|Correct/, { timeout: 20000 });

    await tPage.getByTestId("live-next").click();
    await expect(sPage.getByTestId("live-final")).toBeVisible({ timeout: 20000 });

    await tPage.getByTestId("live-export-open").click();
    await tPage.getByTestId("live-export-confirm").click();
    await expect(tPage.getByText(/Sổ điểm|gradebook/).first()).toBeVisible();

    await sCtx.close();
    await tCtx.close();
  });

  test("Teacher awards a star point, parent sees it in the portal", async ({ browser }) => {
    const tCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const tPage = await tCtx.newPage();
    await loginAs(tPage, "teacher1@engclass.vn");
    const classId = await getClass1(tPage);
    const detail = await tPage.evaluate(async (cid) => (await fetch(`/api/classes/${cid}`)).json(), classId);
    const stu1 = (detail.class.enrollments as Array<{ student: { id: string; email: string } }>).find(
      (e) => e.student.email === "student1@engclass.vn"
    )!;

    const reason = `Sao E2E ${Date.now()}`;
    await tPage.goto(`/teacher/classes/${classId}?tab=behavior`);
    await expect(tPage.getByTestId("class-behavior-tab")).toBeVisible();
    const before = Number(await tPage.getByTestId(`behavior-total-${stu1.student.id}`).innerText());
    await tPage.getByTestId(`behavior-row-${stu1.student.id}`).locator('input[type="checkbox"]').check();
    await tPage.locator("#bh-delta").fill("3");
    await tPage.locator("#bh-reason").fill(reason);
    await tPage.getByRole("button", { name: /Ghi|Record/ }).click();
    await expect(tPage.getByTestId(`behavior-total-${stu1.student.id}`)).toHaveText(String(before + 3));
    await tCtx.close();

    const pCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const pPage = await pCtx.newPage();
    await loginAs(pPage, "parent1@engclass.vn");
    await pPage.goto(`/parent?childId=${stu1.student.id}`);
    await expect(pPage.getByTestId("parent-behavior-card")).toContainText(reason);
    await pCtx.close();
  });
});
