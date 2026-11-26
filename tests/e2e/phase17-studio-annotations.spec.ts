import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import zlib from "zlib";

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePngBuffer(width = 800, height = 560, rgb: [number, number, number] = [235, 242, 255]): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rowStride = 1 + width * 3;
  const raw = Buffer.alloc(rowStride * height);
  for (let y = 0; y < height; y++) {
    const off = y * rowStride;
    for (let x = 0; x < width; x++) {
      raw[off + 1 + x * 3] = rgb[0];
      raw[off + 2 + x * 3] = rgb[1];
      raw[off + 3 + x * 3] = rgb[2];
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

test.describe("Phase 17: Word Exam Import, Studio Undo/Formula, Fill-on-Image, PDF Export & Photo Annotations", () => {
  test("Word Exam import (MCQ + THPT2025 + Essay) -> FormulaToolbar + Undo/Redo -> Printable PDF student & key", async ({
    browser,
  }) => {
    const prisma = new PrismaClient();
    const stamp = Date.now();
    const wsTitle = `E2E P17 Word Exam ${stamp}`;
    let wsId = "";

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      await loginAs(page, "teacher1@engclass.vn");
      await page.goto("/teacher/worksheets");

      await page.getByTestId("open-word-import-btn").click();
      await page.getByTestId("word-mode-exam").click();
      await page.getByTestId("word-import-title-input").fill(wsTitle);
      await page.getByTestId("word-import-textarea").fill(
        [
          "Câu 1: Nghiệm của phương trình 2x - 6 = 0 là:",
          "A. x = 2",
          "*B. x = 3",
          "C. x = 4",
          "D. x = 6",
          "",
          "Câu 2: Xét hàm số bậc hai y = x^2 - 4:",
          "a) Đồ thị đi qua điểm (2; 0). (Đ)",
          "b) Hệ số góc bằng 4. (S)",
          "c) Điểm thấp nhất là (0; -4). (Đ)",
          "d) Trục đối xứng là x = 1. (S)",
          "",
          "Câu 3: [Tự luận] Trình bày cách tìm đỉnh parabol.",
        ].join("\n")
      );
      await page.getByTestId("parse-word-text-btn").click();

      const preview = page.getByTestId("word-exam-preview");
      await expect(preview).toBeVisible({ timeout: 10000 });
      await expect(preview).toContainText("MULTIPLE_CHOICE");
      await expect(preview).toContainText("TRUE_FALSE_GROUP");
      await expect(preview).toContainText("ESSAY");

      const confirmBtn = page.getByTestId("confirm-word-import-btn");
      await expect(confirmBtn).toBeEnabled();
      await confirmBtn.click();

      await page.waitForURL(/\/teacher\/worksheets\/.+\/edit/, { timeout: 20000 });
      wsId = page.url().match(/\/worksheets\/([^/]+)\/edit/)?.[1] ?? "";
      expect(wsId).toBeTruthy();

      // Use FormulaToolbar on first question & verify KaTeX preview renders
      const firstPromptTextarea = page.locator("section textarea").first();
      await expect(firstPromptTextarea).toBeVisible({ timeout: 10000 });
      const originalPrompt = await firstPromptTextarea.inputValue();

      await page.getByTestId("formula-toolbar-toggle").first().click();
      await page.getByTestId("formula-snippet-frac").first().click();

      await expect(firstPromptTextarea).toHaveValue(/\\frac\{a\}\{b\}/);
      await expect(page.locator("section .katex").first()).toBeVisible();

      // Undo reverts the snippet insertion, Redo brings it back
      const undoBtn = page.getByTestId("editor-undo-btn");
      const redoBtn = page.getByTestId("editor-redo-btn");
      await expect(undoBtn).toBeEnabled();
      await undoBtn.click();
      await expect(firstPromptTextarea).toHaveValue(originalPrompt);
      await expect(redoBtn).toBeEnabled();
      await redoBtn.click();
      await expect(firstPromptTextarea).toHaveValue(/\\frac\{a\}\{b\}/);

      // Export Printable PDF in both Student and Answer Key modes
      await expect(page.getByTestId("editor-export-pdf-student")).toBeVisible();
      await expect(page.getByTestId("editor-export-pdf-key")).toBeVisible();

      const studentPdfRes = await page.request.get(
        `/api/worksheets/${wsId}/export?format=pdf&mode=student`
      );
      expect(studentPdfRes.status()).toBe(200);
      expect(studentPdfRes.headers()["content-type"]).toContain("application/pdf");
      const studentBytes = await studentPdfRes.body();
      expect(studentBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");

      const keyPdfRes = await page.request.get(
        `/api/worksheets/${wsId}/export?format=pdf&mode=key`
      );
      expect(keyPdfRes.status()).toBe(200);
      const keyBytes = await keyPdfRes.body();
      expect(keyBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    } finally {
      if (wsId) {
        await prisma.worksheet.delete({ where: { id: wsId } }).catch(() => {});
      }
      await prisma.$disconnect();
      await ctx.close();
    }
  });

  test("Fill on image -> student mobile 375px check & photo upload -> teacher PhotoAnnotatorModal -> student read-only view", async ({
    browser,
  }) => {
    const prisma = new PrismaClient();
    const stamp = Date.now();
    const wsTitle = `E2E P17 FillImage ${stamp}`;
    const asgTitle = `E2E P17 Annotate ${stamp}`;
    let wsId = "";
    let asgId = "";

    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();
    const studentCtx = await browser.newContext();
    const studentPage = await studentCtx.newPage();

    try {
      await loginAs(teacherPage, "teacher1@engclass.vn");
      await teacherPage.goto("/teacher/worksheets");

      await teacherPage
        .getByRole("button", { name: /Tạo worksheet|Create worksheet/i })
        .first()
        .click();
      await teacherPage.getByTestId("subject-option-MATH").click();
      await teacherPage
        .locator('input[placeholder*="Hàm số"], input[placeholder*="Unit 8"]')
        .first()
        .fill(wsTitle);
      await teacherPage.getByTestId("confirm-create-worksheet-btn").click();
      await teacherPage.waitForURL(/\/teacher\/worksheets\/.+\/edit/, { timeout: 20000 });
      wsId = teacherPage.url().match(/\/worksheets\/([^/]+)\/edit/)?.[1] ?? "";
      expect(wsId).toBeTruthy();

      // Upload background image (Fill on image)
      await teacherPage.getByTestId("bg-images-input").setInputFiles({
        name: "math-page-1.png",
        mimeType: "image/png",
        buffer: makePngBuffer(900, 620, [242, 246, 255]),
      });

      const canvasImg = teacherPage.locator('[data-pdf-page="0"] img[src*="/api/files/worksheets/"]');
      await expect(canvasImg).toBeVisible({ timeout: 15000 });

      // Add 1 PHOTO_UPLOAD question in answer sheet
      await teacherPage.getByTestId("studio-view-sheet").click();
      await teacherPage.locator('input[type="number"][max="100"]').first().fill("1");
      await teacherPage.getByTestId("quick-add-type-select").selectOption("PHOTO_UPLOAD");
      await teacherPage.getByRole("button", { name: /Thêm vào phiếu|Add to sheet/i }).click();

      await expect
        .poll(
          async () => {
            const count = await prisma.field.count({
              where: { worksheetId: wsId, type: "PHOTO_UPLOAD" },
            });
            return count;
          },
          { timeout: 15000 }
        )
        .toBe(1);

      const photoField = await prisma.field.findFirstOrThrow({
        where: { worksheetId: wsId, type: "PHOTO_UPLOAD" },
        select: { id: true },
      });

      // Assign to class 12A1 with shuffleOptions enabled
      await teacherPage.goto(`/teacher/assignments/new?worksheetId=${wsId}`);
      await expect(teacherPage.locator("#assignment-title")).toBeVisible({ timeout: 15000 });
      await teacherPage.locator("#assignment-title").fill(asgTitle);
      await teacherPage
        .locator('#step-classes button[role="checkbox"]')
        .filter({ hasText: "12A1" })
        .first()
        .click();
      await teacherPage.getByTestId("shuffle-options-switch").click();
      await teacherPage.locator('button[type="submit"]').first().click();
      await teacherPage.waitForURL((url) => !url.pathname.endsWith("/new"), { timeout: 20000 });

      const createdAsg = await prisma.assignment.findFirstOrThrow({
        where: { title: asgTitle },
        select: { id: true },
      });
      asgId = createdAsg.id;

      // Student1 opens assignment, sees Fill-on-image background, verifies 375px layout, uploads photo, submits
      await loginAs(studentPage, "student1@engclass.vn");
      await studentPage.goto(`/student/assignments/${asgId}/do`);
      await studentPage.getByRole("button", { name: /Bắt đầu làm bài|Start/i }).click();

      const studentBgImg = studentPage.locator('[data-pdf-page="0"] img[src*="/api/files/worksheets/"]');
      await expect(studentBgImg).toBeVisible({ timeout: 15000 });

      await studentPage.setViewportSize({ width: 375, height: 812 });
      const mobileOverflow = await studentPage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(mobileOverflow).toBeLessThanOrEqual(1);
      await studentPage.setViewportSize({ width: 1280, height: 800 });

      const photoUploadZone = studentPage.locator(`[data-photo-upload-field-id="${photoField.id}"]`);
      await photoUploadZone.locator('input[type="file"]').last().setInputFiles({
        name: "student-work.png",
        mimeType: "image/png",
        buffer: makePngBuffer(500, 350, [255, 250, 235]),
      });
      await expect(photoUploadZone.locator("img")).toBeVisible({ timeout: 15000 });
      await expect(studentPage.getByTestId("student-autosave-badge")).toContainText(/Đã lưu tự động|Auto-saved/i, {
        timeout: 10000,
      });

      await studentPage.getByTestId("open-submit-btn").click();
      await studentPage.getByTestId("confirm-submit-btn").click();
      await expect(studentPage.getByTestId("submission-result-banner")).toBeVisible({ timeout: 15000 });

      const sub = await prisma.submission.findFirstOrThrow({
        where: { assignmentId: asgId },
        orderBy: { startedAt: "desc" },
        select: { id: true },
      });

      // Teacher opens Grade by Question -> clicks thumbnail -> annotates check mark -> saves -> grades
      await teacherPage.goto(`/teacher/assignments/${asgId}/grading`);
      await teacherPage.getByTestId("tab-grade-by-question").click();
      const qItem = teacherPage.getByTestId(`qgrade-item-${sub.id}`);
      await expect(qItem).toBeVisible({ timeout: 15000 });

      await qItem.locator("button:has(img)").first().click();
      const annotatorModal = teacherPage.getByTestId("photo-annotator-modal");
      await expect(annotatorModal).toBeVisible({ timeout: 10000 });

      await teacherPage.getByTestId("annotator-tool-check").click();
      const svgLayer = teacherPage.getByTestId("annotator-svg-layer");
      await expect
        .poll(async () => (await svgLayer.boundingBox())?.width ?? 0, { timeout: 10000 })
        .toBeGreaterThan(100);
      const box = await svgLayer.boundingBox();
      expect(box).toBeTruthy();
      await teacherPage.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

      await expect(svgLayer.locator("path")).toHaveCount(1);
      await teacherPage.getByTestId("annotator-save-btn").click();
      await expect(annotatorModal).toContainText(/1/, { timeout: 10000 });

      await teacherPage.keyboard.press("Escape");
      await expect(annotatorModal).toHaveCount(0);

      await qItem.getByTestId(`qgrade-score-${sub.id}`).fill("4");
      await qItem.getByTestId(`qgrade-save-${sub.id}`).click();
      await expect(qItem).toContainText(/Đã có điểm|Graded/i, { timeout: 10000 });

      // Student1 reloads graded submission -> sees Annotated badge & read-only SVG annotation layer
      await studentPage.reload();
      await expect(studentPage.getByTestId("submission-result-banner")).toBeVisible({ timeout: 15000 });

      const annotatedBadge = studentPage.locator('[data-testid^="photo-annotated-badge-"]').first();
      await expect(annotatedBadge).toBeVisible({ timeout: 10000 });
      await annotatedBadge.click();

      const readonlyModal = studentPage.getByTestId("photo-annotator-readonly");
      await expect(readonlyModal).toBeVisible({ timeout: 10000 });
      await expect(readonlyModal.getByTestId("annotator-svg-layer").locator("path")).toHaveCount(1);
    } finally {
      if (asgId) {
        await prisma.assignment.delete({ where: { id: asgId } }).catch(() => {});
      }
      if (wsId) {
        await prisma.worksheet.delete({ where: { id: wsId } }).catch(() => {});
      }
      await prisma.$disconnect();
      await teacherCtx.close();
      await studentCtx.close();
    }
  });
});
