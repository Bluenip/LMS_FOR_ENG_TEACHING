import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe("Phase 1 & 2: Auth, Role Routing & Class IDOR", () => {
  test("public landing page renders at / when logged out and redirects to dashboard when logged in", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(3);

    // Navigate from landing page to clean login page
    await page.locator('header a[href="/login"]').first().click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();

    // Sign in -> redirects to teacher dashboard; revisiting / also redirects to /teacher
    await page.fill('input[name="email"]', "teacher1@engclass.vn");
    await page.fill('input[name="password"]', "password123");
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
    await expect(page).toHaveURL(/\/teacher/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/teacher/);

    // Sign out -> stays on the current origin /login (never 0.0.0.0) and / shows landing page again
    await page.locator('header button[title*="Đăng xuất"], header button[title*="Sign out"]').first().click();
    await page.waitForURL(/\/login$/, { timeout: 15000 });
    expect(page.url()).not.toContain("0.0.0.0");

    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("tab")).toHaveCount(3);
    await ctx.close();
  });

  test("redirects each role to its dashboard and blocks cross-role routes", async ({ browser }) => {
    // 1. Teacher
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();
    await loginAs(teacherPage, "teacher1@engclass.vn");
    await expect(teacherPage).toHaveURL(/\/teacher/);
    await teacherPage.goto("/student");
    await expect(teacherPage).toHaveURL(/\/teacher/);
    await teacherPage.goto("/admin");
    await expect(teacherPage).toHaveURL(/\/teacher/);
    await teacherCtx.close();

    // 2. Student
    const studentCtx = await browser.newContext();
    const studentPage = await studentCtx.newPage();
    await loginAs(studentPage, "student1@engclass.vn");
    await expect(studentPage).toHaveURL(/\/student/);
    await studentPage.goto("/teacher");
    await expect(studentPage).toHaveURL(/\/student/);
    await studentPage.goto("/parent");
    await expect(studentPage).toHaveURL(/\/student/);
    await studentCtx.close();

    // 3. Parent
    const parentCtx = await browser.newContext();
    const parentPage = await parentCtx.newPage();
    await loginAs(parentPage, "parent1@engclass.vn");
    await expect(parentPage).toHaveURL(/\/parent/);
    await parentPage.goto("/teacher");
    await expect(parentPage).toHaveURL(/\/parent/);
    await parentCtx.close();

    // 4. Admin
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await loginAs(adminPage, "admin@engclass.vn");
    await expect(adminPage).toHaveURL(/\/admin/);
    await adminCtx.close();
  });

  test("student cannot access another class they are not enrolled in (IDOR)", async ({ browser }) => {
    // Teacher2 fetches class2 ID
    const t2Ctx = await browser.newContext();
    const t2Page = await t2Ctx.newPage();
    await loginAs(t2Page, "teacher2@engclass.vn");
    const t2Classes = await t2Page.evaluate(async () => {
      const r = await fetch("/api/classes");
      return r.json();
    });
    const class2Id = t2Classes.classes[0].id as string;
    await t2Ctx.close();

    // Student1 (enrolled only in Class 1) gets 403 on Class 2
    const s1Ctx = await browser.newContext();
    const s1Page = await s1Ctx.newPage();
    await loginAs(s1Page, "student1@engclass.vn");
    const resStatus = await s1Page.evaluate(async (cid: string) => {
      const r = await fetch(`/api/classes/${cid}`);
      return r.status;
    }, class2Id);
    expect(resStatus).toBe(403);
    await s1Ctx.close();
  });
});

