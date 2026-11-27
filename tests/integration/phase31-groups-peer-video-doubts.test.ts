import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import { autosaveSubmissionAnswers, startOrResumeSubmission, submitByStudent } from "@/server/submissionService";
import { createClassGroup, setMemberScoreOverrides } from "@/server/classGroupService";
import { getClassGradebook } from "@/server/gradebookService";
import { generatePeerReviewPairs, getMyPeerReviews, getReceivedPeerFeedback, submitPeerReview } from "@/server/peerReviewService";
import { createCheckpoint, getLessonVideoForStudent, reportVideoHeartbeat, submitCheckpointAnswer } from "@/server/videoLessonService";
import { createQuestionDoubt, listQuestionDoubts, replyQuestionDoubt } from "@/server/questionDoubtService";

const suffix = `p31_${Date.now()}`;
const ids = { admin: "", teacher: "", a: "", b: "", c: "", d: "", class1: "", ws: "", f1: "", essay: "", lesson: "", item: "" };
const T = { id: "", role: "TEACHER" as const };

async function mk(role: "TEACHER" | "STUDENT", tag: string) {
  const res = await createAccount(
    { id: ids.admin, role: "ADMIN" },
    { name: `${tag} Họ Tên ${suffix}`, email: `${tag.toLowerCase()}_${suffix}@test.vn`, password: "password123", role }
  );
  return res.user.id;
}

beforeAll(async () => {
  ids.admin = (await prisma.user.findUnique({ where: { email: "admin@engclass.vn" } }))!.id;
  ids.teacher = await mk("TEACHER", "GV");
  T.id = ids.teacher;
  for (const k of ["a", "b", "c", "d"] as const) ids[k] = await mk("STUDENT", `HS${k.toUpperCase()}`);
  ids.class1 = (await createClass(ids.teacher, { name: `C ${suffix}` })).id;
  await prisma.enrollment.createMany({
    data: [ids.a, ids.b, ids.c, ids.d].map((studentId) => ({ classId: ids.class1, studentId, status: "ACTIVE" as const })),
  });
  const ws = await prisma.worksheet.create({
    data: {
      ownerId: ids.teacher,
      title: `WS ${suffix}`,
      fields: {
        create: [
          { placement: "ANSWER_SHEET", type: "TEXT", label: "1", order: 1, points: 2, answerKey: { accepted: ["cat"] } },
          { placement: "ANSWER_SHEET", type: "ESSAY", label: "2", order: 2, points: 2, answerKey: {} },
        ],
      },
    },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  ids.ws = ws.id;
  ids.f1 = ws.fields[0]!.id;
  ids.essay = ws.fields[1]!.id;
  const lesson = await prisma.lesson.create({
    data: {
      ownerId: ids.teacher,
      title: `Video ${suffix}`,
      classLinks: { create: { classId: ids.class1 } },
      items: { create: { title: "Clip", type: "VIDEO", url: "https://example.com/v.mp4", order: 0 } },
    },
    include: { items: true },
  });
  ids.lesson = lesson.id;
  ids.item = lesson.items[0]!.id;
});

afterAll(async () => {
  await prisma.class.deleteMany({ where: { id: ids.class1 } });
  await prisma.lesson.deleteMany({ where: { id: ids.lesson } });
  await prisma.worksheet.deleteMany({ where: { id: ids.ws } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.teacher, ids.a, ids.b, ids.c, ids.d] } } });
});

