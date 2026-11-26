import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe("Phase 20: Workbooks, Return for Revision, Lesson Progress, Classroom Feed & Co-Teachers", () => {
  test("Test 1: Teacher views Workbook tab and opens Class Workbook Matrix + Excel export", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();

    await loginAs(page, "teacher1@engclass.vn");
    await page.goto("/teacher/worksheets?tab=workbooks");
    await expect(page.getByTestId("workbook-library")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Bộ đề Ôn tập 3 buổi (Phase 20)")).toBeVisible();

    // Click Matrix link for Class 12A1
    const matrixLink = page.locator('[data-testid^="workbook-matrix-link-"]').first();
    await expect(matrixLink).toBeVisible();
    await matrixLink.click();

    await page.getByTestId("workbook-matrix-table").waitFor({ state: "visible", timeout: 15000 });
    await expect(page.getByTestId("workbook-matrix-table")).toContainText("student1@engclass.vn");
    await expect(page.getByTestId("workbook-matrix-table")).toContainText("5");

    // Verify Matrix Excel export returns HTTP 200 spreadsheet
    const exportHref = await page.getByTestId("workbook-matrix-export-btn").getAttribute("href");
    expect(exportHref).toBeTruthy();
    const res = await page.request.get(exportHref!);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("spreadsheetml");

    await ctx.close();
  });

  test("Test 2: Grading Histogram & Topic Filter, Return for Revision -> Student resubmits without losing attempt", async ({
    browser,
  }) => {
    const teacherCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const teacherPage = await teacherCtx.newPage();
    await loginAs(teacherPage, "teacher1@engclass.vn");

    const asgData = await teacherPage.evaluate(async () =>
      (await fetch("/api/assignments")).json()
    );
    const wb1Asg = (asgData.assignments as Array<{ id: string; title: string }>).find((a) =>
      a.title.includes("Ôn tập Workbook — Buổi 1 (Phase 20)")
    );
    expect(wb1Asg).toBeTruthy();

    await teacherPage.goto(`/teacher/assignments/${wb1Asg!.id}/grading`);
    await expect(teacherPage.getByTestId("score-histogram-chart")).toBeVisible({ timeout: 15000 });
    await expect(teacherPage.getByTestId("topic-tag-filters")).toBeVisible();

    // Click topicTag filter chip
    await teacherPage.getByTestId("topic-filter-chip-Từ vựng").click();
    await teacherPage.getByTestId("topic-filter-chip-all").click();

    // Open student1's graded submission and Return for Revision
    const s1Row = teacherPage.locator("tr", { hasText: "student1@engclass.vn" });
    await expect(s1Row).toBeVisible();
    await s1Row.getByRole("button", { name: /Chấm & Xem|Grade & view/ }).click();

    await teacherPage.getByTestId("return-submission-btn").waitFor({ state: "visible", timeout: 10000 });
    await teacherPage.getByTestId("return-submission-btn").click();
    await teacherPage.getByTestId("return-comment-input").fill("Em xem lại thì ở câu 2 nhé");
    await teacherPage.getByTestId("confirm-return-submission-btn").click();

    await expect(teacherPage.locator('[data-testid^="status-returned-"]')).toBeVisible({
      timeout: 15000,
    });

    // Student1 opens assignment -> sees Returned banner, zero answerKey leak, updates Q2 and resubmits
    const studentCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const sPage = await studentCtx.newPage();
    await loginAs(sPage, "student1@engclass.vn");

    let rawPayload = "";
    sPage.on("response", async (resp) => {
      if (resp.url().endsWith(`/api/assignments/${wb1Asg!.id}`) && resp.status() === 200) {
        rawPayload = await resp.text();
      }
    });

    await sPage.goto(`/student/assignments/${wb1Asg!.id}/do`);
    await expect(sPage.getByTestId("returned-revision-banner")).toBeVisible({ timeout: 15000 });
    await expect(sPage.getByTestId("returned-revision-banner")).toContainText(
      "Em xem lại thì ở câu 2 nhé"
    );
    expect(rawPayload.length).toBeGreaterThan(20);
    expect(rawPayload).not.toContain('"answerKey"');

    // Fix Q2 input ("plays" -> "play") and resubmit
    const inputs = sPage.locator('input[type="text"]');
    await expect(inputs.nth(1)).toHaveValue("plays");
    await inputs.nth(1).fill("play");

    await sPage.getByTestId("open-submit-btn").click();
    await sPage.getByTestId("confirm-submit-btn").click();
    await expect(sPage.getByTestId("submission-result-banner")).toBeVisible({ timeout: 15000 });
    await expect(sPage.getByTestId("submission-result-banner")).toContainText(/2\s*\/\s*2/);

    // Teacher reloads grading page -> revision #1 appears in history
    await teacherPage.reload();
    const s1RowAfter = teacherPage.locator("tr", { hasText: "student1@engclass.vn" });
    await s1RowAfter.getByRole("button", { name: /Chấm & Xem|Grade & view/ }).click();
    await expect(teacherPage.getByTestId("submission-revisions-list")).toBeVisible({
      timeout: 10000,
    });
    await expect(teacherPage.getByTestId("submission-revisions-list")).toContainText("#1");

    await studentCtx.close();
    await teacherCtx.close();
  });

  test("Test 3: Class Feed Poll/Pin, Tabs (Submissions/Analytics), Lesson Progress, Prerequisite Lock & 375px", async ({
    browser,
  }) => {
    const teacherCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const tPage = await teacherCtx.newPage();
    await loginAs(tPage, "teacher1@engclass.vn");

    const clsData = await tPage.evaluate(async () => (await fetch("/api/classes")).json());
    const class1Id = (clsData.classes as Array<{ id: string; joinCode: string }>).find(
      (c) => c.joinCode === "ENG12A"
    )!.id;

    await tPage.goto(`/teacher/classes/${class1Id}`);
    await expect(tPage.locator('[data-testid^="pinned-badge-"]').first()).toBeVisible({
      timeout: 15000,
    });

    // Vote on seeded poll
    const firstPollOpt = tPage.locator('[data-testid^="poll-option-"]').first();
    await expect(firstPollOpt).toBeVisible();
    await firstPollOpt.click();
    await expect(firstPollOpt).toContainText("1 (100%)");

    // Submissions & Analytics tabs + Settings co-teacher check
    await tPage.getByTestId("class-tab-submissions").click();
    await expect(tPage.getByTestId("class-submissions-tab")).toBeVisible({ timeout: 10000 });

    await tPage.getByTestId("class-tab-analytics").click();
    await expect(tPage.getByTestId("class-analytics-tab")).toBeVisible({ timeout: 10000 });

    await tPage.getByTestId("class-tab-settings").click();
    await expect(tPage.getByTestId("class-teachers-section")).toContainText("teacher2@engclass.vn");

    // 375px mobile check
    await tPage.setViewportSize({ width: 375, height: 812 });
    await tPage.waitForTimeout(200);
    const noOverflow = await tPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    );
    expect(noOverflow).toBe(true);

    // Student1 checks Lesson Progress + Workbook Session 3 prerequisite lock
    const stuCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const sPage = await stuCtx.newPage();
    await loginAs(sPage, "student1@engclass.vn");

    await sPage.goto(`/student/classes/${class1Id}?tab=lessons`);
    const viewPdfBtn = sPage.locator('[data-testid^="lesson-view-pdf-"]').first();
    await expect(viewPdfBtn).toBeVisible({ timeout: 15000 });
    await viewPdfBtn.click();
    await expect(sPage.locator('[data-testid^="lesson-done-"]').first()).toBeVisible({
      timeout: 10000,
    });

    // Reload and confirm completed badge persists from DB
    await sPage.reload();
    await expect(sPage.locator('[data-testid^="lesson-done-"]').first()).toBeVisible({
      timeout: 15000,
    });

    // Visit Workbook Session 3 directly -> must be blocked because Session 2 is not submitted
    const sAsgData = await sPage.evaluate(async () => (await fetch("/api/assignments")).json());
    const wb3Asg = (sAsgData.assignments as Array<{ id: string; title: string }>).find((a) =>
      a.title.includes("Ôn tập Workbook — Buổi 3 (Phase 20)")
    );
    expect(wb3Asg).toBeTruthy();
    await sPage.goto(`/student/assignments/${wb3Asg!.id}/do`);
    await expect(sPage.getByTestId("prerequisite-lock-card")).toBeVisible({ timeout: 15000 });

    await stuCtx.close();
    await teacherCtx.close();
  });
});
