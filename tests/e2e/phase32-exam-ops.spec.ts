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
  await prisma.systemBanner.updateMany({ data: { active: false, maintenanceMode: false } });
  await prisma.$disconnect();
});

test.describe.serial("Phase 32: live rescue, leave requests, standard import, system banner", () => {
  test("Teacher messages a student and adds time from the live screen; the student sees it instantly", async ({ browser }) => {
    const cls = await prisma.class.findFirstOrThrow({ where: { joinCode: "ENG12A" } });
    const ws = await prisma.worksheet.findFirstOrThrow({ where: { title: "Reading: Coral reefs (exam tools demo)" } });
    const student = await prisma.user.findUniqueOrThrow({ where: { email: "student4@engclass.vn" } });
    const asg = await prisma.assignment.create({
      data: { classId: cls.id, worksheetId: ws.id, title: `Live rescue E2E ${Date.now()}`, timeLimitMin: 20, maxAttempts: 1 },
    });

    const sCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const sPage = await sCtx.newPage();
    await loginAs(sPage, student.email);
    await sPage.goto(`/student/assignments/${asg.id}/do`);
    await sPage.getByRole("button", { name: /Bắt đầu làm bài|Start attempt/ }).click();
    await expect(sPage.locator("[data-exam-root]")).toBeVisible();
    await sPage.waitForTimeout(1500); // let the SSE connection open

    const tCtx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const tPage = await tCtx.newPage();
    await loginAs(tPage, "teacher1@engclass.vn");
    await tPage.goto(`/teacher/assignments/${asg.id}/live`);
    await tPage.getByTestId(`rescue-msg-${student.id}`).click();
    await tPage.getByTestId("rescue-msg-input").fill("Em kiểm tra lại câu 2 nhé!");
    await tPage.getByTestId("rescue-msg-send").click();
    await expect(sPage.getByTestId("teacher-message-dialog")).toContainText("Em kiểm tra lại câu 2 nhé!", { timeout: 20000 });
    await sPage.getByRole("button", { name: /Đã hiểu|OK/ }).click();

    await tPage.getByTestId(`rescue-time-5-${student.id}`).click();
    await expect(sPage.getByText(/cộng thêm \+5 phút|added \+5 minutes/)).toBeVisible({ timeout: 20000 });
    const override = await prisma.assignmentOverride.findUniqueOrThrow({ where: { assignmentId_studentId: { assignmentId: asg.id, studentId: student.id } } });
    expect(override.timeLimitMin).toBe(25);
    await sCtx.close();
    await tCtx.close();
  });

  test("Parent requests leave, teacher approves, attendance becomes EXCUSED", async ({ browser }) => {
    const child = await prisma.user.findUniqueOrThrow({ where: { email: "student1@engclass.vn" } });
    const session = await prisma.classSession.findFirstOrThrow({ where: { title: "Buổi ôn tập đặc biệt (demo đơn nghỉ)" }, orderBy: { createdAt: "desc" } });
    await prisma.leaveRequest.deleteMany({ where: { sessionId: session.id, studentId: child.id } });
    await prisma.attendanceRecord.deleteMany({ where: { sessionId: session.id, studentId: child.id } });

    const pCtx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const pPage = await pCtx.newPage();
    await loginAs(pPage, "parent1@engclass.vn");
    await pPage.goto(`/parent?childId=${child.id}`);
    await pPage.getByTestId(`leave-open-${session.id}`).click();
    await pPage.getByTestId("leave-reason").fill("Con bị sốt nhẹ, xin nghỉ một buổi.");
    await pPage.getByTestId("leave-send").click();
    await expect(pPage.getByTestId(`leave-open-${session.id}`)).toBeHidden();
    await pCtx.close();

    const req = await prisma.leaveRequest.findUniqueOrThrow({ where: { sessionId_studentId: { sessionId: session.id, studentId: child.id } } });
    const tCtx = await browser.newContext();
    const tPage = await tCtx.newPage();
    await loginAs(tPage, "teacher1@engclass.vn");
    await tPage.goto(`/teacher/classes/${session.classId}?tab=schedule`);
    await tPage.getByTestId(`leave-approve-${req.id}`).click();
    await expect(tPage.getByTestId(`leave-row-${req.id}`)).toContainText(/Đã duyệt|Approved/);
    const att = await prisma.attendanceRecord.findUniqueOrThrow({ where: { sessionId_studentId: { sessionId: session.id, studentId: child.id } } });
    expect(att.status).toBe("EXCUSED");
    await tCtx.close();
  });

  test("Teacher imports an Aiken file into the question bank", async ({ page }) => {
    const marker = `Aiken E2E ${Date.now()}`;
    await loginAs(page, "teacher1@engclass.vn");
    await page.goto("/teacher/question-bank");
    await page.getByTestId("open-standard-import").click();
    await page.getByTestId("import-content").fill(`${marker}: which is a verb?\nA. table\nB. run\nC. blue\nANSWER: B\n`);
    await page.getByTestId("import-preview-btn").click();
    await expect(page.getByTestId("import-preview")).toContainText(/1 câu hỏi|1 questions/);
    await page.getByTestId("import-confirm").click();
    await expect(page.getByTestId("standard-import-dialog")).toBeHidden();
    const item = await prisma.questionBankItem.findFirstOrThrow({ where: { prompt: { startsWith: marker } } });
    expect(item.answerKey).toEqual({ correct: "B" });
  });

  test("Admin turns on a system banner that every user sees", async ({ browser }) => {
    const aCtx = await browser.newContext();
    const aPage = await aCtx.newPage();
    await loginAs(aPage, "admin@engclass.vn");
    await aPage.goto("/admin/system");
    const msg = `Bảo trì E2E ${Date.now()}`;
    await aPage.getByTestId("banner-message").fill(msg);
    await aPage.getByTestId("banner-active").check();
    await aPage.getByTestId("banner-save").click();
    await expect(aPage.getByText(/Đã lưu thông báo hệ thống|System banner saved/)).toBeVisible();
    await aCtx.close();

    const sCtx = await browser.newContext();
    const sPage = await sCtx.newPage();
    await loginAs(sPage, "student2@engclass.vn");
    await expect(sPage.getByTestId("system-banner")).toContainText(msg, { timeout: 20000 });
    await sCtx.close();
  });
});