test.describe("Phase 3 & 4: Worksheet Overlay Editor, No answerKey Leak, Zoom 50/100/200% & Mobile 375px", () => {
  test("teacher creates overlay field in editor, student sees aligned overlay at 50/100/200% and 375px, no answerKey leaked, autosave & submit work", async ({
    browser,
  }) => {
    // 1. Teacher opens Unit 7 Worksheet Editor and draws an extra TEXT overlay box
    const teacherCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const teacherPage = await teacherCtx.newPage();
    await loginAs(teacherPage, "teacher1@engclass.vn");

    const wsList = await teacherPage.evaluate(async () => (await fetch("/api/worksheets")).json());
    const unit7Ws = wsList.worksheets.find((w: { title: string }) =>
      w.title.includes("Unit 7")
    );
    expect(unit7Ws).toBeTruthy();

    await teacherPage.goto(`/teacher/worksheets/${unit7Ws.id}/edit`);
    await teacherPage.waitForSelector('[data-editor-page-layer="0"]', { timeout: 20000 });

    // Select TEXT tool and draw a box in a visible region on Page 1
    await teacherPage.click('[data-tool="TEXT"]');
    const layer = teacherPage.locator('[data-editor-page-layer="0"]');
    const box = await layer.boundingBox();
    expect(box).toBeTruthy();
    await teacherPage.mouse.move(box!.x + box!.width * 0.58, box!.y + box!.height * 0.37);
    await teacherPage.mouse.down();
    await teacherPage.mouse.move(box!.x + box!.width * 0.82, box!.y + box!.height * 0.41);
    await teacherPage.mouse.up();

    // Fill accepted answer in properties panel
    const accInput = teacherPage.locator('input[aria-label="Đáp án chấp nhận"]');
    await accInput.fill("e2e-answer");

    // Wait for debounced autosave
    await expect(teacherPage.getByTestId("autosave-status")).toContainText("Đã lưu", {
      timeout: 10000,
    });
    await teacherCtx.close();

    // 2. Student opens Unit 7 Assignment & verifies NO answerKey leak in network payload
    const studentCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const studentPage = await studentCtx.newPage();
    await loginAs(studentPage, "student1@engclass.vn");

    const asgList = await studentPage.evaluate(async () => (await fetch("/api/assignments")).json());
    const unit7Asg = asgList.assignments.find((a: { title: string }) =>
      a.title.includes("Unit 7")
    );
    expect(unit7Asg).toBeTruthy();

    // Intercept GET /api/assignments/:id and assert zero answerKey / gradingOpts leak
    let rawAssignmentResponse = "";
    studentPage.on("response", async (resp) => {
      if (resp.url().endsWith(`/api/assignments/${unit7Asg.id}`) && resp.status() === 200) {
        rawAssignmentResponse = await resp.text();
      }
    });

    await studentPage.goto(`/student/assignments/${unit7Asg.id}/do`);
    // Wait for Start button to hydrate & click it
    const startBtn = studentPage.getByRole("button", { name: "Bắt đầu làm bài" });
    await startBtn.waitFor({ state: "visible", timeout: 15000 });
    await startBtn.click();

    await studentPage.waitForSelector('[data-overlay-field-id]', { timeout: 20000 });
    expect(rawAssignmentResponse).toBeTruthy();
    expect(rawAssignmentResponse).not.toContain('"answerKey"');
    expect(rawAssignmentResponse).not.toContain('"gradingOpts"');

    // Verify normalized overlay coordinate precision at 100%, 50%, 200% zoom!
    const measureRelativePos = async () => {
      return studentPage.evaluate(() => {
        const pageEl = document.querySelector('[data-pdf-page="0"]')!;
        const fieldEl = document.querySelector('[data-pdf-page="0"] [data-overlay-field-id]')!;
        const pRect = pageEl.getBoundingClientRect();
        const fRect = fieldEl.getBoundingClientRect();
        return {
          expectedX: Number(fieldEl.getAttribute("data-norm-x")),
          expectedY: Number(fieldEl.getAttribute("data-norm-y")),
          actualX: (fRect.left - pRect.left) / pRect.width,
          actualY: (fRect.top - pRect.top) / pRect.height,
        };
      });
    };

    // 100% zoom
    const pos100 = await measureRelativePos();
    expect(Math.abs(pos100.actualX - pos100.expectedX)).toBeLessThan(0.015);
    expect(Math.abs(pos100.actualY - pos100.expectedY)).toBeLessThan(0.015);

    // Zoom out to 50% (2 clicks of -25%)
    await studentPage.getByTestId("zoom-out-btn").click();
    await studentPage.getByTestId("zoom-out-btn").click();
    await expect(studentPage.getByTestId("zoom-level")).toHaveText("50%");
    const pos50 = await measureRelativePos();
    expect(Math.abs(pos50.actualX - pos50.expectedX)).toBeLessThan(0.015);
    expect(Math.abs(pos50.actualY - pos50.expectedY)).toBeLessThan(0.015);

    // Zoom in to 200% (6 clicks of +25% from 50%)
    for (let i = 0; i < 6; i++) {
      await studentPage.getByTestId("zoom-in-btn").click();
    }
    await expect(studentPage.getByTestId("zoom-level")).toHaveText("200%");
    const pos200 = await measureRelativePos();
    expect(Math.abs(pos200.actualX - pos200.expectedX)).toBeLessThan(0.015);
    expect(Math.abs(pos200.actualY - pos200.expectedY)).toBeLessThan(0.015);

    // Mobile 375px viewport check!
    await studentPage.setViewportSize({ width: 375, height: 812 });
    const posMobile = await measureRelativePos();
    expect(Math.abs(posMobile.actualX - posMobile.expectedX)).toBeLessThan(0.015);
    expect(Math.abs(posMobile.actualY - posMobile.expectedY)).toBeLessThan(0.015);

    // Reset back to desktop 100% to fill answers & test autosave + reload + submit
    await studentPage.setViewportSize({ width: 1280, height: 900 });
    for (let i = 0; i < 4; i++) {
      await studentPage.getByTestId("zoom-out-btn").click();
    }

    const q1Input = studentPage.locator('input[aria-label="Câu 1"]');
    await q1Input.fill("has lived");
    await expect(studentPage.getByTestId("student-autosave-badge")).toContainText("Đã lưu tự động", {
      timeout: 8000,
    });

    // Reload page -> answer MUST persist via autosave!
    await studentPage.reload();
    await studentPage.waitForSelector('input[aria-label="Câu 1"]', { timeout: 15000 });
    await expect(studentPage.locator('input[aria-label="Câu 1"]')).toHaveValue("has lived");

    // Submit & verify result banner
    await studentPage.getByTestId("open-submit-btn").click();
    await studentPage.getByTestId("confirm-submit-btn").click();
    await expect(studentPage.getByTestId("submission-result-banner")).toBeVisible({
      timeout: 15000,
    });

    await studentCtx.close();
  });
});

