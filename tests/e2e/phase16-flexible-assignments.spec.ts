import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe("Phase 16: Targeted Assignments, Rubric, Blind Grading, Flag Persistence & Overrides", () => {
  test("full end-to-end flow: rubric authoring -> targeted assign -> student flag persistence -> blind by-question rubric grading -> +1 override -> 375px check", async ({
    browser,
  }) => {
    const prisma = new PrismaClient();
    const stamp = Date.now();
    const wsTitle = `E2E P16 Rubric WS ${stamp}`;
    const asgTitle = `E2E P16 Target IELTS ${stamp}`;
    let wsId = "";
    let asgId = "";

    const student1 = await prisma.user.findUniqueOrThrow({
      where: { email: "student1@engclass.vn" },
      select: { id: true, name: true },
    });

    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();
    const s2Ctx = await browser.newContext();
    const s2Page = await s2Ctx.newPage();
    const s1Ctx = await browser.newContext();
    const s1Page = await s1Ctx.newPage();

    try {
      // 1. Teacher creates ENGLISH worksheet, adds ESSAY + 2-criterion Rubric
      await loginAs(teacherPage, "teacher1@engclass.vn");
      await teacherPage.goto("/teacher/worksheets");

      await teacherPage
        .getByRole("button", { name: /Tạo worksheet|Create worksheet/i })
        .first()
        .click();
      await teacherPage.getByTestId("subject-option-ENGLISH").click();
      await teacherPage
        .locator('input[placeholder*="Hàm số"], input[placeholder*="Unit 8"]')
        .first()
        .fill(wsTitle);
      await teacherPage.getByTestId("confirm-create-worksheet-btn").click();
      await teacherPage.waitForURL(/\/teacher\/worksheets\/.+\/edit/, { timeout: 20000 });
      wsId = teacherPage.url().match(/\/worksheets\/([^/]+)\/edit/)?.[1] ?? "";
      expect(wsId).toBeTruthy();

      await teacherPage.locator('input[type="number"][max="100"]').first().fill("1");
      await teacherPage.getByTestId("quick-add-type-select").selectOption("ESSAY");
      await teacherPage
        .getByRole("button", { name: /Thêm vào phiếu|Add to sheet/i })
        .click();

      const rubricEditor = teacherPage.getByTestId("rubric-editor").first();
      await expect(rubricEditor).toBeVisible({ timeout: 10000 });
      await rubricEditor.getByTestId("add-rubric-criterion-btn").click();
      await rubricEditor.getByTestId("add-rubric-criterion-btn").click();
      await rubricEditor.getByTestId("rubric-title-0").fill("Ideas");
      await rubricEditor.getByTestId("rubric-max-0").fill("2");
      await rubricEditor.getByTestId("rubric-title-1").fill("Grammar");
      await rubricEditor.getByTestId("rubric-max-1").fill("2");

      const syncBtn = rubricEditor.getByTestId("sync-rubric-points-btn");
      if (await syncBtn.isVisible().catch(() => false)) {
        await syncBtn.click();
      }

      // Wait until autosave commits rubric to DB
      await expect
        .poll(
          async () => {
            const f = await prisma.field.findFirst({
              where: { worksheetId: wsId },
              orderBy: { order: "asc" },
            });
            return Array.isArray(f?.rubric) ? f.rubric.length : 0;
          },
          { timeout: 15000 }
        )
        .toBe(2);

      // 2. Teacher assigns targeted to student1 ONLY, maxAttempts=1, scoreScale=IELTS
      await teacherPage.goto(`/teacher/assignments/new?worksheetId=${wsId}`);
      await expect(teacherPage.locator("#assignment-title")).toBeVisible({ timeout: 15000 });
      await teacherPage.locator("#assignment-title").fill(asgTitle);

      await teacherPage
        .locator('#step-classes button[role="checkbox"]')
        .filter({ hasText: "12A1" })
        .first()
        .click();

      await teacherPage.getByTestId("target-mode-selected").click();
      await expect(teacherPage.getByTestId("target-student-picker")).toBeVisible();
      await teacherPage.getByTestId(`target-student-cb-${student1.id}`).check();

      await teacherPage.getByTestId("max-attempts-input").fill("1");
      await teacherPage.getByTestId("score-scale-select").selectOption("IELTS");

      await teacherPage.locator('button[type="submit"]').first().click();
      await teacherPage.waitForURL((url) => !url.pathname.endsWith("/new"), { timeout: 20000 });

      const createdAsg = await prisma.assignment.findFirstOrThrow({
        where: { title: asgTitle },
        select: { id: true },
      });
      asgId = createdAsg.id;

      // 3. Untargeted student2 does NOT see the assignment and gets 403 via API
      await loginAs(s2Page, "student2@engclass.vn");
      await s2Page.goto("/student");
      await expect(s2Page.getByText(asgTitle)).toHaveCount(0);
      const s2Res = await s2Page.request.get(`/api/assignments/${asgId}`);
      expect(s2Res.status()).toBe(403);

      // 4. Targeted student1 starts, toggles Flag, saves essay, reloads & verifies Flag persisted, submits
      await loginAs(s1Page, "student1@engclass.vn");
      await s1Page.goto("/student");
      await expect(s1Page.getByText(asgTitle)).toBeVisible({ timeout: 10000 });
      await s1Page.goto(`/student/assignments/${asgId}/do`);
      await s1Page.getByRole("button", { name: /Bắt đầu làm bài|Start/i }).click();

      await expect(s1Page.getByTestId("open-submit-btn")).toBeVisible({ timeout: 15000 });

      const flagBtn = s1Page.getByTitle(/Đánh dấu xem lại|Mark for review/i).first();
      await flagBtn.click();
      await expect(s1Page.getByRole("button", { name: /Đã cờ \(1\)|Flagged \(1\)/i })).toBeVisible();

      const essayTextarea = s1Page.locator("textarea").first();
      await essayTextarea.fill("Teamwork improves communication and builds trust.");
      await expect(s1Page.getByTestId("student-autosave-badge")).toContainText(/Đã lưu tự động|Auto-saved/i, {
        timeout: 10000,
      });

      // Reload & confirm Flag persistence + answer persistence
      await s1Page.reload();
      await expect(s1Page.getByTestId("open-submit-btn")).toBeVisible({ timeout: 15000 });
      await expect(s1Page.getByRole("button", { name: /Đã cờ \(1\)|Flagged \(1\)/i })).toBeVisible();
      await expect(s1Page.locator("textarea").first()).toHaveValue(
        "Teamwork improves communication and builds trust."
      );

      await s1Page.getByTestId("open-submit-btn").click();
      await s1Page.getByTestId("confirm-submit-btn").click();
      await expect(s1Page.getByTestId("submission-result-banner")).toBeVisible({ timeout: 15000 });

      const sub = await prisma.submission.findFirstOrThrow({
        where: { assignmentId: asgId, studentId: student1.id },
        select: { id: true },
      });

      // 5. Teacher grades via "Chấm theo câu" + Blind Grading + Rubric + Preset
      await teacherPage.goto(`/teacher/assignments/${asgId}/grading`);
      await teacherPage.getByTestId("tab-grade-by-question").click();
      const qPanel = teacherPage.getByTestId("grade-by-question-panel");
      await expect(qPanel).toBeVisible({ timeout: 15000 });

      // Enable Blind grading & confirm student identity is masked
      await teacherPage.getByTestId("blind-grading-switch").click();
      await expect(qPanel).not.toContainText(student1.name);
      await expect(qPanel).toContainText(/Học sinh #1|Student #1/i);

      const qItem = teacherPage.getByTestId(`qgrade-item-${sub.id}`);
      const rubricInputs = qItem.locator(
        `input[type="number"]:not([data-testid="qgrade-score-${sub.id}"])`
      );
      await expect(rubricInputs).toHaveCount(2);
      await rubricInputs.nth(0).fill("1.5");
      await rubricInputs.nth(1).fill("1.5");
      await expect(qItem.getByTestId(`qgrade-score-${sub.id}`)).toHaveValue("3");

      // Insert a seeded comment preset
      const presetBtn = qItem.locator('[data-testid^="insert-preset-"]').first();
      await expect(presetBtn).toBeVisible({ timeout: 10000 });
      await presetBtn.click();
      await expect(qItem.getByTestId(`qgrade-note-${sub.id}`)).not.toHaveValue("");

      await qItem.getByTestId(`qgrade-save-${sub.id}`).click();
      await expect(qItem).toContainText(/Đã có điểm|Graded/i, { timeout: 10000 });

      // 375px mobile overflow check on teacher grading view
      await teacherPage.setViewportSize({ width: 375, height: 812 });
      const teacherOverflow = await teacherPage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(teacherOverflow).toBeLessThanOrEqual(1);
      await teacherPage.setViewportSize({ width: 1280, height: 800 });

      // 6. Teacher grants +1 extra attempt via OverrideDialog
      await teacherPage.getByTestId("tab-grading-overview").click();
      await teacherPage.getByTestId(`override-btn-${student1.id}`).click();
      await expect(teacherPage.getByTestId("override-dialog")).toBeVisible();
      await teacherPage.getByTestId("override-extra-attempts-input").fill("1");
      await teacherPage.getByTestId("save-override-btn").click();
      await expect(teacherPage.getByTestId("override-dialog")).toHaveCount(0, { timeout: 10000 });

      // 7. Student1 reloads -> sees Rubric breakdown, IELTS Band badge, override badge, and 375px clean
      await s1Page.reload();
      await expect(s1Page.getByTestId("submission-result-banner")).toBeVisible({ timeout: 15000 });
      await expect(s1Page.getByTestId("scaled-score-badge")).toContainText("Band");
      await expect(s1Page.getByText(/Ideas/).first()).toBeVisible();
      await expect(s1Page.getByText(/1\.5\/2/).first()).toBeVisible();
      await expect(s1Page.getByText(/Có điều chỉnh riêng|Custom extension/i)).toBeVisible();

      await s1Page.setViewportSize({ width: 375, height: 812 });
      const studentOverflow = await s1Page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(studentOverflow).toBeLessThanOrEqual(1);
    } finally {
      if (asgId) {
        await prisma.assignment.delete({ where: { id: asgId } }).catch(() => {});
      }
      if (wsId) {
        await prisma.worksheet.delete({ where: { id: wsId } }).catch(() => {});
      }
      await prisma.$disconnect();
      await teacherCtx.close();
      await s2Ctx.close();
      await s1Ctx.close();
    }
  });
});
