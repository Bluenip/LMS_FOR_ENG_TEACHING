import zlib from "node:zlib";
import { test, expect, type Page } from "@playwright/test";

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeTinyPng(): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(4, 0);
  ihdr.writeUInt32BE(4, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(4 * (1 + 4 * 3), 120);
  for (let y = 0; y < 4; y++) raw[y * (1 + 12)] = 0;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe.serial("Phase 21: Quick Textbook Assign, Offline Gradebook, Report Card PDF & Parent View", () => {
  let class1Id = "";
  let quickAsgId = "";
  let student1Id = "";

  test("Flow 1 & 2: Teacher quick assigns textbook photo -> Student views attachment, uploads photo & submits", async ({
    browser,
  }) => {
    const tCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const tPage = await tCtx.newPage();
    await loginAs(tPage, "teacher1@engclass.vn");

    const clsData = await tPage.evaluate(async () => (await fetch("/api/classes")).json());
    const class1 = (clsData.classes as Array<{ id: string; joinCode: string }>).find(
      (c) => c.joinCode === "ENG12A"
    );
    expect(class1).toBeTruthy();
    class1Id = class1!.id;

    // Fetch student1's id from class detail for Flow 3 assertions
    const detailData = await tPage.evaluate(async (cid) => {
      const res = await fetch(`/api/classes/${cid}`);
      return res.json();
    }, class1Id);
    const s1 = (
      detailData.class.enrollments as Array<{ student: { id: string; email?: string } }>
    ).find((e) => e.student.email === "student1@engclass.vn");
    expect(s1).toBeTruthy();
    student1Id = s1!.student.id;

    await tPage.goto(`/teacher/classes/${class1Id}?tab=assignments`);
    await tPage.getByTestId("open-quick-textbook-btn").waitFor({ state: "visible", timeout: 15000 });
    await tPage.getByTestId("open-quick-textbook-btn").click();

    await tPage.getByTestId("quick-textbook-modal").waitFor({ state: "visible" });
    await tPage.getByTestId("quick-asg-title").fill("SGK E2E Trang 99");
    await tPage.getByTestId("quick-asg-prompt").fill("Làm bài 4 trang 99 SGK và chụp ảnh vở.");

    await tPage.getByTestId("quick-asg-file-input").setInputFiles({
      name: "sgk-trang-99.png",
      mimeType: "image/png",
      buffer: makeTinyPng(),
    });
    await expect(tPage.getByTestId("quick-textbook-modal")).toContainText("sgk-trang-99.png", {
      timeout: 15000,
    });

    await tPage.getByTestId("quick-asg-submit").click();
    await expect(tPage.getByTestId("quick-textbook-modal")).toBeHidden({ timeout: 15000 });
    await expect(tPage.getByText("SGK E2E Trang 99")).toBeVisible({ timeout: 15000 });

    // Grab new quick assignment ID via API
    const asgData = await tPage.evaluate(async () => (await fetch("/api/assignments")).json());
    const foundAsg = (asgData.assignments as Array<{ id: string; title: string }>).find(
      (a) => a.title === "SGK E2E Trang 99"
    );
    expect(foundAsg).toBeTruthy();
    quickAsgId = foundAsg!.id;
    await tCtx.close();

    // Flow 2: Student1 opens the quick textbook assignment, starts, uploads answer photo & submits
    const sCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const sPage = await sCtx.newPage();
    await loginAs(sPage, "student1@engclass.vn");
    await sPage.goto(`/student/assignments/${quickAsgId}/do`);

    await sPage.getByTestId("quick-textbook-card").waitFor({ state: "visible", timeout: 15000 });
    await expect(sPage.getByTestId("quick-textbook-card")).toContainText("Làm bài 4 trang 99 SGK");

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

    // Upload student notebook photo in PHOTO_UPLOAD input
    const pickBtn = sPage.locator('[data-testid^="photo-pick-btn-"]').first();
    await expect(pickBtn).toBeVisible({ timeout: 10000 });
    const [chooser] = await Promise.all([sPage.waitForEvent("filechooser"), pickBtn.click()]);
    await chooser.setFiles({
      name: "bai-lam-sgk-99.png",
      mimeType: "image/png",
      buffer: makeTinyPng(),
    });
    await expect(sPage.getByAltText("bai-lam-sgk-99.png")).toBeVisible({ timeout: 15000 });

    await submitBtn.click();
    await sPage.getByTestId("confirm-submit-btn").click();
    await sPage.getByTestId("submission-result-banner").waitFor({ state: "visible", timeout: 15000 });
    await sCtx.close();
  });

  test("Flow 3 & 4: Teacher adds offline grade column, edits score inline, exports PDF & Excel; Parent verifies", async ({
    browser,
  }) => {
    const tCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const tPage = await tCtx.newPage();
    await loginAs(tPage, "teacher1@engclass.vn");

    await tPage.goto(`/teacher/classes/${class1Id}?tab=gradebook`);
    await tPage.getByTestId("add-offline-col-btn").waitFor({ state: "visible", timeout: 15000 });
    await tPage.getByTestId("add-offline-col-btn").click();

    await tPage.getByTestId("offline-col-dialog").waitFor({ state: "visible" });
    await tPage.getByTestId("offline-col-title-input").fill("KT Miệng Phase 21");
    await tPage.getByTestId("offline-col-submit-btn").click();
    await expect(tPage.getByTestId("offline-col-dialog")).toBeHidden({ timeout: 15000 });
    await expect(tPage.getByText("KT Miệng Phase 21")).toBeVisible({ timeout: 15000 });

    // Grab new offline column ID via API
    const offRes = await tPage.evaluate(async (cid) => {
      const r = await fetch(`/api/classes/${cid}/offline-grades`);
      return r.json();
    }, class1Id);
    const createdCol = (offRes.columns as Array<{ id: string; title: string }>).find(
      (c) => c.title === "KT Miệng Phase 21"
    );
    expect(createdCol).toBeTruthy();

    // Enter inline score 9.5 for student1 and save
    const scoreInput = tPage.getByTestId(`offline-score-${createdCol!.id}-${student1Id}`);
    await expect(scoreInput).toBeVisible();
    await scoreInput.fill("9.5");
    await tPage.getByTestId("save-offline-scores-btn").click();
    await expect(tPage.getByTestId("save-offline-scores-btn")).toBeHidden({ timeout: 15000 });
    await expect(tPage.getByTestId(`gradebook-avg-${student1Id}`)).not.toHaveText("—");

    // Verify Excel export endpoint returns 200 xlsx
    const xlsxHref = await tPage.getByTestId("export-gradebook-xlsx-btn").getAttribute("href");
    expect(xlsxHref).toBeTruthy();
    const xlsxResp = await tPage.request.get(xlsxHref!);
    expect(xlsxResp.status()).toBe(200);
    expect(xlsxResp.headers()["content-type"]).toContain("spreadsheetml");

    // Open student1 Progress Drawer and verify SVG chart + PDF report card
    await tPage.getByTestId(`gradebook-student-${student1Id}`).click();
    await tPage.getByTestId("student-progress-drawer").waitFor({ state: "visible", timeout: 15000 });
    await expect(tPage.getByTestId("student-progress-svg")).toBeVisible({ timeout: 15000 });

    const pdfHref = await tPage.getByTestId("download-report-card-pdf-btn").getAttribute("href");
    expect(pdfHref).toBeTruthy();
    const pdfResp = await tPage.request.get(pdfHref!);
    expect(pdfResp.status()).toBe(200);
    expect(pdfResp.headers()["content-type"]).toContain("application/pdf");
    const pdfBytes = await pdfResp.body();
    expect(pdfBytes.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    await tCtx.close();

    // Flow 4: Parent Portal shows child's offline paper test scores including 9.5
    const pCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pPage = await pCtx.newPage();
    await loginAs(pPage, "parent1@engclass.vn");
    await pPage.goto("/parent");

    const section = pPage.getByTestId("parent-offline-grades-section");
    await section.waitFor({ state: "visible", timeout: 15000 });
    await expect(section).toContainText("KT Miệng Phase 21");
    await expect(section).toContainText("9.5 / 10");
    await expect(section).toContainText("Kiểm tra 15 phút (Giấy) - Ngữ pháp");
    await pCtx.close();
  });
});
