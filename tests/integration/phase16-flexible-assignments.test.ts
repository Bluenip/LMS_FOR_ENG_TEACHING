import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass, getClassDetail } from "@/server/classService";
import {
  createAssignmentsForClasses,
  listStudentAssignments,
  updateAssignment,
} from "@/server/assignmentService";
import {
  deleteAssignmentOverride,
  listAssignmentOverrides,
  upsertAssignmentOverride,
} from "@/server/assignmentOverrideService";
import {
  createCommentPreset,
  deleteCommentPreset,
  listCommentPresets,
} from "@/server/commentPresetService";
import { sendDueSoonReminders } from "@/server/reminderService";
import { createWorksheet, saveWorksheetFields } from "@/server/worksheetService";
import {
  finalizeSubmissionInternal,
  getStudentAssignmentPayload,
  saveSingleFieldGrade,
  startOrResumeSubmission,
} from "@/server/submissionService";
import {
  getAssignmentQuestionGradingData,
  getAssignmentReport,
} from "@/server/reportService";
import { getChildOverviewForParent } from "@/server/parentService";
import { requireStudentForAssignment } from "@/lib/permissions";

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const stamp = Date.now();
const prefix = `p16-${stamp}`;
const emails: string[] = [];

let adminId = "";
let teacherId = "";
let otherTeacherId = "";
let student1Id = "";
let student2Id = "";
let student3Id = "";
let parent1Id = "";
let parent2Id = "";

async function makeUser(tag: string, role: "TEACHER" | "STUDENT" | "PARENT") {
  const email = `${prefix}-${tag}@test.vn`;
  emails.push(email);
  const res = await createAccount(
    { id: adminId, role: "ADMIN" },
    { name: `${prefix} ${tag}`, email, role, password: "Password12345" }
  );
  return res.user.id;
}

beforeAll(async () => {
  adminId = (
    await prisma.user.findFirstOrThrow({
      where: { role: "ADMIN", deletedAt: null, isLocked: false },
    })
  ).id;
  teacherId = await makeUser("t1", "TEACHER");
  otherTeacherId = await makeUser("t2", "TEACHER");
  student1Id = await makeUser("s1", "STUDENT");
  student2Id = await makeUser("s2", "STUDENT");
  student3Id = await makeUser("s3", "STUDENT");
  parent1Id = await makeUser("p1", "PARENT");
  parent2Id = await makeUser("p2", "PARENT");

  await prisma.parentLink.createMany({
    data: [
      { parentId: parent1Id, studentId: student1Id, relation: "Phụ huynh", verifiedAt: new Date() },
      { parentId: parent2Id, studentId: student2Id, relation: "Phụ huynh", verifiedAt: new Date() },
    ],
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [teacherId, otherTeacherId] } } });
  await prisma.notification.deleteMany({
    where: { userId: { in: [student1Id, student2Id, student3Id, teacherId] } },
  });
  await prisma.teacherCommentPreset.deleteMany({
    where: { teacherId: { in: [teacherId, otherTeacherId] } },
  });
  await prisma.parentLink.deleteMany({ where: { parentId: { in: [parent1Id, parent2Id] } } });
  await prisma.class.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.worksheet.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

