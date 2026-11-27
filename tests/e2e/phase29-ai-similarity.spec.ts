import fs from "fs";
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encodeGrayPng } from "../../src/lib/omr/png";

const prisma = new PrismaClient();

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

/** The seeded demo essay assignment (prisma/seed.ts, Phase 29). */
async function demoEssay() {
  const asg = await prisma.assignment.findFirstOrThrow({
    where: { title: "Writing: Protecting the environment" },
    orderBy: { createdAt: "desc" },
    include: { worksheet: { include: { fields: true } }, submissions: { include: { student: true } } },
  });
  const sub = asg.submissions.find((s) => s.student.email === "student1@engclass.vn")!;
  return { asg, field: asg.worksheet.fields[0]!, sub };
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.serial("Phase 29: AI OCR, AI grade suggestions & similarity", () => {
  test("OCR (AI mocked) → review drafts with KaTeX → creates a worksheet", async ({ page }, testInfo) => {
    await loginAs(page, "teacher1@engclass.vn");
    // Gemini is called server-side; the app's OCR endpoint is mocked so no API key / quota is needed.
    await page.route("**/api/ai/ocr-worksheet", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          questions: [
            {
              type: "MULTIPLE_CHOICE",
              prompt: "OCR E2E: nghiệm của $x^2 = 9$ là",
              points: 1,
              options: [
                { id: "A", text: "$3$" },
                { id: "B", text: "$\\pm 3$" },
              ],
              answerKey: { correct: "B" },
              explanation: null,
              topicTag: null,
            },
          ],
          quota: { limit: 20, used: 1, remaining: 19, dayKey: "x" },
        }),
      })
    );
    const file = testInfo.outputPath("page1.png");
    fs.writeFileSync(file, encodeGrayPng({ width: 40, height: 60, data: new Uint8ClampedArray(2400).fill(240) }));

    await page.goto("/teacher/worksheets");
    await page.getByTestId("open-ocr-btn").click();
    await page.getByTestId("ai-ocr-file-input").setInputFiles(file);
    await page.getByTestId("ai-ocr-run").click();
    const draft = page.getByTestId("ai-ocr-draft-0");
    await expect(draft).toContainText("OCR E2E");
    await expect(draft.locator(".katex").first()).toBeVisible();
    await page.getByTestId("ai-ocr-insert").click();
    await page.waitForURL(/\/teacher\/worksheets\/[^/]+\/edit/, { timeout: 20000 });
    const wsId = page.url().split("/").at(-2)!;
    const fields = await prisma.field.findMany({ where: { worksheetId: wsId } });
    expect(fields).toHaveLength(1);
    expect(fields[0]!.prompt).toContain("OCR E2E");
    expect(fields[0]!.answerKey).toEqual({ correct: "B" });
    await prisma.worksheet.delete({ where: { id: wsId } });
  });

  test("AI grade suggestion (mocked) is applied only after the teacher confirms", async ({ page }) => {
    const { asg, field, sub } = await demoEssay();
    await prisma.answer.updateMany({ where: { submissionId: sub.id, fieldId: field.id }, data: { score: null, teacherNote: null, rubricScores: undefined } });
    // The stored suggestion stands in for the Gemini call; the POST that would call Gemini is mocked.
    const suggestion = await prisma.aiGradingSuggestion.upsert({
      where: { submissionId_fieldId: { submissionId: sub.id, fieldId: field.id } },
      create: {
        submissionId: sub.id,
        fieldId: field.id,
        suggestedScore: 3.25,
        suggestedRubricScores: { content: 1.75, language: 1.5 },
        suggestedComment: "E2E: rõ ý, cần thêm lý do.",
        model: "mock",
        createdById: asg.worksheet.ownerId,
      },
      update: { appliedAt: null, suggestedScore: 3.25, suggestedRubricScores: { content: 1.75, language: 1.5 }, suggestedComment: "E2E: rõ ý, cần thêm lý do." },
    });

    await loginAs(page, "teacher1@engclass.vn");
    await page.route(`**/api/submissions/${sub.id}/ai-suggest-grade`, (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              suggestion: {
                id: suggestion.id,
                suggestedScore: 3.25,
                suggestedRubricScores: { content: 1.75, language: 1.5 },
                suggestedComment: "E2E: rõ ý, cần thêm lý do.",
                appliedAt: null,
              },
            }),
          })
        : route.continue()
    );

    await page.goto(`/teacher/assignments/${asg.id}/grading`);
    await page.getByTestId("tab-grade-by-question").click();
    await page.getByTestId(`ai-suggest-btn-${sub.id}`).click();
    await expect(page.getByTestId(`ai-suggestion-${sub.id}`)).toContainText(/Gợi ý từ AI|AI suggestion/);
    await expect(page.getByTestId(`ai-suggested-score-${sub.id}`)).toContainText("3.25/4");

    // Not saved yet
    const before = await prisma.answer.findFirst({ where: { submissionId: sub.id, fieldId: field.id } });
    expect(before?.score).toBeNull();

    await page.getByTestId(`ai-apply-${sub.id}`).click();
    await expect(page.getByTestId(`ai-suggestion-${sub.id}`)).toBeHidden();
    await expect(page.getByTestId(`qgrade-score-${sub.id}`)).toHaveValue("3.25");
    const after = await prisma.answer.findFirst({ where: { submissionId: sub.id, fieldId: field.id } });
    expect(after?.score).toBe(3.25);
    expect(after?.teacherNote).toBe("E2E: rõ ý, cần thêm lý do.");
    expect((await prisma.aiGradingSuggestion.findUnique({ where: { id: suggestion.id } }))?.appliedAt).not.toBeNull();
  });

  test("Similarity scan + side-by-side comparison on a 375px phone", async ({ browser }) => {
    const { asg } = await demoEssay();
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();
    await loginAs(page, "teacher1@engclass.vn");
    await page.goto(`/teacher/assignments/${asg.id}/grading`);
    await page.getByTestId("tab-similarity").click();
    await page.getByTestId("similarity-scan").click();
    await expect(page.getByText(/cặp giống cao|highly similar/)).toBeVisible();
    const row = page.locator('[data-testid^="similarity-row-"]').first();
    await expect(row).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await row.click();
    const dialog = page.getByTestId("similarity-compare");
    await expect(dialog.locator("mark").first()).toContainText(/protect the environment/i);
    await page.getByTestId("similarity-confirm").click();
    await expect(dialog).toBeHidden();
    await expect(row).toContainText(/Đã xác nhận|Confirmed/);
    await ctx.close();
  });
});
