import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import {
  cloneClass,
  createClass,
  getClassAnalytics,
  getClassSubmissionsOverview,
  listTeacherClasses,
  manageClassTeachers,
  removeClassTeacher,
} from "@/server/classService";
import { createLesson, createLessonItem } from "@/server/lessonService";
import { getClassLessonProgress, markLessonItemViewed } from "@/server/lessonProgressService";
import {
  createComment,
  createPost,
  togglePostReaction,
  updatePostModeration,
  voteOnPostPoll,
} from "@/server/postService";
import {
  assignWorkbookToClass,
  createWorkbook,
  exportWorkbookMatrixXlsx,
  getWorkbookMatrix,
} from "@/server/workbookService";
import {
  authorizeFileDownload,
  createWorksheet,
  saveWorksheetFields,
} from "@/server/worksheetService";
import {
  autosaveSubmissionAnswers,
  getStudentAssignmentPayload,
  getSubmissionForTeacherReview,
  returnSubmissionForRevision,
  startOrResumeSubmission,
  submitByStudent,
} from "@/server/submissionService";
import { getAssignmentReport } from "@/server/reportService";
import {
  requireSubmissionAccess,
  requireTeacherOfAssignment,
  requireTeacherOfClass,
} from "@/lib/permissions";
import { PATCH as patchClassRoute, DELETE as deleteClassRoute } from "@/app/api/classes/[id]/route";
import { POST as cloneClassRoute } from "@/app/api/classes/[id]/clone/route";

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const suffix = `p20_${Date.now()}`;
let ownerId = "";
let coTeacherId = "";
let assistantId = "";
let outsiderTeacherId = "";
let stuAId = "";
let stuBId = "";
let classAId = "";
let classBId = "";
let clonedClassId = "";
let ws1Id = "";
let ws2Id = "";
let f1Id = "";
let f2Id = "";
let wbId = "";
let asg1Id = "";
let asg2Id = "";
let lessonId = "";
let lessonItemId = "";

function setSession(user: { id: string; email: string; name: string; role: "TEACHER" | "STUDENT" }) {
  mockAuth.mockResolvedValue({ user });
}

beforeAll(async () => {
  const ownerRes = await createAccount(
    { id: "sys", role: "ADMIN" },
    { name: "Owner P20", email: `owner_${suffix}@test.vn`, role: "TEACHER", password: "password123" }
  );
  ownerId = ownerRes.user.id;

  const coRes = await createAccount(
    { id: "sys", role: "ADMIN" },
    { name: "CoTeacher P20", email: `co_${suffix}@test.vn`, role: "TEACHER", password: "password123" }
  );
  coTeacherId = coRes.user.id;

  const astRes = await createAccount(
    { id: "sys", role: "ADMIN" },
    { name: "Assistant P20", email: `ast_${suffix}@test.vn`, role: "TEACHER", password: "password123" }
  );
  assistantId = astRes.user.id;

  const outRes = await createAccount(
    { id: "sys", role: "ADMIN" },
    { name: "Outsider P20", email: `out_${suffix}@test.vn`, role: "TEACHER", password: "password123" }
  );
  outsiderTeacherId = outRes.user.id;

  const clsA = await createClass(ownerId, { name: `Class A ${suffix}` });
  classAId = clsA.id;
  const clsB = await createClass(outsiderTeacherId, { name: `Class B ${suffix}` });
  classBId = clsB.id;

  const sA = await createAccount(
    { id: ownerId, role: "TEACHER" },
    { name: "Student A", email: `stua_${suffix}@test.vn`, role: "STUDENT", classId: classAId, password: "password123" }
  );
  stuAId = sA.user.id;

  const sB = await createAccount(
    { id: outsiderTeacherId, role: "TEACHER" },
    { name: "Student B", email: `stub_${suffix}@test.vn`, role: "STUDENT", classId: classBId, password: "password123" }
  );
  stuBId = sB.user.id;

  const ws1 = await createWorksheet(ownerId, { title: `WS1 ${suffix}`, subject: "MATH" });
  ws1Id = ws1.id;
  const saved1 = await saveWorksheetFields(ws1Id, [
    {
      placement: "ANSWER_SHEET",
      type: "TEXT",
      label: "1",
      topicTag: "Đại số",
      order: 0,
      points: 1,
      answerKey: { accepted: ["2"] },
    },
    {
      placement: "ANSWER_SHEET",
      type: "TEXT",
      label: "2",
      topicTag: "Hình học",
      order: 1,
      points: 1,
      answerKey: { accepted: ["4"] },
    },
  ]);
  f1Id = saved1[0]!.id;
  f2Id = saved1[1]!.id;

  const ws2 = await createWorksheet(ownerId, { title: `WS2 ${suffix}`, subject: "MATH" });
  ws2Id = ws2.id;
  await saveWorksheetFields(ws2Id, [
    {
      placement: "ANSWER_SHEET",
      type: "TEXT",
      label: "1",
      topicTag: "Đại số",
      order: 0,
      points: 2,
      answerKey: { accepted: ["10"] },
    },
  ]);

  const lesson = await createLesson(ownerId, { title: `Lesson ${suffix}` }, { classId: classAId });
  lessonId = lesson.id;
  const item = await createLessonItem(
    { id: ownerId, role: "TEACHER" },
    lessonId,
    { title: "Slide PDF", type: "LINK", url: "https://example.com/slide" },
    { classId: classAId }
  );
  lessonItemId = item.id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({
    where: { actorId: { in: [ownerId, coTeacherId, assistantId, outsiderTeacherId] } },
  });
  await prisma.notification.deleteMany({ where: { userId: { in: [stuAId, stuBId] } } });
  if (asg1Id || asg2Id) {
    await prisma.assignment.updateMany({
      where: { id: { in: [asg1Id, asg2Id].filter(Boolean) } },
      data: { unlockAfterAssignmentId: null },
    });
  }
  await prisma.workbook.deleteMany({ where: { id: wbId } });
  await prisma.lesson.deleteMany({ where: { id: lessonId } });
  await prisma.worksheet.deleteMany({ where: { id: { in: [ws1Id, ws2Id] } } });
  await prisma.class.deleteMany({
    where: { id: { in: [classAId, classBId, clonedClassId].filter(Boolean) } },
  });
  await prisma.user.deleteMany({
    where: {
      id: { in: [ownerId, coTeacherId, assistantId, outsiderTeacherId, stuAId, stuBId].filter(Boolean) },
    },
  });
});

