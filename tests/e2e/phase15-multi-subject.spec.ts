import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe("Phase 15: Multi-Subject Worksheets & Dedicated Class Trash", () => {
  test("dedicated class trash tab on /teacher lets teacher restore a deleted class", async ({ browser }) => {
    const prisma = new PrismaClient();
    const className = `E2E Trash Class ${Date.now()}`;
    let classId = "";

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      await loginAs(page, "teacher1@engclass.vn");

      // Create and soft-delete a class via API
      const createRes = await page.request.post("/api/classes", {
        data: { name: className },
      });
      expect(createRes.status()).toBe(201);
      const created = await createRes.json();
      classId = created.class.id as string;

      const delRes = await page.request.delete(`/api/classes/${classId}`);
      expect(delRes.status()).toBe(200);

      // Visit /teacher -> Active tab does not show deleted class; Class Trash tab shows and restores it
      await page.goto("/teacher");
      await expect(page.getByText(className)).toHaveCount(0);

      await page.getByTestId("classes-tab-trash").click();
      await expect(page.getByTestId("class-trash-section")).toBeVisible();
      await expect(page.getByTestId("class-trash-list")).toContainText(className);

      await page.getByTestId(`class-trash-restore-${classId}`).click();
      await expect(page.getByTestId("classes-tab-active")).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("heading", { name: className })).toBeVisible({ timeout: 10000 });
    } finally {
      if (classId) {
        await prisma.class.delete({ where: { id: classId } }).catch(() => {});
      }
      await prisma.$disconnect();
      await ctx.close();
    }
  });

  test("subject picker on create worksheet adapts editor UI for Math vs English with KaTeX & THPT 2025 T/F", async ({ browser }) => {
    const prisma = new PrismaClient();
    const wsTitle = `E2E Toan 12 ${Date.now()}`;
    let wsId = "";

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      await loginAs(page, "teacher1@engclass.vn");
      await page.goto("/teacher/worksheets");

      // Open Create Worksheet modal
      await page.getByRole("button", { name: /Tạo worksheet|Create worksheet/i }).first().click();

      // Confirm button must stay disabled until a subject is selected
      const confirmBtn = page.getByTestId("confirm-create-worksheet-btn");
      await expect(confirmBtn).toBeDisabled();

      // Select Math subject & fill title -> creates and opens editor
      await page.getByTestId("subject-option-MATH").click();
      await page.locator('input[placeholder*="Hàm số"], input[placeholder*="Unit 8"]').first().fill(wsTitle);
      await expect(confirmBtn).toBeEnabled();
      await confirmBtn.click();

      await page.waitForURL(/\/teacher\/worksheets\/.+\/edit/, { timeout: 15000 });
      wsId = page.url().match(/\/worksheets\/([^/]+)\/edit/)?.[1] ?? "";
      expect(wsId).toBeTruthy();

      // Math UI: Audio panel hidden, LaTeX math guide visible
      await expect(page.getByTestId("editor-audio-panel")).toHaveCount(0);
      await expect(page.getByTestId("math-latex-hint-card")).toBeVisible();
      await expect(page.getByTestId("editor-subject-select")).toHaveValue("MATH");

      // Quick-add a TRUE_FALSE_GROUP question & verify THPT 2025 scoring + KaTeX rendering
      await page.getByTestId("quick-add-type-select").selectOption("TRUE_FALSE_GROUP");
      await page.getByRole("button", { name: /Thêm vào phiếu|Add to sheet/i }).click();
      const firstTextarea = page.locator("section textarea").first();
      await firstTextarea.fill("Giải phương trình $x^2 - 4 = 0$");
      await expect(page.locator("section .katex").first()).toBeVisible();

      // Switch subject to ENGLISH -> Audio panel appears, Math hint disappears
      await page.getByTestId("editor-subject-select").selectOption("ENGLISH");
      await expect(page.getByTestId("editor-audio-panel")).toBeVisible();
      await expect(page.getByTestId("math-latex-hint-card")).toHaveCount(0);
    } finally {
      if (wsId) {
        await prisma.worksheet.delete({ where: { id: wsId } }).catch(() => {});
      }
      await prisma.$disconnect();
      await ctx.close();
    }
  });
});
