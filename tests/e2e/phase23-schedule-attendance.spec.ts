import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe.serial("Phase 23: Weekly Timetable, Makeup Session, Attendance & Parent Alert", () => {
  let class1Id = "";
  let student1Id = "";
  let createdSessionTitle = "";

  test("Teacher creates weekly rule & makeup session -> marks student1 ABSENT -> Gradebook & Schedule update", async ({
    browser,
  }) => {
    const tCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const tPage = await tCtx.newPage();
    await loginAs(tPage, "teacher1@engclass.vn");

    const clsData = await tPage.evaluate(async () => (await fetch("/api/classes")).json());
    const class1 = (clsData.classes as Array<{ id: string; joinCode: string }>).find(
      (c) => c.joinCode === "ENG12A"
    );
    expect(class1).toBeTruthy();
    class1Id = class1!.id;

    const detailData = await tPage.evaluate(async (cid) => {
      return (await fetch(`/api/classes/${cid}`)).json();
    }, class1Id);
    const stu1 = (
      detailData.class.enrollments as Array<{ student: { id: string; email: string } }>
    ).find((e) => e.student.email === "student1@engclass.vn");
    expect(stu1).toBeTruthy();
    student1Id = stu1!.student.id;

    // 1. Open Class 12A1 Schedule & Attendance tab
    await tPage.goto(`/teacher/classes/${class1Id}?tab=schedule`);
    await expect(tPage.getByTestId("class-sessions-list")).toBeVisible();

    // 2. Add recurring weekly schedule rule (Sunday 18:00-19:30)
    await tPage.getByTestId("add-schedule-rule-btn").click();
    await expect(tPage.getByTestId("schedule-rule-dialog")).toBeVisible();
    await tPage.getByTestId("rule-dow-select").selectOption("0");
    await tPage.getByTestId("save-rule-btn").click();
    await expect(tPage.getByTestId("schedule-rule-dialog")).toBeHidden({ timeout: 15000 });

    // 3. Add a makeup session for today/tomorrow and take attendance
    createdSessionTitle = `Buổi bù E2E ${Date.now()}`;
    await tPage.getByTestId("add-makeup-session-btn").click();
    await expect(tPage.getByTestId("session-form-dialog")).toBeVisible();
    await tPage.getByTestId("session-title-input").fill(createdSessionTitle);
    await tPage.getByTestId("save-session-btn").click();
    await expect(tPage.getByTestId("session-form-dialog")).toBeHidden({ timeout: 15000 });

    const createdCard = tPage
      .locator('[data-testid^="class-session-card-"]')
      .filter({ hasText: createdSessionTitle })
      .first();
    await expect(createdCard).toBeVisible();

    // 4. Open attendance dialog, click "Tất cả có mặt", mark student1 ABSENT with note & save
    await createdCard.locator('[data-testid^="open-attendance-btn-"]').click();
    await expect(tPage.getByTestId("attendance-sheet-dialog")).toBeVisible();
    await tPage.getByTestId("mark-all-present-btn").click();
    await tPage.getByTestId(`att-btn-${student1Id}-ABSENT`).click();
    await tPage.getByTestId(`att-note-${student1Id}`).fill("Vắng E2E test");
    await tPage.getByTestId("save-attendance-btn").click();
    await expect(tPage.getByTestId("attendance-sheet-dialog")).toBeHidden({ timeout: 15000 });

    // 5. Verify Gradebook reflects attendance columns & student1 ABSENT count >= 1
    await tPage.getByTestId("class-tab-gradebook").click();
    await expect(tPage.getByTestId("gradebook-attendance-hdr")).toBeVisible();
    await expect(tPage.getByTestId(`gradebook-absent-${student1Id}`)).toHaveText("1");
    await expect(tPage.getByTestId(`gradebook-att-${student1Id}`)).toHaveText("50%");

    // 6. Visit /teacher/schedule desktop + mobile 375px check
    await tPage.goto("/teacher/schedule");
    await expect(tPage.getByTestId("schedule-desktop-grid")).toBeVisible();
    await tPage.setViewportSize({ width: 375, height: 812 });
    await expect(tPage.getByTestId("schedule-mobile-list")).toBeVisible();
    const hasOverflow = await tPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2
    );
    expect(hasOverflow).toBe(false);

    await tCtx.close();
  });

  test("Parent sees ATTENDANCE_ALERT notification & attendance card; Student sees schedule", async ({
    browser,
  }) => {
    // Parent verification
    const pCtx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
    const pPage = await pCtx.newPage();
    await loginAs(pPage, "parent1@engclass.vn");

    await expect(pPage.getByTestId("parent-attendance-card")).toBeVisible();
    await expect(pPage.getByTestId("parent-attendance-card")).toContainText("Vắng không phép");

    await pPage.getByRole("button", { name: /Thông báo|Notifications/i }).click();
    await expect(pPage.locator("body")).toContainText("vắng không phép");
    await pCtx.close();

    // Student verification
    const sCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const sPage = await sCtx.newPage();
    await loginAs(sPage, "student1@engclass.vn");

    await sPage.goto("/student/schedule");
    await expect(sPage.getByTestId("schedule-mobile-list")).toBeVisible();
    const stuOverflow = await sPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 2
    );
    expect(stuOverflow).toBe(false);
    await sCtx.close();
  });
});
