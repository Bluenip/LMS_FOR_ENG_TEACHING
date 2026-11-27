import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.serial("Phase 30: mastery map, remedial work, at-risk & item analysis", () => {
  test("Teacher sees at-risk students, the heatmap, and creates remedial work for the weak group only", async ({ browser }) => {
    const cls = await prisma.class.findFirstOrThrow({ where: { joinCode: "ENG12A" } });
    const s5 = await prisma.user.findUniqueOrThrow({ where: { email: "student5@engclass.vn" } });
    const s1 = await prisma.user.findUniqueOrThrow({ where: { email: "student1@engclass.vn" } });
    const s6 = await prisma.user.findUniqueOrThrow({ where: { email: "student6@engclass.vn" } });

    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    await loginAs(page, "teacher1@engclass.vn");

    await page.goto("/teacher");
    await expect(page.getByTestId("teacher-at-risk-card")).toContainText(s6.name);

    await page.goto(`/teacher/classes/${cls.id}?tab=analytics`);
    await expect(page.getByTestId("class-at-risk-card").getByTestId(`at-risk-${s6.id}`)).toBeVisible();
    await page.getByTestId("analytics-view-mastery").click();
    await expect(page.getByTestId("mastery-heatmap")).toBeVisible();
    await expect(page.getByTestId(`mastery-cell-${s1.id}-Đọc hiểu`)).toHaveAttribute("data-level", "MASTERED");
    await expect(page.getByTestId(`mastery-cell-${s5.id}-Đọc hiểu`)).toHaveAttribute("data-level", "NEEDS_WORK");

    await page.getByTestId("mastery-tag-Đọc hiểu").click();
    await page.getByTestId("remedial-open").click();
    await expect(page.getByTestId("remedial-dialog")).toContainText(s5.name);
    await expect(page.getByTestId("remedial-dialog")).not.toContainText(s1.name);
    await page.getByTestId("remedial-create").click();
    await expect(page.getByText(/Đã giao bài ôn bù|Assigned .* review questions/)).toBeVisible();

    const log = await prisma.remedialPlanLog.findFirstOrThrow({ where: { classId: cls.id }, orderBy: { createdAt: "desc" } });
    const targets = await prisma.assignmentTarget.findMany({ where: { assignmentId: log.assignmentId } });
    const targetIds = targets.map((t) => t.studentId);
    expect(targetIds).toContain(s5.id);
    expect(targetIds).not.toContain(s1.id);
    await ctx.close();

    // Only the weak student sees it
    const sCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const sPage = await sCtx.newPage();
    await loginAs(sPage, "student5@engclass.vn");
    const mine = await sPage.evaluate(async () => (await fetch("/api/assignments")).json());
    expect(JSON.stringify(mine)).toContain(log.assignmentId);
    await expect(sPage.getByTestId("mastery-profile-card")).toContainText("Đọc hiểu");
    await sCtx.close();

    const oCtx = await browser.newContext();
    const oPage = await oCtx.newPage();
    await loginAs(oPage, "student1@engclass.vn");
    const other = await oPage.evaluate(async () => (await fetch("/api/assignments")).json());
    expect(JSON.stringify(other)).not.toContain(log.assignmentId);
    await oCtx.close();
  });

  test("Item analysis table on the grading page", async ({ page }) => {
    const asg = await prisma.assignment.findFirstOrThrow({ where: { title: "Mini test (mastery demo)" }, orderBy: { createdAt: "desc" } });
    await loginAs(page, "teacher1@engclass.vn");
    await page.goto(`/teacher/assignments/${asg.id}/grading`);
    const card = page.getByTestId("item-analysis-card");
    await expect(card).toContainText(/Phân tích câu hỏi|Item analysis/);
    await expect(card.locator('[data-testid^="item-row-"]')).toHaveCount(6);
    await expect(card.locator('[data-testid^="item-flag-"]').first()).toBeVisible();
  });
});
