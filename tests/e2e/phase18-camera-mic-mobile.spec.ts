import { test, expect, type Page } from "@playwright/test";

async function loginAs(page: Page, email: string, password = "password123") {
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

test.describe("Phase 18: AI Camera Presets, Iris Gaze, Mic Energy Monitor & Mobile Proctoring", () => {
  test("Test 1: Teacher uses /teacher/settings/camera-test sandbox with presets & mocks at desktop and 375px", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const page = await ctx.newPage();

    await page.addInitScript(() => {
      (
        window as unknown as {
          __engclassCameraMock: {
            observation: {
              faces: number;
              yawDeg: number;
              pitchDeg: number;
              gazeXOffset: number;
              phoneScore: number;
              objectChecked: boolean;
            };
          };
          __engclassMicMock: { rmsVoiceBand: number };
        }
      ).__engclassCameraMock = {
        observation: {
          faces: 1,
          yawDeg: 0,
          pitchDeg: 0,
          gazeXOffset: 0.35,
          phoneScore: 0,
          objectChecked: true,
        },
      };
      (
        window as unknown as { __engclassMicMock: { rmsVoiceBand: number } }
      ).__engclassMicMock = {
        rmsVoiceBand: 0.25,
      };
    });

    await loginAs(page, "teacher1@engclass.vn");
    await page.goto("/teacher/settings");
    await page.getByTestId("open-camera-test-link").click();
    await expect(page).toHaveURL(/\/teacher\/settings\/camera-test$/);

    // Verify 375px layout has zero horizontal overflow
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    );
    expect(noOverflow).toBe(true);

    // Switch sensitivity preset to HIGH (short 2s gaze duration)
    await page.getByTestId("sensitivity-btn-HIGH").click();
    await expect(page.getByTestId("sensitivity-btn-HIGH")).toHaveAttribute("aria-pressed", "true");

    // Start Camera AI & Mic AI sandbox
    await page.getByTestId("toggle-camera-test-btn").click();
    await page.getByTestId("toggle-mic-test-btn").click();

    // Wait for gaze away (after ~3s calib + 2s gaze) and mic voice (2.5s) to log
    await expect(page.getByTestId("camera-test-event-log")).toContainText("CAMERA_GAZE_AWAY", {
      timeout: 15000,
    });
    await expect(page.getByTestId("camera-test-event-log")).toContainText("MIC_VOICE", {
      timeout: 10000,
    });

    await ctx.close();
  });

  test("Test 2: Student passes /rules camera+mic checks, triggers gaze+mic events on /do, teacher filters timeline & opens PhotoLightboxModal on /grading", async ({
    browser,
  }) => {
    const teacherCtx = await browser.newContext();
    const teacherPage = await teacherCtx.newPage();
    await loginAs(teacherPage, "teacher1@engclass.vn");

    const asgData = await teacherPage.evaluate(async () =>
      (await fetch("/api/assignments")).json()
    );
    const camMicAsg = (
      asgData.assignments as Array<{ id: string; title: string; requireMicMonitor?: boolean }>
    ).find((a) => a.title.includes("Phase 18") && a.requireMicMonitor);
    expect(camMicAsg).toBeTruthy();

    const studentCtx = await browser.newContext({ permissions: ["camera", "microphone"] });
    const sPage = await studentCtx.newPage();
    await sPage.addInitScript(() => {
      (
        window as unknown as {
          __engclassCameraMock: {
            observation: {
              faces: number;
              yawDeg: number;
              pitchDeg: number;
              gazeXOffset: number;
              phoneScore: number;
              objectChecked: boolean;
            };
          };
          __engclassMicMock: { rmsVoiceBand: number };
        }
      ).__engclassCameraMock = {
        observation: {
          faces: 1,
          yawDeg: 0,
          pitchDeg: 0,
          gazeXOffset: 0.34,
          phoneScore: 0,
          objectChecked: true,
        },
      };
      (
        window as unknown as { __engclassMicMock: { rmsVoiceBand: number } }
      ).__engclassMicMock = {
        rmsVoiceBand: 0.24,
      };
    });

    await loginAs(sPage, "student1@engclass.vn");
    await sPage.goto(`/student/assignments/${camMicAsg!.id}/do`);
    await sPage.waitForURL(new RegExp(`/student/assignments/${camMicAsg!.id}/rules`), {
      timeout: 15000,
    });

    await expect(sPage.getByTestId("camera-check-box")).toBeVisible();
    await expect(sPage.getByTestId("mic-check-box")).toBeVisible();

    await sPage.getByTestId("rules-agree-checkbox").check();
    await expect(sPage.getByTestId("start-proctored-btn")).toBeDisabled();

    await sPage.getByTestId("check-camera-btn").click();
    await expect(sPage.getByTestId("camera-ready-badge")).toBeVisible({ timeout: 10000 });
    await sPage.getByTestId("camera-consent-checkbox").check();

    await sPage.getByTestId("check-mic-btn").click();
    await expect(sPage.getByTestId("mic-ready-badge")).toBeVisible({ timeout: 10000 });
    await sPage.getByTestId("mic-consent-checkbox").check();

    await expect(sPage.getByTestId("start-proctored-btn")).toBeEnabled();
    await sPage.getByTestId("start-proctored-btn").click();
    await sPage.waitForURL(new RegExp(`/student/assignments/${camMicAsg!.id}/do`), {
      timeout: 15000,
    });

    await expect(sPage.getByTestId("camera-proctor-preview")).toBeVisible({ timeout: 15000 });
    await expect(sPage.getByTestId("mic-proctor-badge")).toBeVisible({ timeout: 15000 });

    // Wait until both CAMERA_GAZE_AWAY and MIC_VOICE are recorded server-side for student1
    await expect
      .poll(
        async () => {
          const snap = await teacherPage.evaluate(async (aid) => {
            const r = await fetch(`/api/assignments/${aid}/live?mode=snapshot`);
            return r.json();
          }, camMicAsg!.id);
          const evs = (snap.recentEvents as Array<{ type: string; studentName: string }>).filter(
            (e) => e.studentName.includes("Minh")
          );
          return {
            gaze: evs.some((e) => e.type === "CAMERA_GAZE_AWAY"),
            mic: evs.some((e) => e.type === "MIC_VOICE"),
          };
        },
        { timeout: 18000 }
      )
      .toEqual({ gaze: true, mic: true });

    // Submit student1's attempt
    await sPage.getByTestId("open-submit-btn").click();
    await sPage.getByTestId("confirm-submit-btn").click();
    await expect(sPage.getByTestId("submission-result-banner")).toBeVisible({ timeout: 15000 });

    // Teacher opens /grading, opens student2's seeded submission with snapshot & all event types
    await teacherPage.goto(`/teacher/assignments/${camMicAsg!.id}/grading`);
    const s2Row = teacherPage.locator("tr", { hasText: "student2@engclass.vn" });
    await expect(s2Row).toBeVisible({ timeout: 15000 });
    await s2Row.getByRole("button", { name: /Chấm & Xem|Grade & view/ }).click();

    const timeline = teacherPage.getByTestId("proctor-timeline-list");
    await expect(timeline).toBeVisible({ timeout: 10000 });

    // Filter chips: CAMERA / AUDIO / SCREEN / ALL
    await teacherPage.getByTestId("proctor-filter-AUDIO").click();
    await expect(timeline).toContainText(/tiếng nói|Voice/i);
    await expect(timeline).not.toContainText(/Rời tab|Left/i);

    await teacherPage.getByTestId("proctor-filter-SCREEN").click();
    await expect(timeline).toContainText(/Rời tab|Left|tab/i);

    await teacherPage.getByTestId("proctor-filter-CAMERA").click();
    const snapBtn = teacherPage.locator('[data-testid^="proctor-snapshot-"]').first();
    await expect(snapBtn).toBeVisible();
    await snapBtn.click();

    await expect(teacherPage.getByTestId("photo-lightbox-modal")).toBeVisible({ timeout: 10000 });

    await studentCtx.close();
    await teacherCtx.close();
  });

  test("Test 3: Mobile viewport (375x812 touch) skips fullscreen lock and records MOBILE_APP_SWITCH on hide/pagehide", async ({
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
    const wsId = wsRes.worksheets[0].id as string;

    const created = await teacherPage.evaluate(
      async ({ classId: cid, worksheetId: wid }) => {
        const res = await fetch("/api/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            classIds: [cid],
            worksheetId: wid,
            title: `E2E Mobile Proctoring ${Date.now()}`,
            maxAttempts: 2,
            shuffle: false,
            shuffleOptions: false,
            showResult: "AFTER_SUBMIT",
            showAnswerKey: false,
            allowLate: false,
            showLeaderboard: "OFF",
            leaderboardAnon: false,
            leaderboardScoreRule: "BEST",
            proctorMode: "LOCKDOWN",
            violationAction: "WARN",
            maxViolations: 3,
            requireFullscreen: true,
            blockCopyPaste: true,
            shareProctorWithParent: false,
            requireCamera: false,
            cameraEnforce: false,
            cameraSnapshots: false,
            audioBlockPause: false,
            audioBlockSeek: false,
          }),
        });
        return res.json();
      },
      { classId, worksheetId: wsId }
    );
    const mobileAsgId = created.assignments[0].id as string;

    const mobileCtx = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
    });
    const mPage = await mobileCtx.newPage();

    try {
      await loginAs(mPage, "student4@engclass.vn");
      await mPage.goto(`/student/assignments/${mobileAsgId}/rules`);
      await expect(mPage.getByTestId("mobile-proctor-rules-banner")).toBeVisible({
        timeout: 15000,
      });

      await mPage.getByTestId("rules-agree-checkbox").check();
      await mPage.getByTestId("start-proctored-btn").click();
      await mPage.waitForURL(new RegExp(`/student/assignments/${mobileAsgId}/do`), {
        timeout: 15000,
      });

      // Mobile mode: shows banner, must NOT show blocking fullscreen gate, zero horizontal overflow
      await expect(mPage.getByTestId("mobile-proctor-banner")).toBeVisible({ timeout: 10000 });
      await expect(mPage.getByTestId("fullscreen-gate")).not.toBeVisible();
      const noOverflow = await mPage.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
      );
      expect(noOverflow).toBe(true);

      // Simulate mobile app switch via pagehide
      await mPage.evaluate(() => {
        window.dispatchEvent(new Event("pagehide"));
      });

      await expect
        .poll(
          async () => {
            const snap = await teacherPage.evaluate(async (aid) => {
              const r = await fetch(`/api/assignments/${aid}/live?mode=snapshot`);
              return r.json();
            }, mobileAsgId);
            return (snap.recentEvents as Array<{ type: string }>).some(
              (ev) => ev.type === "MOBILE_APP_SWITCH"
            );
          },
          { timeout: 10000 }
        )
        .toBe(true);
    } finally {
      await teacherPage.evaluate(async (aid) => {
        await fetch(`/api/assignments/${aid}`, { method: "DELETE" });
      }, mobileAsgId);
      await mobileCtx.close();
      await teacherCtx.close();
    }
  });
});
