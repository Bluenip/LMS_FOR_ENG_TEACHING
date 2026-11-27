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

test.describe.serial("Phase 31: exam tools, interactive video & question Q&A", () => {
  test("Student uses the calculator and highlights the reading passage inside the exam page", async ({ browser }) => {
    const asg = await prisma.assignment.findFirstOrThrow({ where: { title: "Reading with exam tools (demo)" }, orderBy: { createdAt: "desc" } });
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await loginAs(page, "student2@engclass.vn");
    await page.goto(`/student/assignments/${asg.id}/do`);
    const startBtn = page.getByRole("button", { name: /Bắt đầu làm bài|Start attempt/ });
    await expect(startBtn.or(page.getByTestId("exam-tools-toggle"))).toBeVisible();
    if (await startBtn.isVisible()) await startBtn.click();

    await page.getByTestId("exam-tools-toggle").click();
    await expect(page.getByTestId("exam-tools-drawer")).toBeVisible();
    await page.getByTestId("exam-tool-tab-calculator").click();
    await page.getByTestId("calc-input").fill("2+3*4-sqrt(16)");
    await page.getByTestId("calc-equals").click();
    await expect(page.getByTestId("calc-result")).toHaveText("10");
    await page.getByTestId("exam-tool-tab-periodicTable").click();
    await page.getByTestId("periodic-search").fill("Fe");
    await expect(page.getByTestId("exam-tools-drawer")).toContainText("55.845");
    await page.getByRole("button", { name: /Đóng|Close/ }).first().click();

    // highlighter: select the first word of the passage and release the mouse
    await page.getByTestId("exam-tool-highlighter").click();
    const passage = page.locator("[data-highlightable]").first();
    await expect(passage).toBeVisible();
    await passage.evaluate((el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node && (node.textContent ?? "").trim().length < 5) node = walker.nextNode();
      const range = document.createRange();
      range.setStart(node!, 0);
      range.setEnd(node!, Math.min(10, node!.textContent!.length));
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    await expect(passage.locator("mark.pivora-hl")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await ctx.close();
  });

  test("Interactive video: teacher sees the checkpoint editor, student answers checkpoints without seeing keys early", async ({ browser }) => {
    const item = await prisma.lessonItem.findFirstOrThrow({ where: { title: "Video có câu hỏi xen giữa" }, orderBy: { createdAt: "desc" }, include: { lesson: { include: { classLinks: true } } } });
    const classId = item.lesson.classLinks[0]!.classId;
    const s3 = await prisma.user.findUniqueOrThrow({ where: { email: "student3@engclass.vn" } });
    await prisma.lessonVideoProgress.deleteMany({ where: { lessonItemId: item.id, studentId: s3.id } }); // re-runnable

    const tCtx = await browser.newContext();
    const tPage = await tCtx.newPage();
    await loginAs(tPage, "teacher1@engclass.vn");
    await tPage.goto(`/teacher/classes/${classId}?tab=lessons`);
    await tPage.getByTestId(`video-checkpoints-${item.id}`).click();
    await expect(tPage.getByTestId("video-checkpoint-editor")).toContainText("She ___ here since 2020.");
    await tCtx.close();

    const sCtx = await browser.newContext();
    const sPage = await sCtx.newPage();
    await loginAs(sPage, "student3@engclass.vn");
    await sPage.goto(`/student/classes/${classId}?tab=lessons`);
    await expect(sPage.getByTestId(`interactive-video-${item.id}`)).toBeVisible();
    const api = `/api/lessons/items/${item.id}/video-progress`;
    const view = await sPage.evaluate(async (u) => (await fetch(u)).json(), api);
    expect(JSON.stringify(view)).not.toContain('"correct"');
    const cp = view.checkpoints[0];
    const post = (body: unknown) =>
      sPage.evaluate(
        async ([u, b]) => (await fetch(u as string, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) })).json(),
        [api, body] as const
      );
    await post({ kind: "HEARTBEAT", currentSec: 3, durationSec: 5 });
    const ans = await post({ kind: "ANSWER", checkpointId: cp.id, answer: "B" });
    expect(ans.isCorrect).toBe(true);
    await sCtx.close();
  });

  test("Student asks about a graded question, teacher replies publicly, classmates can read it", async ({ browser }) => {
    const asg = await prisma.assignment.findFirstOrThrow({ where: { title: "Mini test (mastery demo)" }, orderBy: { createdAt: "desc" } });
    const sCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const sPage = await sCtx.newPage();
    await loginAs(sPage, "student5@engclass.vn");
    await sPage.goto(`/student/assignments/${asg.id}/do`);
    await expect(sPage.getByTestId("doubt-panel")).toBeVisible();
    const q = `E2E hỏi ${Date.now()}`;
    await sPage.getByTestId("doubt-field-3").click();
    await sPage.getByTestId("doubt-input").fill(q);
    await sPage.getByTestId("doubt-send").click();
    await expect(sPage.locator('li[data-testid^="doubt-"]').filter({ hasText: q })).toBeVisible();
    await sCtx.close();

    const doubt = await prisma.questionDoubt.findFirstOrThrow({ where: { question: q } });
    const tCtx = await browser.newContext();
    const tPage = await tCtx.newPage();
    await loginAs(tPage, "teacher1@engclass.vn");
    await tPage.goto(`/teacher/assignments/${asg.id}/grading?tab=doubts`);
    await expect(tPage.getByTestId("doubt-queue")).toBeVisible();
    await tPage.getByTestId(`doubt-reply-${doubt.id}`).fill("Câu 3 kiểm tra từ vựng, đáp án đúng là A.");
    await tPage.getByTestId(`doubt-reply-send-${doubt.id}`).click();
    await expect(tPage.getByTestId(`doubt-reply-${doubt.id}`)).toBeHidden();
    await expect(tPage.getByTestId(`teacher-doubt-${doubt.id}`)).toContainText("đáp án đúng là A");
    await tCtx.close();

    const oCtx = await browser.newContext();
    const oPage = await oCtx.newPage();
    await loginAs(oPage, "student1@engclass.vn");
    await oPage.goto(`/student/assignments/${asg.id}/do`);
    await expect(oPage.getByTestId(`doubt-${doubt.id}`)).toContainText("đáp án đúng là A");
    await oCtx.close();
  });
});
