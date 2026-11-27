import fs from "fs";
import { test, expect, type Page } from "@playwright/test";
import { encodeGrayPng } from "../../src/lib/omr/png";
import { studentSbd } from "../../src/lib/omr/sbd";
import { idMarks, marksFromValues, renderSyntheticSheet } from "../../src/lib/omr/synthetic";

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe.serial("Phase 28: OMR paper bubble sheets", () => {
  test("Teacher creates a sheet, uploads a tilted photo, fixes a faint mark on a 375px phone and syncs to the gradebook", async ({
    browser,
  }, testInfo) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await loginAs(page, "teacher1@engclass.vn");

    const classes = await page.evaluate(async () => (await fetch("/api/classes")).json());
    const classId = (classes.classes as Array<{ id: string; joinCode: string }>).find((c) => c.joinCode === "ENG12A")!.id;
    const detail = await page.evaluate(async (cid) => (await fetch(`/api/classes/${cid}`)).json(), classId);
    const student = (detail.class.enrollments as Array<{ student: { id: string; email: string; name: string } }>).find(
      (e) => e.student.email === "student3@engclass.vn"
    )!.student;

    // 1. Create the sheet from the class page
    await page.goto(`/teacher/classes/${classId}/omr`);
    await page.getByTestId("omr-create-open").click();
    const title = `OMR E2E ${Date.now()}`;
    await page.getByTestId("omr-title-input").fill(title);
    await page.getByTestId("omr-create-submit").click();
    await page.waitForURL(/\/teacher\/omr\/[^/]+$/, { timeout: 20000 });
    const sheetId = page.url().split("/").pop()!;

    // 2. Type a 3-question key: B, D, A
    await page.getByTestId("omr-key-mc-1-B").click();
    await page.getByTestId("omr-key-mc-2-D").click();
    await page.getByTestId("omr-key-mc-3-A").click();
    await page.getByTestId("omr-key-save").click();
    await expect(page.getByText(/Đã lưu đáp án|Key saved/)).toBeVisible();

    // 3. Photo of a filled sheet: Q1 B (right), Q2 faint D, Q3 C (wrong)
    const values = { ...idMarks(studentSbd(classId, student.id)), "mc:1": "B", "mc:3": "C" };
    const marks = { ...marksFromValues(values), "mc:2": { value: "D", ink: 185 } };
    const photo = renderSyntheticSheet({
      template: "MC_20",
      marks,
      photo: {
        width: 1250,
        height: 1700,
        corners: [
          { x: 120, y: 140 },
          { x: 1120, y: 110 },
          { x: 1160, y: 1540 },
          { x: 80, y: 1580 },
        ],
      },
    });
    const file = testInfo.outputPath("sheet.png");
    fs.writeFileSync(file, encodeGrayPng(photo));

    await page.getByTestId("omr-open-scanner").click();
    await page.waitForURL(/\/scan$/);
    await page.getByTestId("omr-file-input").setInputFiles(file);
    await expect(page.getByTestId("omr-review")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("omr-matched-student")).toContainText(student.name);
    await expect(page.getByTestId("omr-review-count")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    // 4. One tap on the flagged bubble fixes Q2 → 2/3 correct
    await page.getByTestId("omr-bubble-mc:2-D").click({ force: true });
    await expect(page.getByTestId("omr-review-count")).toBeHidden();
    await expect(page.getByTestId("omr-preview-score")).toHaveText("6.67/10");
    await page.getByTestId("omr-save").click();
    await expect(page.getByTestId("omr-review")).toBeHidden({ timeout: 20000 });

    // 5. Sync to the gradebook
    await page.goto(`/teacher/omr/${sheetId}`);
    await expect(page.locator('[data-testid^="omr-scan-row-"]')).toHaveCount(1);
    await page.getByTestId("omr-sync").click();
    await expect(page.getByText(/Đã đẩy điểm 1 học sinh|Sent 1 scores/)).toBeVisible();

    const columns = await page.evaluate(async (cid) => (await fetch(`/api/classes/${cid}/offline-grades`)).json(), classId);
    const col = (columns.columns as Array<{ title: string; entries: Array<{ studentId: string; score: number | null }> }>).find(
      (c) => c.title === title
    );
    expect(col).toBeTruthy();
    expect(col!.entries.find((e) => e.studentId === student.id)?.score).toBe(6.67);

    // 6. The student sees the graded sheet with green / red rings
    const sCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const sPage = await sCtx.newPage();
    await loginAs(sPage, "student3@engclass.vn");
    await sPage.goto(`/student/classes/${classId}?tab=assignments`);
    await expect(sPage.getByTestId("my-omr-scans")).toContainText(title);
    await sPage.getByTestId("my-omr-scans").getByText(title).click();
    await expect(sPage.getByTestId("omr-viewer").getByTestId("omr-overlay")).toBeVisible();

    await sCtx.close();
    await ctx.close();
  });
});
