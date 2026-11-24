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
});