describe("Phase 16: Targeted Assignments, Individual Overrides, Reminders & Rubric Grading", () => {
  it("enforces AssignmentTarget visibility across student list, class detail, permissions, parent view, and reports", async () => {
    const cls = await createClass(teacherId, { name: `${prefix} Targeted Class` });
    await prisma.enrollment.createMany({
      data: [
        { classId: cls.id, studentId: student1Id, status: "ACTIVE" },
        { classId: cls.id, studentId: student2Id, status: "ACTIVE" },
      ],
    });

    const ws = await createWorksheet(teacherId, {
      title: `${prefix} Targeted Worksheet`,
      subject: "ENGLISH",
    });
    const saved = await saveWorksheetFields(ws.id, [
      {
        placement: "ANSWER_SHEET",
        type: "TEXT",
        label: "1",
        prompt: "Capital of France?",
        order: 0,
        points: 2,
        answerKey: { accepted: ["Paris"] },
        explanation: "Paris is the capital.",
      },
      {
        placement: "ANSWER_SHEET",
        type: "ESSAY",
        label: "2",
        prompt: "Write a short paragraph.",
        order: 1,
        points: 3,
        answerKey: { rubric: "Clarity & grammar" },
        rubric: [
          { id: "r_content", title: "Content", maxPoints: 1.5 },
          { id: "r_grammar", title: "Grammar", maxPoints: 1.5 },
        ],
      },
    ]);
    expect(saved[1]?.rubric).toHaveLength(2);

    const [asgRaw] = await createAssignmentsForClasses(teacherId, false, {
      worksheetId: ws.id,
      classIds: [cls.id],
      title: `${prefix} Targeted Assignment`,
      maxAttempts: 1,
      shuffle: false,
      showResult: "AFTER_SUBMIT",
      showAnswerKey: true,
      allowLate: false,
      showLeaderboard: "AFTER_SUBMIT",
      leaderboardAnon: false,
      leaderboardScoreRule: "BEST",
      proctorMode: "OFF",
      violationAction: "WARN",
      maxViolations: 3,
      requireFullscreen: false,
      blockCopyPaste: false,
      shareProctorWithParent: false,
      requireCamera: false,
      cameraEnforce: false,
      cameraSnapshots: false,
      audioBlockPause: false,
      audioBlockSeek: false,
      oneQuestionPerPage: false,
      remindBeforeDue: true,
      scoreScale: "SCALE_100",
      weight: 2,
      targetStudentIds: [student1Id],
    });
    const asg = asgRaw!;

    // student1 sees it; student2 does not
    const s1Asgs = await listStudentAssignments(student1Id);
    const s2Asgs = await listStudentAssignments(student2Id);
    expect(s1Asgs.some((a) => a.id === asg.id)).toBe(true);
    expect(s2Asgs.some((a) => a.id === asg.id)).toBe(false);

    const s1Class = await getClassDetail(cls.id, { studentId: student1Id });
    const s2Class = await getClassDetail(cls.id, { studentId: student2Id });
    expect(s1Class.assignments.some((a) => a.id === asg.id)).toBe(true);
    expect(s2Class.assignments.some((a) => a.id === asg.id)).toBe(false);

    // Parent overview hides targeted assignment from untargeted child
    const p1Overview = await getChildOverviewForParent(student1Id, cls.id);
    const p2Overview = await getChildOverviewForParent(student2Id, cls.id);
    expect(p1Overview.recentAssignments.some((a) => a.assignmentId === asg.id)).toBe(true);
    expect(p2Overview.recentAssignments.some((a) => a.assignmentId === asg.id)).toBe(false);

    // requireStudentForAssignment rejects untargeted student with 403 FORBIDDEN
    mockAuth.mockResolvedValueOnce({ user: { id: student2Id, role: "STUDENT" } });
    await expect(requireStudentForAssignment(asg.id)).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });

    mockAuth.mockResolvedValueOnce({ user: { id: student1Id, role: "STUDENT" } });
    const allowed = await requireStudentForAssignment(asg.id);
    expect(allowed.user.id).toBe(student1Id);

    // Report is scoped strictly to target subset
    const report = await getAssignmentReport(asg.id);
    expect(report.studentRows.map((s) => s.studentId)).toEqual([student1Id]);
  });

  it("enforces AssignmentOverride extraAttempts, extended dueAt, notifications, AuditLog, and removal", async () => {
    const cls = await createClass(teacherId, { name: `${prefix} Override Class` });
    await prisma.enrollment.createMany({
      data: [
        { classId: cls.id, studentId: student1Id, status: "ACTIVE" },
        { classId: cls.id, studentId: student2Id, status: "ACTIVE" },
      ],
    });
    const ws = await createWorksheet(teacherId, { title: `${prefix} Override WS`, subject: "ENGLISH" });
    await saveWorksheetFields(ws.id, [
      {
        placement: "ANSWER_SHEET",
        type: "TEXT",
        label: "1",
        order: 0,
        points: 5,
        answerKey: { accepted: ["ok"] },
      },
    ]);

    const pastDue = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const futureDue = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const [asgRaw] = await createAssignmentsForClasses(teacherId, false, {
      worksheetId: ws.id,
      classIds: [cls.id],
      title: `${prefix} Override Assignment`,
      dueAt: pastDue,
      timeLimitMin: 20,
      maxAttempts: 1,
      shuffle: false,
      showResult: "AFTER_SUBMIT",
      showAnswerKey: true,
      allowLate: false,
      showLeaderboard: "OFF",
      leaderboardAnon: false,
      leaderboardScoreRule: "BEST",
      proctorMode: "OFF",
      violationAction: "WARN",
      maxViolations: 3,
      requireFullscreen: false,
      blockCopyPaste: false,
      shareProctorWithParent: false,
      requireCamera: false,
      cameraEnforce: false,
      cameraSnapshots: false,
      audioBlockPause: false,
      audioBlockSeek: false,
      oneQuestionPerPage: false,
      remindBeforeDue: false,
      scoreScale: "SCALE_10",
      weight: 1,
    });
    const asg = asgRaw!;

    // Both students initially blocked by pastDue & allowLate: false
    await expect(startOrResumeSubmission(asg.id, student1Id)).rejects.toMatchObject({
      statusCode: 403,
      code: "PAST_DUE",
    });
    await expect(startOrResumeSubmission(asg.id, student2Id)).rejects.toMatchObject({
      statusCode: 403,
      code: "PAST_DUE",
    });

    // Grant override to student1 only: future dueAt + 1 extra attempt + 60m limit
    const ov = await upsertAssignmentOverride(
      asg.id,
      {
        studentId: student1Id,
        extraAttempts: 1,
        dueAt: futureDue,
        timeLimitMin: 60,
        note: "Nghỉ ốm",
      },
      teacherId
    );
    expect(ov.extraAttempts).toBe(1);

    const listOv = await listAssignmentOverrides(asg.id);
    expect(listOv).toHaveLength(1);

    const savedAudit = await prisma.auditLog.findFirst({
      where: { actorId: teacherId, action: "ASSIGNMENT_OVERRIDE_SAVED", targetId: asg.id },
    });
    expect(savedAudit).not.toBeNull();

    // student1 sees override in payload and can start + submit 2 attempts (1 + 1 extra), then blocked on 3rd
    const payloadBefore = await getStudentAssignmentPayload(asg.id, student1Id);
    expect(payloadBefore.assignment.hasOverride).toBe(true);
    expect(payloadBefore.assignment.maxAttempts).toBe(2);
    expect(payloadBefore.assignment.timeLimitMin).toBe(60);
    expect(payloadBefore.canStartNewAttempt).toBe(true);

    // student2 remains blocked
    await expect(startOrResumeSubmission(asg.id, student2Id)).rejects.toMatchObject({
      statusCode: 403,
      code: "PAST_DUE",
    });

    const targetField = await prisma.field.findFirstOrThrow({ where: { worksheetId: ws.id } });
    const s1Attempt1 = await startOrResumeSubmission(asg.id, student1Id);
    await finalizeSubmissionInternal(s1Attempt1.submission.id, [
      { fieldId: targetField.id, value: "ok" },
    ]);

    const s1Attempt2 = await startOrResumeSubmission(asg.id, student1Id);
    expect(s1Attempt2.submission.attemptNo).toBe(2);
    await finalizeSubmissionInternal(s1Attempt2.submission.id);

    await expect(startOrResumeSubmission(asg.id, student1Id)).rejects.toMatchObject({
      statusCode: 403,
      code: "MAX_ATTEMPTS_REACHED",
    });

    await deleteAssignmentOverride(asg.id, student1Id, teacherId);
    const removedAudit = await prisma.auditLog.findFirst({
      where: { actorId: teacherId, action: "ASSIGNMENT_OVERRIDE_REMOVED", targetId: asg.id },
    });
    expect(removedAudit).not.toBeNull();
  });

  it("sends due-soon reminders once per unsubmitted targeted student and honors overrides & disabled flag", async () => {
    const cls = await createClass(teacherId, { name: `${prefix} Reminder Class` });
    await prisma.enrollment.createMany({
      data: [
        { classId: cls.id, studentId: student1Id, status: "ACTIVE" },
        { classId: cls.id, studentId: student2Id, status: "ACTIVE" },
        { classId: cls.id, studentId: student3Id, status: "ACTIVE" },
      ],
    });
    const ws = await createWorksheet(teacherId, { title: `${prefix} Reminder WS`, subject: "ENGLISH" });
    await saveWorksheetFields(ws.id, [
      {
        placement: "ANSWER_SHEET",
        type: "TEXT",
        label: "1",
        order: 0,
        points: 2,
        answerKey: { accepted: ["yes"] },
      },
    ]);

    const mockNow = new Date("2030-05-10T10:00:00.000Z");
    const dueSoon = new Date(mockNow.getTime() + 10 * 60 * 60 * 1000).toISOString();
    const dueFar = new Date(mockNow.getTime() + 72 * 60 * 60 * 1000).toISOString();

    const [asgEnabled, asgDisabled, asgFarWithOverride] = await createAssignmentsForClasses(
      teacherId,
      false,
      {
        worksheetId: ws.id,
        classIds: [cls.id],
        title: `${prefix} Remind Active`,
        dueAt: dueSoon,
        maxAttempts: 1,
        shuffle: false,
        showResult: "AFTER_SUBMIT",
        showAnswerKey: false,
        allowLate: true,
        showLeaderboard: "OFF",
        leaderboardAnon: false,
        leaderboardScoreRule: "BEST",
        proctorMode: "OFF",
        violationAction: "WARN",
        maxViolations: 3,
        requireFullscreen: false,
        blockCopyPaste: false,
        shareProctorWithParent: false,
        requireCamera: false,
        cameraEnforce: false,
        cameraSnapshots: false,
        audioBlockPause: false,
        audioBlockSeek: false,
        oneQuestionPerPage: false,
        remindBeforeDue: true,
        scoreScale: "SCALE_10",
        weight: 1,
        targetStudentIds: [student1Id, student2Id],
      }
    ).then(async ([a1]) => {
      const [a2] = await createAssignmentsForClasses(teacherId, false, {
        worksheetId: ws.id,
        classIds: [cls.id],
        title: `${prefix} Remind Disabled`,
        dueAt: dueSoon,
        maxAttempts: 1,
        shuffle: false,
        showResult: "AFTER_SUBMIT",
        showAnswerKey: false,
        allowLate: true,
        showLeaderboard: "OFF",
        leaderboardAnon: false,
        leaderboardScoreRule: "BEST",
        proctorMode: "OFF",
        violationAction: "WARN",
        maxViolations: 3,
        requireFullscreen: false,
        blockCopyPaste: false,
        shareProctorWithParent: false,
        requireCamera: false,
        cameraEnforce: false,
        cameraSnapshots: false,
        audioBlockPause: false,
        audioBlockSeek: false,
        oneQuestionPerPage: false,
        remindBeforeDue: false,
        scoreScale: "SCALE_10",
        weight: 1,
      });
      const [a3] = await createAssignmentsForClasses(teacherId, false, {
        worksheetId: ws.id,
        classIds: [cls.id],
        title: `${prefix} Remind Far Override`,
        dueAt: dueFar,
        maxAttempts: 1,
        shuffle: false,
        showResult: "AFTER_SUBMIT",
        showAnswerKey: false,
        allowLate: true,
        showLeaderboard: "OFF",
        leaderboardAnon: false,
        leaderboardScoreRule: "BEST",
        proctorMode: "OFF",
        violationAction: "WARN",
        maxViolations: 3,
        requireFullscreen: false,
        blockCopyPaste: false,
        shareProctorWithParent: false,
        requireCamera: false,
        cameraEnforce: false,
        cameraSnapshots: false,
        audioBlockPause: false,
        audioBlockSeek: false,
        oneQuestionPerPage: false,
        remindBeforeDue: true,
        scoreScale: "SCALE_10",
        weight: 1,
      });
      return [a1!, a2!, a3!] as const;
    });

    // student2 already submitted on asgEnabled -> should NOT receive reminder
    const s2Started = await startOrResumeSubmission(asgEnabled.id, student2Id);
    await finalizeSubmissionInternal(s2Started.submission.id);

    // student3 gets an override pulling asgFarWithOverride dueAt into the 24h window
    await upsertAssignmentOverride(asgFarWithOverride.id, {
      studentId: student3Id,
      extraAttempts: 0,
      dueAt: dueSoon,
    });

    const firstRun = await sendDueSoonReminders(mockNow);
    expect(firstRun.sentCount).toBeGreaterThanOrEqual(2);

    const s1Notifs = await prisma.notification.findMany({
      where: { userId: student1Id, type: "DUE_REMINDER", link: `/student/assignments/${asgEnabled.id}/do` },
    });
    const s2Notifs = await prisma.notification.findMany({
      where: { userId: student2Id, type: "DUE_REMINDER", link: `/student/assignments/${asgEnabled.id}/do` },
    });
    const s3DisabledNotifs = await prisma.notification.findMany({
      where: { userId: student3Id, type: "DUE_REMINDER", link: `/student/assignments/${asgDisabled.id}/do` },
    });
    const s3OverrideNotifs = await prisma.notification.findMany({
      where: { userId: student3Id, type: "DUE_REMINDER", link: `/student/assignments/${asgFarWithOverride.id}/do` },
    });

    expect(s1Notifs).toHaveLength(1);
    expect(s2Notifs).toHaveLength(0);
    expect(s3DisabledNotifs).toHaveLength(0);
    expect(s3OverrideNotifs).toHaveLength(1);

    // Disable remindBeforeDue cleanly afterward and confirm running again produces 0 duplicates
    await updateAssignment(asgEnabled.id, {
      title: asgEnabled.title,
      dueAt: dueSoon,
      timeLimitMin: null,
      maxAttempts: 1,
      shuffle: false,
      showResult: "AFTER_SUBMIT",
      showAnswerKey: false,
      allowLate: true,
      showLeaderboard: "OFF",
      leaderboardAnon: false,
      leaderboardScoreRule: "BEST",
      proctorMode: "OFF",
      violationAction: "WARN",
      maxViolations: 3,
      requireFullscreen: false,
      blockCopyPaste: false,
      shareProctorWithParent: false,
      requireCamera: false,
      cameraEnforce: false,
      cameraSnapshots: false,
      audioBlockPause: false,
      audioBlockSeek: false,
      oneQuestionPerPage: false,
    });

    await sendDueSoonReminders(mockNow);
    const s1AfterSecondRun = await prisma.notification.findMany({
      where: { userId: student1Id, type: "DUE_REMINDER", link: `/student/assignments/${asgEnabled.id}/do` },
    });
    expect(s1AfterSecondRun).toHaveLength(1);
  });

  it("supports Rubric grading per question, comment presets with anti-IDOR, scaled score, and gates rubric/answers properly", async () => {
    // Comment presets CRUD + IDOR
    const preset = await createCommentPreset(teacherId, {
      content: `${prefix} Nice structure`,
      category: "Essay",
    });
    const listed = await listCommentPresets(teacherId);
    expect(listed.some((p) => p.id === preset.id)).toBe(true);

    await expect(deleteCommentPreset(preset.id, otherTeacherId, false)).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    await deleteCommentPreset(preset.id, teacherId, false);

    // Rubric + By-question grading + security gating
    const cls = await createClass(teacherId, { name: `${prefix} Rubric Class` });
    await prisma.enrollment.create({
      data: { classId: cls.id, studentId: student1Id, status: "ACTIVE" },
    });
    const ws = await createWorksheet(teacherId, {
      title: `${prefix} Rubric Essay WS`,
      subject: "ENGLISH",
    });
    const saved = await saveWorksheetFields(ws.id, [
      {
        placement: "ANSWER_SHEET",
        type: "ESSAY",
        label: "1",
        prompt: "Describe your favorite book.",
        order: 0,
        points: 4,
        answerKey: { rubric: "Secret teacher guidance" },
        explanation: "Secret explanation",
        rubric: [
          { id: "ideas", title: "Ideas", maxPoints: 2 },
          { id: "vocab", title: "Vocabulary", maxPoints: 2 },
        ],
      },
    ]);
    const essayFieldId = saved[0]!.id;

    const [asgRaw] = await createAssignmentsForClasses(teacherId, false, {
      worksheetId: ws.id,
      classIds: [cls.id],
      title: `${prefix} Rubric IELTS Assignment`,
      maxAttempts: 1,
      shuffle: false,
      showResult: "AFTER_SUBMIT",
      showAnswerKey: false,
      allowLate: true,
      showLeaderboard: "OFF",
      leaderboardAnon: false,
      leaderboardScoreRule: "BEST",
      proctorMode: "OFF",
      violationAction: "WARN",
      maxViolations: 3,
      requireFullscreen: false,
      blockCopyPaste: false,
      shareProctorWithParent: false,
      requireCamera: false,
      cameraEnforce: false,
      cameraSnapshots: false,
      audioBlockPause: false,
      audioBlockSeek: false,
      oneQuestionPerPage: false,
      remindBeforeDue: true,
      scoreScale: "IELTS",
      weight: 2,
    });
    const asg = asgRaw!;

    const started = await startOrResumeSubmission(asg.id, student1Id);

    // Before submission, rubric/answerKey/explanation must NOT be leaked
    const inProgPayload = await getStudentAssignmentPayload(asg.id, student1Id);
    const inProgJson = JSON.stringify(inProgPayload);
    expect(inProgJson).not.toContain("Secret teacher guidance");
    expect(inProgJson).not.toContain("Secret explanation");
    expect(inProgJson).not.toContain('"rubric"');
    expect(inProgJson).not.toContain('"rubricScores"');

    await finalizeSubmissionInternal(started.submission.id, [
      { fieldId: essayFieldId, value: "My favorite book is 1984." },
    ]);

    const byQ = await getAssignmentQuestionGradingData(asg.id, essayFieldId);
    expect(byQ.selectedField?.id).toBe(essayFieldId);
    expect(byQ.items).toHaveLength(1);
    expect(byQ.items[0]?.answer?.value).toBe("My favorite book is 1984.");

    // Rubric clamping computes 1.5 + 2.0 (clamped from 99) = 3.5 / 4
    const graded = await saveSingleFieldGrade(started.submission.id, {
      fieldId: essayFieldId,
      score: 99,
      rubricScores: { ideas: 1.5, vocab: 99 },
      teacherNote: "Clear arguments.",
    });
    expect(graded.updatedSub.status).toBe("GRADED");
    expect(graded.updatedSub.totalScore).toBe(3.5);

    // After submission + grading, student sees rubric & scaled IELTS Band, still NOT secret answerKey because showAnswerKey=false
    const gradedPayload = await getStudentAssignmentPayload(asg.id, student1Id);
    expect(gradedPayload.revealResult).toBe(true);
    expect(gradedPayload.revealKey).toBe(false);
    expect(gradedPayload.submission?.scaledScore?.scale).toBe("IELTS");
    expect(gradedPayload.submission?.scaledScore?.formatted).toContain("Band");
    expect(gradedPayload.assignment.worksheet.fields[0]?.rubric).toHaveLength(2);
    expect(gradedPayload.submission?.answers[0]?.rubricScores).toEqual({ ideas: 1.5, vocab: 2 });
    expect(JSON.stringify(gradedPayload)).not.toContain("Secret teacher guidance");
  });
});