describe("Phase 31 integration", () => {
  it("group assignment: members share one submission, outsiders are blocked, scores flow to every member with overrides", async () => {
    await createClassGroup(ids.class1, { name: "Nhóm 1", studentIds: [ids.a, ids.b], leaderId: ids.a });
    await createClassGroup(ids.class1, { name: "Nhóm 2", studentIds: [ids.c] });
    const asg = await prisma.assignment.create({
      data: { classId: ids.class1, worksheetId: ids.ws, title: `Group ${suffix}`, isGroupAssignment: true, maxAttempts: 1 },
    });

    const s1 = await startOrResumeSubmission(asg.id, ids.a);
    const s2 = await startOrResumeSubmission(asg.id, ids.b);
    expect(s2.submission.id).toBe(s1.submission.id);
    expect(s1.submission.groupId).not.toBeNull();
    const other = await startOrResumeSubmission(asg.id, ids.c);
    expect(other.submission.id).not.toBe(s1.submission.id);
    await expect(startOrResumeSubmission(asg.id, ids.d)).rejects.toMatchObject({ code: "NO_GROUP" });

    // C (other group) cannot write into group 1's submission
    await expect(
      autosaveSubmissionAnswers(s1.submission.id, ids.c, { attemptVersion: s1.submission.attemptVersion, answers: [] })
    ).rejects.toMatchObject({ statusCode: 404 });
    // B (member) submits for the group
    await submitByStudent(s1.submission.id, ids.b, { answers: [{ fieldId: ids.f1, value: "cat" }] });
    const done = await prisma.submission.findUniqueOrThrow({ where: { id: s1.submission.id } });
    expect(done.status).not.toBe("IN_PROGRESS");

    await setMemberScoreOverrides(done.id, { [ids.b]: 1 });
    await expect(setMemberScoreOverrides(done.id, { [ids.c]: 1 })).rejects.toMatchObject({ statusCode: 400 });
    const gb = await getClassGradebook(ids.class1);
    const cell = (sid: string) => gb.rows.find((r) => r.student.id === sid)!.onlineCells[asg.id];
    expect(cell(ids.a)?.score).toBe(done.totalScore ?? done.autoScore);
    expect(cell(ids.b)?.score).toBe(1);
  });

  it("peer review: derangement pairs and fully anonymous payloads", async () => {
    const asg = await prisma.assignment.create({
      data: { classId: ids.class1, worksheetId: ids.ws, title: `Peer ${suffix}`, peerReviewEnabled: true, peerReviewsPerStudent: 2 },
    });
    for (const [sid, text] of [
      [ids.a, "Bài viết của A về môi trường"],
      [ids.b, "Bài viết của B về gia đình"],
      [ids.c, "Bài viết của C về trường học"],
    ] as const) {
      await prisma.submission.create({
        data: {
          assignmentId: asg.id,
          studentId: sid,
          attemptNo: 1,
          status: "SUBMITTED",
          submittedAt: new Date(),
          maxScore: 4,
          answers: { create: { fieldId: ids.essay, value: text } },
        },
      });
    }
    const res = await generatePeerReviewPairs(asg.id);
    expect(res.total).toBe(6);
    expect((await generatePeerReviewPairs(asg.id)).created).toBe(0); // idempotent

    const mine = await getMyPeerReviews(asg.id, ids.a);
    expect(mine.reviews).toHaveLength(2);
    const json = JSON.stringify(mine);
    for (const sid of [ids.a, ids.b, ids.c]) expect(json).not.toContain(sid);
    expect(json).not.toContain(suffix); // no names / emails
    expect(json).not.toContain("Bài viết của A"); // never their own work

    await submitPeerReview(mine.reviews[0]!.id, ids.a, { comment: "Ý hay, cần thêm ví dụ." });
    await expect(submitPeerReview(mine.reviews[0]!.id, ids.b, { comment: "x" })).rejects.toMatchObject({ statusCode: 404 });
    const authorId = (await prisma.peerReviewAssignment.findUniqueOrThrow({ where: { id: mine.reviews[0]!.id }, include: { submission: true } })).submission.studentId;
    const received = await getReceivedPeerFeedback(asg.id, authorId);
    expect(received[0]).toMatchObject({ label: "Bạn #1", comment: "Ý hay, cần thêm ví dụ." });
    expect(JSON.stringify(received)).not.toContain(ids.a);
  });

  it("video checkpoints never expose the key before answering and block skipping ahead", async () => {
    const cp = await createCheckpoint(ids.item, T, {
      timestampSec: 60,
      type: "MULTIPLE_CHOICE",
      prompt: "Which?",
      options: [
        { id: "A", text: "a" },
        { id: "B", text: "b" },
      ],
      answerKey: { correct: "B" },
    });
    const view = await getLessonVideoForStudent(ids.item, ids.a);
    expect(JSON.stringify(view)).not.toContain('"correct"');
    await expect(getLessonVideoForStudent(ids.item, ids.teacher)).rejects.toMatchObject({ statusCode: 403 });

    // dragging to 100s in one jump only advances 20s
    const hb = await reportVideoHeartbeat(ids.item, ids.a, { currentSec: 100, durationSec: 120 });
    expect(hb.maxWatchedSec).toBe(20);
    await expect(submitCheckpointAnswer(ids.item, ids.a, cp.id, "B")).rejects.toMatchObject({ code: "CHECKPOINT_NOT_REACHED" });
    for (let t = 40; t <= 120; t += 20) await reportVideoHeartbeat(ids.item, ids.a, { currentSec: t, durationSec: 120 });
    const ans = await submitCheckpointAnswer(ids.item, ids.a, cp.id, "B");
    expect(ans).toMatchObject({ isCorrect: true, completed: true });
    await expect(submitCheckpointAnswer(ids.item, ids.a, cp.id, "A")).rejects.toMatchObject({ statusCode: 409 });
    const after = await getLessonVideoForStudent(ids.item, ids.a);
    expect(after.checkpoints[0]!.answerKey).toEqual({ correct: "B" });
  });

  it("question doubts: blocked before submitting, teacher replies once, public replies visible to classmates", async () => {
    const asg = await prisma.assignment.create({
      data: { classId: ids.class1, worksheetId: ids.ws, title: `Doubt ${suffix}`, showResult: "AFTER_SUBMIT" },
    });
    await expect(createQuestionDoubt(asg.id, ids.c, { fieldId: ids.f1, question: "Sao câu này sai ạ?" })).rejects.toMatchObject({
      code: "DOUBT_NOT_ALLOWED_YET",
    });
    await prisma.submission.create({
      data: { assignmentId: asg.id, studentId: ids.c, attemptNo: 1, status: "GRADED", submittedAt: new Date(), maxScore: 4 },
    });
    const d = await createQuestionDoubt(asg.id, ids.c, { fieldId: ids.f1, question: "Sao câu này sai ạ?" });
    expect((await listQuestionDoubts(asg.id, { id: ids.d, role: "STUDENT" }))).toHaveLength(0);
    await replyQuestionDoubt(d.id, T, { reply: "Vì đáp án là cat.", isPublicToClass: true });
    await expect(replyQuestionDoubt(d.id, T, { reply: "lại", isPublicToClass: true })).rejects.toMatchObject({ statusCode: 409 });
    const seenByD = await listQuestionDoubts(asg.id, { id: ids.d, role: "STUDENT" });
    expect(seenByD).toHaveLength(1);
    expect(seenByD[0]).toMatchObject({ teacherReply: "Vì đáp án là cat.", studentName: null, mine: false });
  });
});
