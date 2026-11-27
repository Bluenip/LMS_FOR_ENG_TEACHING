import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe.serial("Phase 22: Question Bank, Matrix Generator, Variants & Multi-class Exams", () => {
  const wsTitle = "Đề Ma Trận E2E Phase 22";
  const examTitle = "Kỳ thi E2E Phase 22";
  let sessionId = "";
  let asg12A1Id = "";
  let asg12A2Id = "";

  test("Flow 1 & 2: Teacher builds matrix worksheet from Question Bank & launches 2-class Exam Session with 4 variants", async ({
    browser,
  }) => {
    const tCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const tPage = await tCtx.newPage();
    await loginAs(tPage, "teacher1@engclass.vn");

    // Flow 1: Open Question Bank & verify seeded items appear
    await tPage.goto("/teacher/question-bank");
    await tPage.getByTestId("question-bank-list").waitFor({ state: "visible", timeout: 15000 });
    await expect(tPage.getByTestId("question-bank-list")).toContainText("Bank EN #1");

    // Open Matrix Generator, set title & 2 non-overlapping topic rows (2 Ngữ pháp + 2 Từ vựng)
    await tPage.getByTestId("open-matrix-btn").click();
    await tPage.getByTestId("matrix-generator-dialog").waitFor({ state: "visible" });
    await tPage.getByTestId("matrix-ws-title").fill(wsTitle);
    await tPage.getByTestId("matrix-row-topic-0").fill("Ngữ pháp");
    await tPage.getByTestId("matrix-row-count-0").fill("2");

    await tPage.getByTestId("matrix-add-row-btn").click();
    await tPage.getByTestId("matrix-row-topic-1").fill("Từ vựng");
    await tPage.getByTestId("matrix-row-count-1").fill("2");

    // Wait for live preview badges confirming availability
    await expect(tPage.getByTestId("matrix-row-0")).toContainText(/Khả dụng:\s*[1-9]/, {
      timeout: 15000,
    });
    await expect(tPage.getByTestId("matrix-row-1")).toContainText(/Khả dụng:\s*[1-9]/, {
      timeout: 15000,
    });

    await tPage.getByTestId("matrix-generate-submit").click();
    await tPage.waitForURL(/\/teacher\/worksheets\/.+\/edit/, { timeout: 20000 });

    // Flow 2: Open Multi-class Exams & create session for both ENG12A (12A1) and ENG12B (12A2) with 4 variants
    const clsData = await tPage.evaluate(async () => (await fetch("/api/classes")).json());
    const c1 = (clsData.classes as Array<{ id: string; joinCode: string }>).find(
      (c) => c.joinCode === "ENG12A"
    );
    const c1B = (clsData.classes as Array<{ id: string; joinCode: string }>).find(
      (c) => c.joinCode === "ENG12B"
    );
    expect(c1 && c1B).toBeTruthy();

    await tPage.goto("/teacher/exams");
    await tPage.getByTestId("create-exam-session-btn").waitFor({ state: "visible", timeout: 15000 });
    await tPage.getByTestId("create-exam-session-btn").click();

    await tPage.getByTestId("create-exam-dialog").waitFor({ state: "visible" });
    await tPage.getByTestId("exam-title-input").fill(examTitle);

    const wsSelect = tPage.getByTestId("exam-worksheet-select");
    const targetOptionVal = await wsSelect
      .locator("option", { hasText: wsTitle })
      .first()
      .getAttribute("value");
    expect(targetOptionVal).toBeTruthy();
    await wsSelect.selectOption(targetOptionVal!);

    await tPage.getByTestId(`exam-class-toggle-${c1!.id}`).click();
    await tPage.getByTestId(`exam-class-toggle-${c1B!.id}`).click();
    await tPage.getByTestId("exam-variant-count-input").fill("4");
    await tPage.locator("#exam-proctor-select").selectOption("OFF");

    await tPage.getByTestId("create-exam-submit-btn").click();
    await tPage.waitForURL(/\/teacher\/exams\/.+/, { timeout: 20000 });
    sessionId = tPage.url().split("/teacher/exams/")[1]!.split("?")[0]!;

    const sessionsRes = await tPage.evaluate(async () => (await fetch("/api/exams")).json());
    const createdSession = (
      sessionsRes.sessions as Array<{
        id: string;
        assignments: Array<{ id: string; classId: string }>;
      }>
    ).find((s) => s.id === sessionId);
    expect(createdSession?.assignments).toHaveLength(2);
    asg12A1Id = createdSession!.assignments.find((a) => a.classId === c1!.id)!.id;
    asg12A2Id = createdSession!.assignments.find((a) => a.classId === c1B!.id)!.id;

    await tCtx.close();
  });

  test("Flow 3 & 4: Students in 12A1 & 12A2 receive distinct exam codes, submit & Teacher views Cross-class Report + Live", async ({
    browser,
  }) => {
    // Student1 & Student2 in 12A1 take asg12A1Id -> get different examVariantCodes (101 vs 102)
    const codesIn12A1: string[] = [];
    for (const [stuEmail, targetAsgId] of [
      ["student1@engclass.vn", asg12A1Id],
      ["student2@engclass.vn", asg12A1Id],
      ["student7@engclass.vn", asg12A2Id],
    ] as const) {
      const sCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const sPage = await sCtx.newPage();
      await loginAs(sPage, stuEmail);
      await sPage.goto(`/student/assignments/${targetAsgId}/do`);

      const startBtn = sPage.getByRole("button", { name: /Bắt đầu làm bài|Start/ });
      const submitBtn = sPage.getByTestId("open-submit-btn");
      await Promise.race([
        startBtn.waitFor({ state: "visible", timeout: 15000 }),
        submitBtn.waitFor({ state: "visible", timeout: 15000 }),
      ]);
      if (await startBtn.isVisible()) {
        await startBtn.click();
        await submitBtn.waitFor({ state: "visible", timeout: 15000 });
      }

      const variantBadge = sPage.getByTestId("exam-variant-badge");
      await variantBadge.waitFor({ state: "visible", timeout: 10000 });
      const codeText = await variantBadge.innerText();
      if (targetAsgId === asg12A1Id) {
        codesIn12A1.push(codeText.trim());
      }

      await submitBtn.click();
      await sPage.getByTestId("confirm-submit-btn").click();
      await sPage.getByTestId("submission-result-banner").waitFor({ state: "visible", timeout: 15000 });
      await sCtx.close();
    }

    expect(codesIn12A1).toHaveLength(2);
    expect(codesIn12A1[0]).not.toBe(codesIn12A1[1]);

    // Flow 4: Teacher verifies cross-class report & multi-class Live monitor
    const tCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const tPage = await tCtx.newPage();
    await loginAs(tPage, "teacher1@engclass.vn");
    await tPage.goto(`/teacher/exams/${sessionId}`);

    await tPage.getByTestId("exam-class-comparison-table").waitFor({ state: "visible", timeout: 15000 });
    await expect(tPage.getByTestId("exam-class-comparison-table")).toContainText("12A1");
    await expect(tPage.getByTestId("exam-class-comparison-table")).toContainText("12A2");
    await expect(tPage.getByTestId("exam-question-analytics")).toContainText("Q 1", {
      timeout: 10000,
    }).catch(async () => {
      await expect(tPage.getByTestId("exam-question-analytics")).toContainText("Câu 1");
    });

    await tPage.getByTestId("exam-tab-live").click();
    await tPage.getByTestId("exam-live-tab").waitFor({ state: "visible", timeout: 15000 });
    await expect(tPage.getByTestId("exam-live-tab")).toContainText("student1@engclass.vn");
    await expect(tPage.getByTestId("exam-live-tab")).toContainText("student7@engclass.vn");
    await tCtx.close();
  });
});