describe("Phase 20 Integration: Workbook, Return for Revision, Lesson Progress, Feed & Co-Teachers", () => {
  it("enforces ClassRole hierarchy (OWNER > CO_TEACHER > ASSISTANT) and blocks outsiders", async () => {
    await expect(
      manageClassTeachers(classAId, { email: `stua_${suffix}@test.vn`, role: "CO_TEACHER" })
    ).rejects.toMatchObject({ statusCode: 400 });

    await expect(
      removeClassTeacher(classAId, ownerId)
    ).rejects.toMatchObject({ statusCode: 400 });

    const invited = await manageClassTeachers(classAId, {
      email: `co_${suffix}@test.vn`,
      role: "CO_TEACHER",
    });
    await manageClassTeachers(classAId, {
      email: `ast_${suffix}@test.vn`,
      role: "ASSISTANT",
    });
    expect(invited.teachers).toHaveLength(1);

    const coClasses = await listTeacherClasses(coTeacherId);
    expect(coClasses.some((c) => c.id === classAId && c.myRole === "CO_TEACHER")).toBe(true);

    // ASSISTANT cannot edit class settings, clone class, or delete class, but CAN access analytics/submissions
    setSession({ id: assistantId, email: `ast_${suffix}@test.vn`, name: "Assistant P20", role: "TEACHER" });
    await expect(requireTeacherOfClass(classAId, "ASSISTANT")).resolves.toMatchObject({
      classRole: "ASSISTANT",
    });
    await expect(requireTeacherOfClass(classAId, "CO_TEACHER")).rejects.toMatchObject({
      statusCode: 403,
    });
    const astPatchRes = await patchClassRoute(
      new Request("http://localhost/api/classes/" + classAId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Hack" }),
      }),
      { params: Promise.resolve({ id: classAId }) }
    );
    expect(astPatchRes.status).toBe(403);

    const astCloneRes = await cloneClassRoute(
      new Request("http://localhost/api/classes/" + classAId + "/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Cloned by Assistant" }),
      }),
      { params: Promise.resolve({ id: classAId }) }
    );
    expect(astCloneRes.status).toBe(403);

    // CO_TEACHER can edit class & clone class, but CANNOT archive or delete class (OWNER only)
    setSession({ id: coTeacherId, email: `co_${suffix}@test.vn`, name: "CoTeacher P20", role: "TEACHER" });
    const coArchiveRes = await patchClassRoute(
      new Request("http://localhost/api/classes/" + classAId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      }),
      { params: Promise.resolve({ id: classAId }) }
    );
    expect(coArchiveRes.status).toBe(403);

    const coDeleteRes = await deleteClassRoute(
      new Request("http://localhost/api/classes/" + classAId, { method: "DELETE" }),
      { params: Promise.resolve({ id: classAId }) }
    );
    expect(coDeleteRes.status).toBe(403);

    const coClone = await cloneClass(classAId, coTeacherId, `Cloned ${suffix}`);
    clonedClassId = coClone.id;
    const clonedDetail = await prisma.class.findUniqueOrThrow({
      where: { id: clonedClassId },
      include: { enrollments: true, classLessons: true, posts: true },
    });
    expect(clonedDetail.enrollments).toHaveLength(0);
    expect(clonedDetail.posts).toHaveLength(0);
    expect(clonedDetail.classLessons).toHaveLength(1);
  });

  it("creates sequential Workbook, blocks prerequisite before submit, unlocks after submit, and builds Matrix + Excel", async () => {
    const wb = await createWorkbook(ownerId, false, {
      title: `Workbook ${suffix}`,
      description: "Sequential test",
      worksheetIds: [ws1Id, ws2Id],
    });
    wbId = wb.id;
    expect(wb.items).toHaveLength(2);

    const created = await assignWorkbookToClass(wbId, { id: ownerId, role: "TEACHER" }, {
      classId: classAId,
      sequentialUnlock: true,
      maxAttempts: 1,
      showResult: "AFTER_SUBMIT",
      showAnswerKey: true,
    });
    expect(created).toHaveLength(2);
    asg1Id = created[0]!.id;
    asg2Id = created[1]!.id;
    expect(created[1]!.unlockAfterAssignmentId).toBe(asg1Id);

    // Assistant CAN check assignment with default minRole ASSISTANT, CANNOT edit with CO_TEACHER
    setSession({ id: assistantId, email: `ast_${suffix}@test.vn`, name: "Assistant P20", role: "TEACHER" });
    await expect(requireTeacherOfAssignment(asg1Id)).resolves.toMatchObject({ classRole: "ASSISTANT" });
    await expect(requireTeacherOfAssignment(asg1Id, "CO_TEACHER")).rejects.toMatchObject({
      statusCode: 403,
    });

    // Student A cannot open asg2 before submitting asg1
    await expect(startOrResumeSubmission(asg2Id, stuAId)).rejects.toMatchObject({
      statusCode: 403,
      code: "PREREQUISITE_NOT_SUBMITTED",
    });
    await expect(getStudentAssignmentPayload(asg2Id, stuAId)).rejects.toMatchObject({
      statusCode: 403,
      code: "PREREQUISITE_NOT_SUBMITTED",
    });

    // Student A submits asg1 (1/2 right: f1="2", f2="wrong")
    const started = await startOrResumeSubmission(asg1Id, stuAId);
    await autosaveSubmissionAnswers(started.submission.id, stuAId, {
      attemptVersion: started.submission.attemptVersion,
      answers: [
        { fieldId: f1Id, value: "2" },
        { fieldId: f2Id, value: "wrong" },
      ],
    });
    const fin = await submitByStudent(started.submission.id, stuAId);
    expect(fin.totalScore).toBe(1);

    // Now asg2 is unlocked!
    const unlockedPayload = await getStudentAssignmentPayload(asg2Id, stuAId);
    expect(unlockedPayload.assignment.id).toBe(asg2Id);

    const matrix = await getWorkbookMatrix(wbId, classAId);
    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0]!.cells[0]!.scoreScale10).toBe(5);
    const xlsx = await exportWorkbookMatrixXlsx(wbId, classAId, "vi");
    expect(xlsx.buffer.subarray(0, 2).toString("ascii")).toBe("PK");

    // Report histogram & topicBreakdown check
    const report = await getAssignmentReport(asg1Id, "vi");
    expect(report.histogram.count).toBe(1);
    expect(report.histogram.median).toBe(5);
    expect(report.topicBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tag: "Đại số", avgCorrectRate: 100 }),
        expect.objectContaining({ tag: "Hình học", avgCorrectRate: 0 }),
      ])
    );

    const analytics = await getClassAnalytics(classAId);
    expect(analytics.weeklyTrend).toHaveLength(12);
    const overviewSubs = await getClassSubmissionsOverview(classAId, { assignmentId: asg1Id });
    expect(overviewSubs).toHaveLength(1);
  });

  it("supports returnSubmissionForRevision -> RETURNED edits (maxAttempts=1) without answerKey leak & preserves SubmissionRevision", async () => {
    const subs = await prisma.submission.findMany({
      where: { assignmentId: asg1Id, studentId: stuAId },
    });
    expect(subs).toHaveLength(1);
    const subId = subs[0]!.id;

    // Assistant CAN access submission and return it
    setSession({ id: assistantId, email: `ast_${suffix}@test.vn`, name: "Assistant P20", role: "TEACHER" });
    await expect(requireSubmissionAccess(subId)).resolves.toMatchObject({ isTeacher: true });

    const returned = await returnSubmissionForRevision(subId, assistantId, "Check geometry again");
    expect(returned.status).toBe("RETURNED");
    expect(returned.revisions).toHaveLength(1);
    expect(returned.revisions[0]!.revisionNo).toBe(1);
    expect(returned.revisions[0]!.totalScore).toBe(1);

    // Student payload MUST hide answerKey & revealResult while RETURNED
    const stuPayload = await getStudentAssignmentPayload(asg1Id, stuAId);
    expect(stuPayload.submission?.status).toBe("RETURNED");
    expect(stuPayload.submission?.teacherComment).toBe("Check geometry again");
    expect(stuPayload.revealResult).toBe(false);
    expect(stuPayload.revealKey).toBe(false);
    expect(JSON.stringify(stuPayload)).not.toContain('"answerKey"');

    // Resuming does NOT hit MAX_ATTEMPTS_REACHED despite maxAttempts=1
    const resumed = await startOrResumeSubmission(asg1Id, stuAId);
    expect(resumed.submission.id).toBe(subId);

    // Fix f2 -> "4" and resubmit on SAME submission
    await autosaveSubmissionAnswers(subId, stuAId, {
      attemptVersion: resumed.submission.attemptVersion,
      answers: [{ fieldId: f2Id, value: "4" }],
    });
    const resubmitted = await submitByStudent(subId, stuAId);
    expect(resubmitted.totalScore).toBe(2);
    expect(resubmitted.status).toBe("GRADED");
    expect(resubmitted.attemptNo).toBe(1);

    const review = await getSubmissionForTeacherReview(subId);
    expect(review.revisions).toHaveLength(1);
  });

  it("tracks LessonItemProgress with anti-IDOR and supports Poll, Reactions, CommentsLocked & Attachment auth", async () => {
    await expect(markLessonItemViewed(lessonItemId, stuBId)).rejects.toMatchObject({
      statusCode: 403,
    });

    const p1 = await markLessonItemViewed(lessonItemId, stuAId);
    expect(p1.viewCount).toBe(1);
    const p2 = await markLessonItemViewed(lessonItemId, stuAId);
    expect(p2.viewCount).toBe(2);

    const progressMap = await getClassLessonProgress(classAId, { studentId: stuAId });
    expect(progressMap.byItem[lessonItemId]).toEqual({ completedCount: 1, completedByMe: true });

    const richPost = await createPost(classAId, ownerId, {
      content: "Weekly Poll",
      attachments: [
        {
          key: `classes/${classAId}/posts/sample.png`,
          name: "sample.png",
          mimeType: "image/png",
          sizeBytes: 120,
        },
      ],
      poll: {
        question: "Pick day",
        allowMultiple: false,
        options: ["Mon", "Wed"],
      },
    });
    expect(richPost.poll?.options).toHaveLength(2);

    // Single-choice poll rejects 2 options
    const optIds = richPost.poll!.options.map((o) => o.id);
    await expect(voteOnPostPoll(classAId, richPost.id, stuAId, optIds)).rejects.toMatchObject({
      code: "SINGLE_CHOICE_POLL",
    });

    const voted = await voteOnPostPoll(classAId, richPost.id, stuAId, [optIds[0]!]);
    expect(voted.poll?.totalVotes).toBe(1);
    expect(voted.poll?.options[0]!.votedByMe).toBe(true);

    const r1 = await togglePostReaction(classAId, richPost.id, stuAId, "👍");
    expect(r1.reactions?.[0]?.count).toBe(1);
    const r2 = await togglePostReaction(classAId, richPost.id, stuAId, "👍");
    expect(r2.reactions).toHaveLength(0);

    // CommentsLocked blocks students, allows teacher
    await updatePostModeration(classAId, richPost.id, { commentsLocked: true, pinned: true });
    await expect(createComment(classAId, richPost.id, stuAId, "hi", false)).rejects.toMatchObject({
      statusCode: 403,
      code: "COMMENTS_LOCKED",
    });
    await expect(createComment(classAId, richPost.id, ownerId, "teacher note", true)).resolves.toBeTruthy();

    // Anti-IDOR on post attachments
    const attKey = `classes/${classAId}/posts/sample.png`;
    expect(await authorizeFileDownload(assistantId, "TEACHER", attKey)).toBe(true);
    expect(await authorizeFileDownload(stuAId, "STUDENT", attKey)).toBe(true);
    expect(await authorizeFileDownload(stuBId, "STUDENT", attKey)).toBe(false);
    expect(await authorizeFileDownload(outsiderTeacherId, "TEACHER", attKey)).toBe(false);
  });
});