test.describe("Phase 6 & 7: Parent Portal IDOR & Privacy", () => {
  test("parent sees own child overview and gets 403 for another parent's child", async ({
    browser,
  }) => {
    // Get parent2's child ID first
    const p2Ctx = await browser.newContext();
    const p2Page = await p2Ctx.newPage();
    await loginAs(p2Page, "parent2@engclass.vn");
    const p2Children = await p2Page.evaluate(async () =>
      (await fetch("/api/parent/children")).json()
    );
    const otherChildId = p2Children.children[0].studentId as string;
    await p2Ctx.close();

    // Parent1 visits /parent -> sees Nguyễn Văn Minh, does NOT see other students, gets 403 on otherChildId
    const p1Ctx = await browser.newContext();
    const p1Page = await p1Ctx.newPage();
    await loginAs(p1Page, "parent1@engclass.vn");
    await expect(p1Page.getByRole("heading", { name: "Nguyễn Văn Minh" })).toBeVisible({
      timeout: 15000,
    });

    const idorStatus = await p1Page.evaluate(async (sid: string) => {
      const r = await fetch(`/api/parent/children/${sid}/overview`);
      return r.status;
    }, otherChildId);
    expect(idorStatus).toBe(403);
    await p1Ctx.close();
  });
});

test.describe("Phase 8: Anti-Cheat Proctoring (Rules, SSE Live, LOCK, RESTART, AUTO_SUBMIT)", () => {
  test("displays configured rules, enforces checkbox, broadcasts SSE to teacher, and locks on 1st tab switch", async ({
    browser,
  }) => {
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();
    await loginAs(teacherPage, "teacher1@engclass.vn");

    const asgData = await teacherPage.evaluate(async () =>
      (await fetch("/api/assignments")).json()
    );
    const proctoredAsg = asgData.assignments.find(
      (a: { proctorMode: string }) => a.proctorMode === "LOCKDOWN"
    );
    expect(proctoredAsg).toBeTruthy();

    // Teacher opens Live Proctoring dashboard & waits for SSE connection
    await teacherPage.goto(`/teacher/assignments/${proctoredAsg.id}/live`);
    await expect(teacherPage.getByTestId("sse-status")).toContainText("SSE Đã kết nối", {
      timeout: 15000,
    });

    // Student opens proctored assignment -> lands on /rules screen
    const studentCtx = await browser.newContext();
    const studentPage = await studentCtx.newPage();
    await loginAs(studentPage, "student5@engclass.vn");
    await studentPage.goto(`/student/assignments/${proctoredAsg.id}/rules`);

    // Verify red strict rules box & disabled start button until checkbox checked
    await expect(studentPage.getByTestId("strict-rules-box")).toContainText("BÀI THI BỊ KHOÁ NGAY");
    const startBtn = studentPage.getByTestId("start-proctored-btn");
    await expect(startBtn).toBeDisabled();
    await studentPage.getByTestId("rules-agree-checkbox").check();
    await expect(startBtn).toBeEnabled();
    await startBtn.click();

    await studentPage.waitForURL(new RegExp(`/student/assignments/${proctoredAsg.id}/do`), {
      timeout: 15000,
    });
    await expect(studentPage.getByTestId("proctor-banner")).toBeVisible();

    // Simulate tab switch (visibilitychange -> hidden) in student page!
    await studentPage.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // Student MUST see locked exam overlay (LOCK + maxViolations = 1)
    await expect(studentPage.getByTestId("locked-exam-overlay")).toBeVisible({
      timeout: 10000,
    });

    // Teacher Live screen MUST receive realtime SSE alert within seconds!
    await expect(teacherPage.getByTestId("live-alerts-feed")).toContainText("Vũ Thu Hà", {
      timeout: 10000,
    });

    await studentCtx.close();
    await teacherCtx.close();
  });

  test("enforces RESTART (clears answers, keeps timer, rejects stale attemptVersion), AUTO_SUBMIT, and WARN via browser flows", async ({
    browser,
  }) => {
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();
    await loginAs(teacherPage, "teacher1@engclass.vn");

    const [clsRes, wsRes] = await Promise.all([
      teacherPage.evaluate(async () => (await fetch("/api/classes")).json()),
      teacherPage.evaluate(async () => (await fetch("/api/worksheets")).json()),
    ]);
    const classId = clsRes.classes[0].id as string;
    const wsId = wsRes.worksheets.find((w: { title: string }) => w.title.includes("Unit 6")).id as string;

    // Create 3 assignments for RESTART, AUTO_SUBMIT, WARN
    const createAsg = async (title: string, violationAction: string, maxViolations: number) => {
      return teacherPage.evaluate(
        async (payload) => {
          const r = await fetch("/api/assignments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const j = await r.json();
          return j.assignments[0].id as string;
        },
        {
          worksheetId: wsId,
          classIds: [classId],
          title,
          timeLimitMin: 30,
          maxAttempts: 1,
          shuffle: false,
          showResult: "AFTER_SUBMIT",
          showAnswerKey: false,
          allowLate: false,
          showLeaderboard: "OFF",
          leaderboardAnon: false,
          leaderboardScoreRule: "BEST",
          proctorMode: "LOCKDOWN",
          violationAction,
          maxViolations,
          requireFullscreen: false,
          blockCopyPaste: true,
          shareProctorWithParent: false,
        }
      );
    };

    const restartId = await createAsg("E2E Restart Exam", "RESTART", 1);
    const autoSubId = await createAsg("E2E AutoSubmit Exam", "AUTO_SUBMIT", 1);
    const warnId = await createAsg("E2E Warn Exam", "WARN", 1);
    await teacherCtx.close();

    const studentCtx = await browser.newContext();
    const page = await studentCtx.newPage();
    await loginAs(page, "student4@engclass.vn");

    // 1. RESTART flow
    await page.goto(`/student/assignments/${restartId}/rules`);
    await page.getByTestId("rules-agree-checkbox").check();
    await page.getByTestId("start-proctored-btn").click();
    await page.waitForURL(new RegExp(`/student/assignments/${restartId}/do`));

    // Capture initial submission ID + answer Q1
    const subInfo = await page.evaluate(async (aid: string) => {
      const r = await fetch(`/api/assignments/${aid}`);
      return r.json();
    }, restartId);
    const firstFieldId = subInfo.assignment.worksheet.fields[0].id as string;
    const subId = subInfo.submission.id as string;
    const initialStartedAt = subInfo.submission.startedAt as string;

    // Save answer with version 0
    const save0 = await page.evaluate(
      async ({ sid, fid }) => {
        const r = await fetch(`/api/submissions/${sid}/answers`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptVersion: 0, answers: [{ fieldId: fid, value: "A" }] }),
        });
        return r.status;
      },
      { sid: subId, fid: firstFieldId }
    );
    expect(save0).toBe(200);

    // Trigger visibilitychange -> RESTART wipes answers & increments attemptVersion!
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByTestId("restarted-banner")).toBeVisible({ timeout: 10000 });

    // Verify startedAt did NOT reset & stale autosave with attemptVersion=0 is rejected (409)!
    const staleStatus = await page.evaluate(
      async ({ sid, fid }) => {
        const r = await fetch(`/api/submissions/${sid}/answers`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptVersion: 0, answers: [{ fieldId: fid, value: "B" }] }),
        });
        return r.status;
      },
      { sid: subId, fid: firstFieldId }
    );
    expect(staleStatus).toBe(409);

    const afterRestart = await page.evaluate(async (aid: string) => {
      const r = await fetch(`/api/assignments/${aid}`);
      return r.json();
    }, restartId);
    expect(afterRestart.submission.startedAt).toBe(initialStartedAt);
    expect(afterRestart.submission.answers).toEqual([]);

    // 2. AUTO_SUBMIT flow
    await page.goto(`/student/assignments/${autoSubId}/rules`);
    await page.getByTestId("rules-agree-checkbox").check();
    await page.getByTestId("start-proctored-btn").click();
    await page.waitForURL(new RegExp(`/student/assignments/${autoSubId}/do`));
    await expect(page.getByTestId("proctor-banner")).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByTestId("submission-result-banner")).toBeVisible({ timeout: 15000 });

    // 3. WARN flow
    await page.goto(`/student/assignments/${warnId}/rules`);
    await page.getByTestId("rules-agree-checkbox").check();
    await page.getByTestId("start-proctored-btn").click();
    await page.waitForURL(new RegExp(`/student/assignments/${warnId}/do`));
    await expect(page.getByTestId("proctor-banner")).toBeVisible({ timeout: 15000 });
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByTestId("violation-counter")).toContainText("1/1", { timeout: 15000 });
    await expect(page.getByTestId("locked-exam-overlay")).not.toBeVisible();

    await studentCtx.close();
  });

  test("Flow 7: Audio play limits, Dictation anti-paste (proctor OFF) & unlimited attempts", async ({
    browser,
  }) => {
    const studentCtx = await browser.newContext();
    const page = await studentCtx.newPage();
    await loginAs(page, "student5@engclass.vn");

    // Navigate to seeded Dictation Demo assignment (proctorMode=OFF, blockCopyPaste=true, audioMaxPlays=2, maxAttempts=null)
    await page.goto("/student");
    await page.getByText("Luyện Chép Chính Tả Tiếng Anh").click();
    // Click the assignment start button inside that card
    const card = page.locator("div.stitch-card-hover", {
      hasText: "Luyện Chép Chính Tả Tiếng Anh",
    });
    await card.getByRole("link").click();
    await page.waitForURL(/\/student\/assignments\/.+\/do/);

    // Verify unlimited attempts label and start
    await expect(page.getByText(/Không giới hạn lượt|Unlimited attempts/)).toBeVisible();
    await page.getByRole("button", { name: /Bắt đầu làm bài|Start/ }).click();

    // Wait for audio player & dictation textarea
    const dictationArea = page.locator("textarea[data-dictation-field-id]").first();
    await expect(dictationArea).toBeVisible({ timeout: 15000 });

    // Verify spellcheck is disabled and paste + drop are blocked even when proctorMode === "OFF"
    expect(await dictationArea.getAttribute("spellcheck")).toBe("false");
    const blockedFlags = await dictationArea.evaluate((el) => {
      const pasteEv = new Event("paste", { bubbles: true, cancelable: true });
      const dropEv = new Event("drop", { bubbles: true, cancelable: true });
      el.dispatchEvent(pasteEv);
      el.dispatchEvent(dropEv);
      return { pasteBlocked: pasteEv.defaultPrevented, dropBlocked: dropEv.defaultPrevented };
    });
    expect(blockedFlags.pasteBlocked).toBe(true);
    expect(blockedFlags.dropBlocked).toBe(true);

    // Check Limited Audio Player: initially 2/2 plays left
    const playBadge = page.locator('[data-testid^="audio-plays-badge-"]').first();
    await expect(playBadge).toContainText(/2\/2/);

    // Play #1
    const playBtn = page.locator('[data-testid^="audio-play-btn-"]').first();
    await playBtn.click();
    await expect(playBadge).toContainText(/1\/2/, { timeout: 10000 });

    // Reload page -> play count MUST persist from server (still 1/2 left!)
    await page.reload();
    await expect(page.locator('[data-testid^="audio-plays-badge-"]').first()).toContainText(
      /1\/2/,
      { timeout: 15000 }
    );

    // Stream without token MUST return 403
    const urlMatch = page.url().match(/\/assignments\/([^/]+)\/do/);
    const assignmentId = urlMatch![1]!;
    const payload = await page.evaluate(async (aid) => {
      const r = await fetch(`/api/assignments/${aid}`);
      return r.json();
    }, assignmentId);
    const subId = payload.submission.id as string;
    const audioId = payload.assignment.worksheet.audios[0].id as string;

    const noTokenStatus = await page.evaluate(
      async ({ sid, aid }) => {
        const r = await fetch(`/api/submissions/${sid}/audio/${aid}/stream`);
        return r.status;
      },
      { sid: subId, aid: audioId }
    );
    expect(noTokenStatus).toBe(403);

    // Last play shows confirmation banner before playing
    await page.locator('[data-testid^="audio-play-btn-"]').first().click();
    await expect(page.locator('[data-testid^="audio-last-play-confirm-"]').first()).toBeVisible();
    await page.locator('[data-testid^="audio-confirm-last-btn-"]').first().click();
    await expect(page.locator('[data-testid^="audio-plays-badge-"]').first()).toContainText(
      /0\/2|hết lượt|No plays left/i,
      { timeout: 10000 }
    );

    await studentCtx.close();
  });

  test("Flow 8: Word auto-create (__answer__), Backup .zip export & Focus Mode (1 question/screen)", async ({
    browser,
  }) => {
    const teacherCtx = await browser.newContext();
    const page = await teacherCtx.newPage();
    await loginAs(page, "teacher1@engclass.vn");

    // 1. Open Word auto-create modal & paste real multi-blank + multi-answer content
    await page.goto("/teacher/worksheets");
    await page.getByTestId("open-word-import-btn").click();
    await page.getByTestId("word-import-title-input").fill("E2E Word Auto Fill");
    await page.getByTestId("word-import-textarea").fill(
      [
        "Câu 1: 1. How many __planets are there in the universe/stars are there in the universe__?",
        "Câu 2: 2. (1) __Find a hill__. Climb __a hill so that you can see over the top__.",
      ].join("\n")
    );
    await page.getByTestId("parse-word-text-btn").click();
    await expect(page.getByTestId("word-import-preview")).toContainText(/3 ô điền|3 blank/);
    await page.getByTestId("confirm-word-import-btn").click();
    await page.waitForURL(/\/teacher\/worksheets\/.+\/edit/, { timeout: 15000 });

    // Extract newly created worksheetId and test Export .zip + .docx endpoints
    const wsId = page.url().match(/\/worksheets\/([^/]+)\/edit/)![1]!;
    const exportChecks = await page.evaluate(async (id) => {
      const zipRes = await fetch(`/api/worksheets/${id}/export?format=zip`);
      const docxRes = await fetch(`/api/worksheets/${id}/export?format=docx`);
      return {
        zipStatus: zipRes.status,
        zipType: zipRes.headers.get("content-type"),
        docxStatus: docxRes.status,
      };
    }, wsId);
    expect(exportChecks.zipStatus).toBe(200);
    expect(exportChecks.zipType).toContain("application/zip");
    expect(exportChecks.docxStatus).toBe(200);
    await teacherCtx.close();

    // 2. Verify Focus Mode (1 question per screen with inline fill-in-the-blank!) as student
    const studentCtx = await browser.newContext();
    const sPage = await studentCtx.newPage();
    await loginAs(sPage, "student5@engclass.vn");
    await sPage.goto("/student");
    const survivalCard = sPage.locator("div.stitch-card-hover", {
      hasText: "Bài học thuộc Unit 17: Survival Tips",
    });
    await survivalCard.getByRole("link").click();
    await sPage.waitForURL(/\/student\/assignments\/.+\/do/);
    await sPage.getByRole("button", { name: /Bắt đầu làm bài|Start/ }).click();

    // Focus runner displays 1 sentence at a time with inline input box
    await expect(sPage.getByTestId("focus-question-runner")).toBeVisible({ timeout: 15000 });
    await expect(sPage.getByTestId("focus-inline-sentence")).toContainText("What");
    const firstInput = sPage.locator("input[data-focus-field-id]").first();
    await firstInput.fill("do you know about jungles");

    // Advance to Question 2, then Question 3 (grouped multi-blank sentence: 2 inline inputs!)
    await sPage.getByTestId("focus-next-btn").click();
    await expect(sPage.getByTestId("focus-inline-sentence")).toContainText("Have you");
    await sPage.getByTestId("focus-next-btn").click();
    await expect(sPage.locator("input[data-focus-field-id]")).toHaveCount(2);

    await studentCtx.close();
  });

  test("Flow 9: Camera AI Proctoring consent gate & mock AI event (heuristic default)", async ({
    browser,
  }) => {
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();
    await loginAs(teacherPage, "teacher1@engclass.vn");

    const [clsRes, wsRes] = await Promise.all([
      teacherPage.evaluate(async () => (await fetch("/api/classes")).json()),
      teacherPage.evaluate(async () => (await fetch("/api/worksheets")).json()),
    ]);
    const classId = clsRes.classes[0].id as string;
    const wsId = wsRes.worksheets.find((w: { title: string }) => w.title.includes("Unit 6")).id as string;

    const camAsgId = await teacherPage.evaluate(
      async (payload) => {
        const r = await fetch("/api/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await r.json();
        return j.assignments[0].id as string;
      },
      {
        worksheetId: wsId,
        classIds: [classId],
        title: "E2E Camera AI Exam",
        timeLimitMin: 30,
        maxAttempts: 1,
        shuffle: false,
        showResult: "AFTER_SUBMIT",
        showAnswerKey: false,
        allowLate: false,
        showLeaderboard: "OFF",
        leaderboardAnon: false,
        leaderboardScoreRule: "BEST",
        proctorMode: "MONITOR",
        violationAction: "LOCK",
        maxViolations: 1,
        requireFullscreen: false,
        blockCopyPaste: true,
        shareProctorWithParent: false,
        requireCamera: true,
        cameraEnforce: false,
        cameraSnapshots: true,
      }
    );

    const studentCtx = await browser.newContext({ permissions: ["camera"] });
    const sPage = await studentCtx.newPage();
    // Inject deterministic camera mock BEFORE page scripts run
    await sPage.addInitScript(() => {
      (window as unknown as { __engclassCameraMock: { observation: { faces: number } } }).__engclassCameraMock = {
        observation: { faces: 0 },
      };
    });
    await loginAs(sPage, "student6@engclass.vn");

    // Going to /do redirects to /rules with camera check & consent gate
    await sPage.goto(`/student/assignments/${camAsgId}/do`);
    await sPage.waitForURL(new RegExp(`/student/assignments/${camAsgId}/rules`));
    await expect(sPage.getByTestId("camera-check-box")).toBeVisible();

    // Start button must stay disabled until camera checked + camera consent + rules agreed
    await sPage.getByTestId("rules-agree-checkbox").check();
    await expect(sPage.getByTestId("start-proctored-btn")).toBeDisabled();

    await sPage.getByTestId("check-camera-btn").click();
    await expect(sPage.getByTestId("camera-ready-badge")).toBeVisible({ timeout: 10000 });
    await sPage.getByTestId("camera-consent-checkbox").check();
    await expect(sPage.getByTestId("start-proctored-btn")).toBeEnabled();
    await sPage.getByTestId("start-proctored-btn").click();
    await sPage.waitForURL(new RegExp(`/student/assignments/${camAsgId}/do`));

    // Floating corner camera preview is visible
    await expect(sPage.getByTestId("camera-proctor-preview")).toBeVisible({ timeout: 15000 });

    // Wait > 5.5s for mock faces=0 to fire CAMERA_NO_FACE -> teacher live snapshot sees it,
    // AND because cameraEnforce=false, student is NOT locked!
    await sPage.waitForTimeout(6500);
    await expect(sPage.getByTestId("locked-exam-overlay")).not.toBeVisible();

    const liveSnap = await teacherPage.evaluate(async (aid) => {
      const r = await fetch(`/api/assignments/${aid}/live?mode=snapshot`);
      return r.json();
    }, camAsgId);
    const hasNoFaceEvent = (liveSnap.recentEvents as Array<{ type: string }>).some(
      (ev) => ev.type === "CAMERA_NO_FACE"
    );
    expect(hasNoFaceEvent).toBe(true);

    // Cleanup created exam
    await teacherPage.evaluate(async (aid) => {
      await fetch(`/api/assignments/${aid}`, { method: "DELETE" });
    }, camAsgId);

    await studentCtx.close();
    await teacherCtx.close();
  });

  test("Flow 10: Stale session redirects to login & grading page in EN has no Vietnamese labels", async ({
    browser,
  }) => {
    const prisma = new PrismaClient();
    const tempEmail = `stale-e2e-${Date.now()}@engclass.vn`;

    try {
      // 1. Server-side stale session check: register temp teacher, sign in, delete user in DB, reload /teacher/worksheets
      const staleCtx = await browser.newContext();
      const stalePage = await staleCtx.newPage();

      // Public registration is disabled: the API must refuse it…
      const regRes = await stalePage.request.post("/api/auth/register", {
        data: { name: "Temp Stale Teacher", email: tempEmail, password: "password123", role: "TEACHER" },
      });
      expect(regRes.status()).toBe(403);
      // …so the temporary teacher is created directly in the database
      await prisma.user.create({
        data: {
          name: "Temp Stale Teacher",
          email: tempEmail,
          role: "TEACHER",
          passwordHash: await bcrypt.hash("password123", 10),
        },
      });

      await loginAs(stalePage, tempEmail, "password123");
      await stalePage.goto("/teacher/worksheets");
      await expect(stalePage).toHaveURL(/\/teacher\/worksheets/);

      // Delete user from DB (simulates database re-seed while browser keeps old JWT cookie)
      await prisma.user.delete({ where: { email: tempEmail } });

      // Reloading a server-rendered protected route must clear cookie & redirect to /login?reason=session
      await stalePage.goto("/teacher/worksheets");
      await stalePage.waitForURL(/\/login\?reason=session/, { timeout: 15000 });
      await expect(stalePage.getByTestId("session-notice")).toContainText(
        /Phiên đăng nhập đã hết hạn|session has expired/i
      );
      await staleCtx.close();

      // 2. Client-side QueryClient 401 UNAUTHORIZED -> triggers signOut to /login?reason=session
      const clientCtx = await browser.newContext();
      const clientPage = await clientCtx.newPage();
      await loginAs(clientPage, "teacher1@engclass.vn");
      await clientPage.route("**/api/worksheets", (route) =>
        route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Tài khoản không tồn tại.",
            code: "UNAUTHORIZED",
          }),
        })
      );
      await clientPage.goto("/teacher/worksheets");
      await clientPage.waitForURL(/\/login\?reason=session/, { timeout: 15000 });
      await expect(clientPage.getByTestId("session-notice")).toBeVisible();
      await clientCtx.close();

      // 3. Grading page in EN mode & English API error responses
      const enCtx = await browser.newContext();
      const enPage = await enCtx.newPage();
      await enCtx.addCookies([
        {
          name: "lang",
          value: "en",
          url: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
        },
      ]);
      await loginAs(enPage, "teacher1@engclass.vn");

      // API error must respond in English when lang=en cookie is set
      const notFoundErr = await enPage.evaluate(async () => {
        const r = await fetch("/api/worksheets/does-not-exist-phase11");
        return r.json();
      });
      expect(notFoundErr.error).toBe("Worksheet not found.");

      // Find seeded Unit 7 assignment and inspect its grading page in EN
      const unit7Asg = await prisma.assignment.findFirstOrThrow({
        where: { title: { contains: "Unit 7" } },
      });
      await enPage.goto(`/teacher/assignments/${unit7Asg.id}/grading`);
      await expect(enPage.getByText("Correct rate per question")).toBeVisible({ timeout: 15000 });
      await expect(enPage.getByText("Student submissions")).toBeVisible();

      const bodyText = await enPage.locator("main").innerText();
      expect(bodyText).not.toContain("(Bỏ trống)");
      expect(bodyText).not.toContain("Đúng / Có");
      expect(bodyText).not.toContain("Sai / Không");
      expect(bodyText).not.toMatch(/\(\d+\s+em\)/);

      await enCtx.close();
    } finally {
      await prisma.user.deleteMany({ where: { email: tempEmail } }).catch(() => {});
      await prisma.$disconnect();
    }
  });

  test("Flow 11: Google Drive UI (Admin card, Teacher Settings, Revoked banner, Storage badges & API security)", async ({
    browser,
  }) => {
    const prisma = new PrismaClient();
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@engclass.vn" } });

    try {
      // 1. Seed a REVOKED shared Drive connection to verify graceful UI notices without crashing
      await prisma.driveConnection.upsert({
        where: { scopeKey: "shared" },
        create: {
          scopeKey: "shared",
          ownerId: null,
          connectedById: admin.id,
          email: "school-drive@engclass.vn",
          encryptedRefreshToken: "",
          scope: "https://www.googleapis.com/auth/drive.file",
          status: "REVOKED",
        },
        update: {
          status: "REVOKED",
          encryptedRefreshToken: "",
          email: "school-drive@engclass.vn",
        },
      });

      // Admin sees Google Drive card with Revoked badge and email
      const adminCtx = await browser.newContext();
      const adminPage = await adminCtx.newPage();
      await loginAs(adminPage, "admin@engclass.vn");
      await expect(adminPage.getByTestId("admin-drive-card")).toBeVisible({ timeout: 15000 });
      await expect(adminPage.getByTestId("drive-status-badge")).toContainText(
        /Đã bị thu hồi|Revoked/
      );
      await expect(adminPage.getByTestId("admin-drive-card")).toContainText(
        "school-drive@engclass.vn"
      );

      // Origin CSRF check: cross-origin POST /api/drive/disconnect MUST be blocked with 403
      const csrfRes = await adminPage.request.post("/api/drive/disconnect", {
        headers: { Origin: "https://evil.example" },
        data: { scope: "shared" },
      });
      expect(csrfRes.status()).toBe(403);
      await adminCtx.close();

      // Teacher sees revoked banner on /teacher/worksheets (no crash), settings card, and editor storage badges
      const teacherCtx = await browser.newContext();
      const tPage = await teacherCtx.newPage();
      await loginAs(tPage, "teacher1@engclass.vn");
      await tPage.goto("/teacher/worksheets");
      await expect(tPage.getByTestId("drive-revoked-banner")).toBeVisible({ timeout: 15000 });

      await tPage.goto("/teacher/settings");
      await expect(tPage.getByTestId("teacher-drive-settings-card")).toBeVisible({
        timeout: 15000,
      });

      // Editor displays storage badge for PDF
      const unit7Ws = await prisma.worksheet.findFirstOrThrow({
        where: { pdfFileKey: { not: null } },
      });
      await tPage.goto(`/teacher/worksheets/${unit7Ws.id}/edit`);
      await expect(tPage.getByTestId("pdf-storage-badge")).toBeVisible({ timeout: 15000 });
      await teacherCtx.close();

      // Student cannot call admin/teacher Drive management routes (403)
      const studentCtx = await browser.newContext();
      const sPage = await studentCtx.newPage();
      await loginAs(sPage, "student1@engclass.vn");
      const studentForbidden = await sPage.evaluate(async () => {
        const [r1, r2, r3] = await Promise.all([
          fetch("/api/drive/maintenance", { method: "POST", body: "{}" }),
          fetch("/api/drive/backup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ all: true }),
          }),
          fetch("/api/drive/files"),
        ]);
        return [r1.status, r2.status, r3.status];
      });
      expect(studentForbidden).toEqual([403, 403, 403]);
      await studentCtx.close();
    } finally {
      await prisma.driveConnection.deleteMany({ where: { scopeKey: "shared" } }).catch(() => {});
      await prisma.$disconnect();
    }
  });
});
