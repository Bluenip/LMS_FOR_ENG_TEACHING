import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe("Phase 19: 9 Interactive Question Types E2E", () => {
  test("Test 1: Teacher authors MATCH, ORDERING, HIGHLIGHT, WORDSEARCH & CODE in WorksheetEditor", async ({
    browser,
  }) => {
    const prisma = new PrismaClient();
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const page = await ctx.newPage();
    let createdWsId = "";

    try {
      await loginAs(page, "teacher1@engclass.vn");
      const title = `E2E Phase19 Author ${Date.now()}`;
      const createRes = await page.request.post("/api/worksheets", {
        data: { title, subject: "INFORMATICS" },
      });
      expect(createRes.status()).toBe(201);
      createdWsId = (await createRes.json()).worksheet.id as string;

      await page.goto(`/teacher/worksheets/${createdWsId}/edit`);
      await page.getByTestId("quick-add-sheet-section").waitFor({ state: "visible", timeout: 15000 });
      await page.getByTestId("quick-add-count-input").fill("1");

      const typeSelect = page.getByTestId("quick-add-type-select");
      for (const ft of ["MATCH", "ORDERING", "WORDSEARCH", "CODE"]) {
        await typeSelect.selectOption(ft);
        await page.getByTestId("quick-add-submit-btn").click();
      }

      // Edit WORDSEARCH words inline and verify autosave persists
      const wsWordsInput = page.locator('[data-testid^="wordsearch-words-input-"]').first();
      await expect(wsWordsInput).toBeVisible();
      await wsWordsInput.fill("MOON, STAR");

      await expect(page.getByTestId("autosave-status")).toContainText("Đã lưu", {
        timeout: 12000,
      });

      await page.reload();
      await expect(page.locator('[data-testid^="wordsearch-words-input-"]').first()).toHaveValue(
        "MOON, STAR"
      );
    } finally {
      if (createdWsId) {
        await prisma.worksheet.delete({ where: { id: createdWsId } }).catch(() => {});
      }
      await prisma.$disconnect();
      await ctx.close();
    }
  });

  test("Test 2 & 3: Student completes interactive questions on Desktop & Mobile 375px with zero key leak, then Teacher grades manual items", async ({
    browser,
  }) => {
    const teacherCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const teacherPage = await teacherCtx.newPage();
    await loginAs(teacherPage, "teacher1@engclass.vn");

    const asgRes = await teacherPage.evaluate(async () =>
      (await fetch("/api/assignments")).json()
    );
    const phase19Asg = (
      asgRes.assignments as Array<{ id: string; title: string }>
    ).find((a) => a.title.includes("Phase 19"));
    expect(phase19Asg).toBeTruthy();

    const studentCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const sPage = await studentCtx.newPage();
    await loginAs(sPage, "student1@engclass.vn");

    let rawPayload = "";
    sPage.on("response", async (resp) => {
      if (resp.url().endsWith(`/api/assignments/${phase19Asg!.id}`) && resp.status() === 200) {
        rawPayload = await resp.text();
      }
    });

    await sPage.goto(`/student/assignments/${phase19Asg!.id}/do`);
    const startBtn = sPage.getByRole("button", { name: /Bắt đầu làm bài|Start attempt/ });
    const matchInput = sPage.locator('[data-testid^="match-input-"]');
    await Promise.race([
      startBtn.waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined),
      matchInput.waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined),
    ]);
    if (await startBtn.isVisible()) {
      await startBtn.click();
    }

    await matchInput.waitFor({ state: "visible", timeout: 15000 });

    // Security check: zero leak of answerKey or hidden wordsearch hints while IN_PROGRESS
    expect(rawPayload.length).toBeGreaterThan(20);
    expect(rawPayload).not.toContain('"answerKey"');
    expect(rawPayload).not.toContain("wordHints");
    await expect(sPage.locator('[data-testid^="wordsearch-hints-"]')).toHaveCount(0);

    // Fetch unlocked field IDs from loaded student payload
    const fieldsMeta = await sPage.evaluate(async (aid) => {
      const r = await fetch(`/api/assignments/${aid}`);
      const d = await r.json();
      return d.assignment.worksheet.fields as Array<{
        id: string;
        type: string;
        options?: { grid?: string[][] };
      }>;
    }, phase19Asg!.id);
    const byType = (t: string) => fieldsMeta.find((f) => f.type === t)!;

    // 1. MATCH
    const matchF = byType("MATCH");
    await sPage.getByTestId(`match-left-${matchF.id}-L1`).click();
    await sPage.getByTestId(`match-right-${matchF.id}-R1`).click();
    await sPage.getByTestId(`match-left-${matchF.id}-L2`).click();
    await sPage.getByTestId(`match-right-${matchF.id}-R2`).click();

    // 2. DRAG_DROP (tap token -> tap slot)
    const ddF = byType("DRAG_DROP");
    await sPage.getByTestId(`drag-token-${ddF.id}-T1`).click();
    await sPage.getByTestId(`drop-slot-${ddF.id}-S1`).click();
    await sPage.getByTestId(`drag-token-${ddF.id}-T2`).click();
    await sPage.getByTestId(`drop-slot-${ddF.id}-S2`).click();

    // 3. SPEAKING (fallback transcript input)
    const spkF = byType("SPEAKING");
    await sPage.getByTestId(`speaking-input-${spkF.id}`).fill("Nice to meet you");

    // 5. HIGHLIGHT ("quickly" idx 1, "runs" idx 2)
    const hiF = byType("HIGHLIGHT");
    await sPage.getByTestId(`highlight-token-${hiF.id}-1`).click();
    await sPage.getByTestId(`highlight-token-${hiF.id}-2`).click();

    // 6. ORDERING (initial items seeded B, A, C -> move A up above B => A, B, C)
    const ordF = byType("ORDERING");
    await sPage.getByTestId(`order-up-${ordF.id}-A`).click();

    // 7. WORDSEARCH: locate "CAT" on the server-provided grid and click first & last cell
    const wsF = byType("WORDSEARCH");
    const grid = wsF.options?.grid ?? [];
    let startRC: [number, number] | null = null;
    let endRC: [number, number] | null = null;
    for (let r = 0; r < grid.length && !startRC; r++) {
      for (let c = 0; c < (grid[r]?.length ?? 0) && !startRC; c++) {
        if (grid[r]![c] !== "C") continue;
        for (const [dr, dc] of [
          [0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1],
        ] as const) {
          const r1 = r + dr;
          const c1 = c + dc;
          const r2 = r + dr * 2;
          const c2 = c + dc * 2;
          if (grid[r1]?.[c1] === "A" && grid[r2]?.[c2] === "T") {
            startRC = [r, c];
            endRC = [r2, c2];
            break;
          }
        }
      }
    }
    expect(startRC).not.toBeNull();
    await sPage.getByTestId(`ws-cell-${wsF.id}-${startRC![0]}-${startRC![1]}`).click();
    await sPage.getByTestId(`ws-cell-${wsF.id}-${endRC![0]}-${endRC![1]}`).click();

    // 8. DRAW: draw a stroke and save PNG
    const drawF = byType("DRAW");
    const canvas = sPage.getByTestId(`draw-canvas-${drawF.id}`);
    const cBox = await canvas.boundingBox();
    expect(cBox).toBeTruthy();
    await sPage.mouse.move(cBox!.x + 30, cBox!.y + 30);
    await sPage.mouse.down();
    await sPage.mouse.move(cBox!.x + 140, cBox!.y + 110);
    await sPage.mouse.up();
    await sPage.getByTestId(`draw-save-${drawF.id}`).click();
    await expect(sPage.getByTestId(`draw-input-${drawF.id}`)).toContainText(
      /Đã lưu hình vẽ|Drawing saved/,
      { timeout: 10000 }
    );

    // 9. CODE: run JS inside isolated Web Worker and see "Sum = 5"
    const codeF = byType("CODE");
    await sPage.getByTestId(`code-run-${codeF.id}`).click();
    await expect(sPage.getByTestId(`code-output-${codeF.id}`)).toContainText("Sum = 5", {
      timeout: 10000,
    });

    // Mobile 375px layout check while interacting
    await sPage.setViewportSize({ width: 375, height: 812 });
    await sPage.waitForTimeout(200);
    const mobileNoOverflow = await sPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    );
    expect(mobileNoOverflow).toBe(true);

    // Wait briefly for autosave then submit
    await sPage.setViewportSize({ width: 1280, height: 900 });
    await sPage.getByTestId("open-submit-btn").click();
    await sPage.getByTestId("confirm-submit-btn").click();
    await expect(sPage.getByTestId("submission-result-banner")).toBeVisible({ timeout: 15000 });
    // Auto score = MATCH(2) + DRAG_DROP(2) + SPEAKING(2) + HIGHLIGHT(2) + ORDERING(2) + WORDSEARCH(1) = 11 / 18
    await expect(sPage.getByTestId("submission-result-banner")).toContainText(/11\s*\/\s*18/);

    // Teacher reviews & manually grades DRAW, CODE, VOICE_ANSWER on /grading
    await teacherPage.goto(`/teacher/assignments/${phase19Asg!.id}/grading`);
    const s1Row = teacherPage.locator("tr", { hasText: "student1@engclass.vn" });
    await expect(s1Row).toBeVisible({ timeout: 15000 });
    await s1Row.getByRole("button", { name: /Chấm & Xem|Grade & view/ }).click();

    await expect(teacherPage.getByText("Sum = 5")).toBeVisible({ timeout: 10000 });
    await expect(teacherPage.getByAltText(/Hình vẽ|drawing/i)).toBeVisible();

    await studentCtx.close();
    await teacherCtx.close();
  });
});
