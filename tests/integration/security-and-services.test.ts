import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  autosaveSubmissionAnswers,
  getStudentAssignmentPayload,
  startOrResumeSubmission,
  submitByStudent,
} from "@/server/submissionService";
import { recordProctorEvent } from "@/server/proctorService";
import { getAssignmentLeaderboard } from "@/server/leaderboardService";
import { getChildOverviewForParent } from "@/server/parentService";
import {
  getAuthorizedAudioStream,
  requestAudioPlay,
} from "@/server/worksheetAudioService";
import { authorizeFileDownload } from "@/server/worksheetService";
import {
  cloneWorksheetForTeacher,
  exportWorksheetAsZip,
  importWorksheetFile,
} from "@/server/worksheetTransferService";
import { getAssignmentReport } from "@/server/reportService";

describe("Security, Privacy & Proctoring Integration Tests", () => {
  it("NEVER leaks answerKey or gradingOpts to student assignment payload", async () => {
    const student = await prisma.user.findUniqueOrThrow({
      where: { email: "student1@engclass.vn" },
    });
    const assignment = await prisma.assignment.findFirstOrThrow({
      where: { title: { contains: "Unit 7" } },
    });

    const payload = await getStudentAssignmentPayload(assignment.id, student.id);
    const serialized = JSON.stringify(payload);

    expect(serialized).not.toContain('"answerKey"');
    expect(serialized).not.toContain('"gradingOpts"');
    // the worksheet part must never contain the accepted answer (the student's OWN typed
    // answer may legitimately be echoed back in submission.answers)
    if (!payload.revealKey) {
      expect(JSON.stringify(payload.assignment)).not.toContain("has lived");
    }
  });

  it("does NOT expose questions or the PDF before the student starts an attempt", async () => {
    const assignment = await prisma.assignment.findFirstOrThrow({
      where: { title: { contains: "Unit 7" } },
    });
    const student = await prisma.user.findFirstOrThrow({
      where: {
        role: "STUDENT",
        enrollments: { some: { classId: assignment.classId, status: "ACTIVE" } },
        submissions: { none: { assignmentId: assignment.id } },
      },
    });
    const payload = await getStudentAssignmentPayload(assignment.id, student.id);
    expect(payload.submission).toBeNull();
    expect(payload.assignment.worksheet.fields).toHaveLength(0);
    expect(payload.assignment.worksheet.pages).toHaveLength(0);
    expect(payload.assignment.worksheet.pdfFileKey).toBeNull();
    expect(payload.assignment.worksheet.questionCount).toBeGreaterThan(0);
  });

  it("does NOT reveal the answer key while the student can still start another attempt", async () => {
    const assignments = await prisma.assignment.findMany({ where: { showAnswerKey: true } });
    for (const asg of assignments) {
      const subs = await prisma.submission.findMany({
        where: { assignmentId: asg.id, status: { in: ["SUBMITTED", "GRADED"] } },
        select: { studentId: true },
        distinct: ["studentId"],
      });
      for (const { studentId } of subs) {
        const payload = await getStudentAssignmentPayload(asg.id, studentId);
        if (payload.canStartNewAttempt) {
          expect(payload.revealKey).toBe(false);
        }
      }
    }
  });

  it("Parent overview NEVER leaks names or emails of other students", async () => {
    const student1 = await prisma.user.findUniqueOrThrow({
      where: { email: "student1@engclass.vn" },
    });
    const overview = await getChildOverviewForParent(student1.id);
    const serialized = JSON.stringify(overview);

    expect(overview.student.name).toBe("Nguyễn Văn Minh");
    expect(overview.kpis.totalSubmitted).toBeGreaterThan(0);
    expect(overview.classPerformance.length).toBeGreaterThan(0);
    expect(overview.classPerformance[0]!.submittedCount).toBeGreaterThan(0);
    // Other classmates in 12A1 MUST NOT appear anywhere in parent overview payload!
    expect(serialized).not.toContain("Trần Thị Mai");
    expect(serialized).not.toContain("Lê Hoàng Long");
    expect(serialized).not.toContain("Phạm Minh Anh");
    expect(serialized).not.toContain("student2@engclass.vn");
  });

  it("enforces showLeaderboard=AFTER_DUE server-side before deadline", async () => {
    const student = await prisma.user.findUniqueOrThrow({
      where: { email: "student1@engclass.vn" },
    });
    const futureProctorAsg = await prisma.assignment.findFirstOrThrow({
      where: { proctorMode: "LOCKDOWN" },
    });

    const lb = await getAssignmentLeaderboard({
      assignmentId: futureProctorAsg.id,
      viewerId: student.id,
      isTeacher: false,
    });

    expect(lb.visible).toBe(false);
    expect(lb.entries).toEqual([]);
  });

  it("enforces LOCK, RESTART (keeping startedAt + rejecting stale attemptVersion), AUTO_SUBMIT, and prevents editing after submit", async () => {
    const student = await prisma.user.findUniqueOrThrow({
      where: { email: "student6@engclass.vn" },
    });
    const cls = await prisma.class.findUniqueOrThrow({ where: { joinCode: "ENG12A" } });
    const ws = await prisma.worksheet.findFirstOrThrow({
      where: { title: { contains: "Unit 6" } },
      include: { fields: true },
    });
    const firstFieldId = ws.fields[0]!.id;

    // 1. Test LOCK + maxViolations = 1
    const lockAsg = await prisma.assignment.create({
      data: {
        classId: cls.id,
        worksheetId: ws.id,
        title: "[TEST] Lock Exam",
        proctorMode: "LOCKDOWN",
        violationAction: "LOCK",
        maxViolations: 1,
        requireFullscreen: true,
        timeLimitMin: 30,
      },
    });

    try {
      const { submission: lockSub } = await startOrResumeSubmission(lockAsg.id, student.id, {
        rulesAccepted: true,
      });

      // DEVTOOLS_SUSPECTED is heuristic-only and MUST NOT lock!
      const devEv = await recordProctorEvent(lockSub.id, student.id, {
        type: "DEVTOOLS_SUSPECTED",
      });
      expect(devEv.locked).toBe(false);
      expect(devEv.violationCount).toBe(0);

      // TAB_HIDDEN increments violationCount to 1 -> LOCK!
      const lockEv = await recordProctorEvent(lockSub.id, student.id, {
        type: "TAB_HIDDEN",
      });
      expect(lockEv.locked).toBe(true);
      expect(lockEv.violationCount).toBe(1);

      // Autosave MUST fail while locked
      await expect(
        autosaveSubmissionAnswers(lockSub.id, student.id, {
          attemptVersion: lockSub.attemptVersion,
          answers: [{ fieldId: firstFieldId, value: "A" }],
        })
      ).rejects.toThrow(/khoá/i);
    } finally {
      await prisma.assignment.delete({ where: { id: lockAsg.id } });
    }

    // 2. Test RESTART + maxViolations = 1
    const restartAsg = await prisma.assignment.create({
      data: {
        classId: cls.id,
        worksheetId: ws.id,
        title: "[TEST] Restart Exam",
        proctorMode: "LOCKDOWN",
        violationAction: "RESTART",
        maxViolations: 1,
        timeLimitMin: 30,
      },
    });

    try {
      const { submission: rSub } = await startOrResumeSubmission(restartAsg.id, student.id, {
        rulesAccepted: true,
      });
      const originalStartedAt = rSub.startedAt.getTime();

      await autosaveSubmissionAnswers(rSub.id, student.id, {
        attemptVersion: 0,
        answers: [{ fieldId: firstFieldId, value: "A" }],
      });

      const restartEv = await recordProctorEvent(rSub.id, student.id, {
        type: "TAB_HIDDEN",
      });
      expect(restartEv.restarted).toBe(true);
      expect(restartEv.clearedAnswersCount).toBe(1);
      expect(restartEv.attemptVersion).toBe(1);

      // Verify startedAt was NOT reset and answers were wiped
      const reloaded = await prisma.submission.findUniqueOrThrow({
        where: { id: rSub.id },
        include: { answers: true },
      });
      expect(reloaded.startedAt.getTime()).toBe(originalStartedAt);
      expect(reloaded.answers.length).toBe(0);

      // Stale in-flight autosave with old attemptVersion=0 MUST be rejected!
      await expect(
        autosaveSubmissionAnswers(rSub.id, student.id, {
          attemptVersion: 0,
          answers: [{ fieldId: firstFieldId, value: "B" }],
        })
      ).rejects.toThrow(/đặt lại/i);

      // New autosave with attemptVersion=1 succeeds
      const okSave = await autosaveSubmissionAnswers(rSub.id, student.id, {
        attemptVersion: 1,
        answers: [{ fieldId: firstFieldId, value: "A" }],
      });
      expect(okSave.attemptVersion).toBe(1);

      // Submit and ensure no post-submit edits allowed
      await submitByStudent(rSub.id, student.id, { attemptVersion: 1 });
      await expect(
        autosaveSubmissionAnswers(rSub.id, student.id, {
          attemptVersion: 1,
          answers: [{ fieldId: firstFieldId, value: "B" }],
        })
      ).rejects.toThrow(/đã nộp/i);
    } finally {
      await prisma.assignment.delete({ where: { id: restartAsg.id } });
    }

    // 3. Test AUTO_SUBMIT + maxViolations = 2
    const autoSubAsg = await prisma.assignment.create({
      data: {
        classId: cls.id,
        worksheetId: ws.id,
        title: "[TEST] Auto Submit Exam",
        proctorMode: "LOCKDOWN",
        violationAction: "AUTO_SUBMIT",
        maxViolations: 2,
        timeLimitMin: 30,
      },
    });

    try {
      const { submission: aSub } = await startOrResumeSubmission(autoSubAsg.id, student.id, {
        rulesAccepted: true,
      });
      const first = await recordProctorEvent(aSub.id, student.id, { type: "TAB_HIDDEN" });
      expect(first.autoSubmitted).toBe(false);
      expect(first.violationCount).toBe(1);

      const second = await recordProctorEvent(aSub.id, student.id, { type: "TAB_HIDDEN" });
      expect(second.autoSubmitted).toBe(true);
      expect(second.violationCount).toBe(2);
      expect(["SUBMITTED", "GRADED"]).toContain(second.status);
    } finally {
      await prisma.assignment.delete({ where: { id: autoSubAsg.id } });
    }
  });

  it("Enforces audio play limits, resets on new attempt, preserves on RESTART, and blocks direct audio download", async () => {
    const cls = await prisma.class.findUniqueOrThrow({ where: { joinCode: "ENG12A" } });
    const student = await prisma.user.findUniqueOrThrow({
      where: { email: "student6@engclass.vn" },
    });
    const ws = await prisma.worksheet.findFirstOrThrow({
      where: { title: { contains: "Dictation Demo" } },
      include: { audios: true, fields: true },
    });
    const audio = ws.audios[0]!;

    // Student MUST NOT be able to download worksheet audio directly via /api/files/*
    const directAllowed = await authorizeFileDownload(student.id, "STUDENT", audio.fileKey);
    expect(directAllowed).toBe(false);

    // Create an assignment with audioMaxPlays = 2, maxAttempts = null (unlimited), RESTART on 1 violation
    const asg = await prisma.assignment.create({
      data: {
        classId: cls.id,
        worksheetId: ws.id,
        title: "[TEST] Audio Limit & Dictation Exam",
        maxAttempts: null,
        showResult: "AFTER_SUBMIT",
        showAnswerKey: true,
        proctorMode: "LOCKDOWN",
        violationAction: "RESTART",
        maxViolations: 1,
        audioMaxPlays: 2,
      },
    });

    try {
      const { submission: sub1 } = await startOrResumeSubmission(asg.id, student.id, {
        rulesAccepted: true,
      });

      // Security check: dictation transcript MUST NOT leak in payload before submit
      const activePayload = await getStudentAssignmentPayload(asg.id, student.id, sub1.id);
      expect(JSON.stringify(activePayload)).not.toContain("Good morning everyone");

      // Play 1 succeeds & returns valid stream token
      const play1 = await requestAudioPlay(sub1.id, audio.id, student.id);
      expect(play1.playsUsed).toBe(1);
      expect(play1.playsLeft).toBe(1);

      const streamOk = await getAuthorizedAudioStream(sub1.id, audio.id, student.id, play1.token);
      expect(streamOk.size).toBeGreaterThan(44);

      // Invalid/missing token rejected
      await expect(
        getAuthorizedAudioStream(sub1.id, audio.id, student.id, null)
      ).rejects.toThrow(/xác thực/i);
      await expect(
        getAuthorizedAudioStream(sub1.id, audio.id, student.id, "bad.token")
      ).rejects.toThrow(/không hợp lệ/i);

      // Trigger RESTART violation -> plays MUST NOT reset (same submission)
      const restartRes = await recordProctorEvent(sub1.id, student.id, { type: "TAB_HIDDEN" });
      expect(restartRes.restarted).toBe(true);

      // Play 2 succeeds (2/2 used)
      const play2 = await requestAudioPlay(sub1.id, audio.id, student.id);
      expect(play2.playsUsed).toBe(2);
      expect(play2.playsLeft).toBe(0);

      // Play 3 MUST be rejected by server!
      await expect(requestAudioPlay(sub1.id, audio.id, student.id)).rejects.toThrow(
        /hết 2 lượt nghe/i
      );

      // Submit dictation with partial word accuracy (8/10 words correct on 2pt question -> 1.6pt)
      const dictField1 = ws.fields[0]!;
      await submitByStudent(sub1.id, student.id, {
        attemptVersion: restartRes.attemptVersion,
        answers: [
          {
            fieldId: dictField1.id,
            value: "Good morning everyone today we will practice English wrong1 wrong2",
          },
        ],
      });

      const submittedPayload = await getStudentAssignmentPayload(asg.id, student.id, sub1.id);
      expect(submittedPayload.canStartNewAttempt).toBe(true); // unlimited attempts!
      expect(submittedPayload.revealKey).toBe(false); // must not reveal transcript while retries remain
      const d1Ans = submittedPayload.submission?.answers.find((a) => a.fieldId === dictField1.id);
      expect(d1Ans?.score).toBe(1.6);
      expect(JSON.stringify(submittedPayload)).not.toContain("listening skills");

      // Starting a BRAND-NEW attempt (attempt #2) MUST reset audio play counts!
      const { submission: sub2 } = await startOrResumeSubmission(asg.id, student.id, {
        rulesAccepted: true,
      });
      expect(sub2.attemptNo).toBe(2);
      const freshPlay = await requestAudioPlay(sub2.id, audio.id, student.id);
      expect(freshPlay.playsUsed).toBe(1);
    } finally {
      await prisma.assignment.delete({ where: { id: asg.id } });
    }
  });

  it("Treats AI camera events as heuristic by default while enforcing CAMERA_OFF", async () => {
    const cls = await prisma.class.findUniqueOrThrow({ where: { joinCode: "ENG12A" } });
    const student = await prisma.user.findUniqueOrThrow({
      where: { email: "student7@engclass.vn" },
    });
    const ws = await prisma.worksheet.findFirstOrThrow({
      where: { title: { contains: "Unit 6" } },
    });

    const camAsg = await prisma.assignment.create({
      data: {
        classId: cls.id,
        worksheetId: ws.id,
        title: "[TEST] Camera AI Proctored Exam",
        proctorMode: "LOCKDOWN",
        violationAction: "LOCK",
        maxViolations: 1,
        requireCamera: true,
        cameraEnforce: false,
        cameraSnapshots: true,
      },
    });

    try {
      // Starting without cameraConsent must be rejected
      await expect(
        startOrResumeSubmission(camAsg.id, student.id, { rulesAccepted: true })
      ).rejects.toThrow(/camera/i);

      const { submission } = await startOrResumeSubmission(camAsg.id, student.id, {
        rulesAccepted: true,
        cameraConsent: true,
      });
      expect(submission.cameraConsentAt).not.toBeNull();

      // CAMERA_NO_FACE & CAMERA_LOOK_AWAY with cameraEnforce=false MUST NOT lock or increment violations
      const noFace = await recordProctorEvent(submission.id, student.id, {
        type: "CAMERA_NO_FACE",
        durationMs: 5200,
      });
      expect(noFace.violationCount).toBe(0);
      expect(noFace.locked).toBe(false);

      const lookAway = await recordProctorEvent(submission.id, student.id, {
        type: "CAMERA_LOOK_AWAY",
        durationMs: 4300,
      });
      expect(lookAway.violationCount).toBe(0);
      expect(lookAway.locked).toBe(false);

      // CAMERA_OFF MUST be enforced when requireCamera=true!
      const camOff = await recordProctorEvent(submission.id, student.id, {
        type: "CAMERA_OFF",
      });
      expect(camOff.violationCount).toBe(1);
      expect(camOff.locked).toBe(true);
    } finally {
      await prisma.assignment.delete({ where: { id: camAsg.id } });
    }
  });

  it("Exports & re-imports worksheet .engclass.zip with audio intact and enforces teacher sharing on clone", async () => {
    const teacher2 = await prisma.user.findUniqueOrThrow({
      where: { email: "teacher2@engclass.vn" },
    });
    const dictWs = await prisma.worksheet.findFirstOrThrow({
      where: { title: { contains: "Dictation Demo" } },
      include: { fields: true, audios: true },
    });
    const privateWs = await prisma.worksheet.findFirstOrThrow({
      where: { title: { contains: "Unit 6" }, isShared: false },
    });

    // Private worksheet cannot be cloned by another teacher
    await expect(cloneWorksheetForTeacher(privateWs.id, teacher2.id)).rejects.toThrow(
      /chưa được.*chia sẻ/i
    );

    // Export .engclass.zip and import into teacher2's account
    const { buffer, filename } = await exportWorksheetAsZip(dictWs.id);
    expect(filename.endsWith(".engclass.zip")).toBe(true);

    const imported = await importWorksheetFile(teacher2.id, buffer, filename);
    const restoredId = imported.worksheets[0]!.id;
    try {
      const restored = await prisma.worksheet.findUniqueOrThrow({
        where: { id: restoredId },
        include: { fields: true, audios: true },
      });
      expect(restored.ownerId).toBe(teacher2.id);
      expect(restored.audios).toHaveLength(dictWs.audios.length);
      expect(restored.fields).toHaveLength(dictWs.fields.length);
      // audioId on restored fields must point to the NEW cloned WorksheetAudio ID!
      expect(restored.fields[0]?.audioId).toBe(restored.audios[0]?.id);
      expect(restored.fields[0]?.audioId).not.toBe(dictWs.audios[0]?.id);
    } finally {
      await prisma.worksheet.delete({ where: { id: restoredId } });
    }
  });

  it("Returns structured wrong-answer codes and localized report labels for EN and VI", async () => {
    const cls = await prisma.class.findUniqueOrThrow({ where: { joinCode: "ENG12A" } });
    const student = await prisma.user.findUniqueOrThrow({
      where: { email: "student1@engclass.vn" },
    });
    const ws = await prisma.worksheet.findFirstOrThrow({
      where: { title: { contains: "Unit 6" } },
      include: { fields: true },
    });

    const asg = await prisma.assignment.create({
      data: {
        classId: cls.id,
        worksheetId: ws.id,
        title: "[TEST] Report i18n",
        showResult: "AFTER_SUBMIT",
      },
    });

    try {
      const { submission } = await startOrResumeSubmission(asg.id, student.id, {});
      // Submit blank answers so commonWrongAnswers contains BLANK
      await submitByStudent(submission.id, student.id, { answers: [] });

      const reportVi = await getAssignmentReport(asg.id, "vi");
      const reportEn = await getAssignmentReport(asg.id, "en");

      const firstWrongVi = reportVi.questionAnalytics
        .flatMap((q) => q.commonWrongAnswers)
        .find((w) => w.code === "BLANK");
      const firstWrongEn = reportEn.questionAnalytics
        .flatMap((q) => q.commonWrongAnswers)
        .find((w) => w.code === "BLANK");

      expect(firstWrongVi?.answer).toBe("(Bỏ trống)");
      expect(firstWrongEn?.answer).toBe("(Blank)");
    } finally {
      await prisma.assignment.delete({ where: { id: asg.id } });
    }
  });
});
