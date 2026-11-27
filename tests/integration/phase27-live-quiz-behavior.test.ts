import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import {
  advanceLiveQuiz,
  createExitTicketSession,
  createLiveQuizFromWorksheet,
  exportLiveQuizToOfflineGrade,
  getLiveQuizHostView,
  getLiveQuizPlayerView,
  joinLiveQuiz,
  submitLiveQuizAnswer,
} from "@/server/liveQuizService";
import {
  awardBehaviorPoints,
  deleteBehaviorPoint,
  getClassBehaviorSummary,
  listBehaviorPresets,
} from "@/server/behaviorPointService";
import { getClassGradebook } from "@/server/gradebookService";
import { getChildOverviewForParent } from "@/server/parentService";

const suffix = `p27_${Date.now()}`;
const ids = {
  admin: "",
  teacher: "",
  teacher2: "",
  assistant: "",
  stu1: "",
  stu2: "",
  outsider: "",
  parent: "",
  class1: "",
  class2: "",
  worksheet: "",
};

async function mkUser(role: "TEACHER" | "STUDENT" | "PARENT", tag: string) {
  const res = await createAccount(
    { id: ids.admin, role: "ADMIN" },
    { name: `${tag} ${suffix}`, email: `${tag.toLowerCase()}_${suffix}@test.vn`, password: "password123", role }
  );
  return res.user;
}

const actor = (id: string, role: "TEACHER" | "ADMIN" = "TEACHER") => ({ id, role });

beforeAll(async () => {
  const admin = await prisma.user.findUnique({ where: { email: "admin@engclass.vn" } });
  ids.admin = admin!.id;
  ids.teacher = (await mkUser("TEACHER", "T1")).id;
  ids.teacher2 = (await mkUser("TEACHER", "T2")).id;
  ids.assistant = (await mkUser("TEACHER", "TA")).id;
  ids.stu1 = (await mkUser("STUDENT", "S1")).id;
  ids.stu2 = (await mkUser("STUDENT", "S2")).id;
  ids.outsider = (await mkUser("STUDENT", "SOUT")).id;
  ids.parent = (await mkUser("PARENT", "P1")).id;

  await prisma.parentLink.create({
    data: { parentId: ids.parent, studentId: ids.stu1, relation: "Mẹ", verifiedAt: new Date() },
  });

  ids.class1 = (await createClass(ids.teacher, { name: `C1 ${suffix}` })).id;
  ids.class2 = (await createClass(ids.teacher2, { name: `C2 ${suffix}` })).id;
  await prisma.enrollment.createMany({
    data: [
      { classId: ids.class1, studentId: ids.stu1, status: "ACTIVE" },
      { classId: ids.class1, studentId: ids.stu2, status: "ACTIVE" },
      { classId: ids.class2, studentId: ids.outsider, status: "ACTIVE" },
    ],
  });
  await prisma.classTeacher.create({
    data: { classId: ids.class1, userId: ids.assistant, role: "ASSISTANT" },
  });

  const ws = await prisma.worksheet.create({
    data: {
      ownerId: ids.teacher,
      title: `Live WS ${suffix}`,
      fields: {
        create: [
          {
            placement: "ANSWER_SHEET",
            type: "MULTIPLE_CHOICE",
            label: "1",
            prompt: "Pick B",
            order: 1,
            options: [
              { id: "A", text: "a" },
              { id: "B", text: "b" },
            ],
            answerKey: { correct: "B" },
          },
          {
            placement: "ANSWER_SHEET",
            type: "ESSAY",
            label: "2",
            prompt: "Essay is skipped",
            order: 2,
            answerKey: {},
          },
          {
            placement: "ANSWER_SHEET",
            type: "TRUE_FALSE",
            label: "3",
            prompt: "Sky is blue",
            order: 3,
            answerKey: { correct: true },
          },
        ],
      },
    },
  });
  ids.worksheet = ws.id;
});

afterAll(async () => {
  await prisma.liveQuizSession.deleteMany({ where: { hostId: { in: [ids.teacher, ids.teacher2] } } });
  await prisma.class.deleteMany({ where: { id: { in: [ids.class1, ids.class2] } } });
  await prisma.worksheet.deleteMany({ where: { id: ids.worksheet } });
  await prisma.user.deleteMany({
    where: {
      id: { in: [ids.teacher, ids.teacher2, ids.assistant, ids.stu1, ids.stu2, ids.outsider, ids.parent] },
    },
  });
});

describe("Phase 27 integration: Live Quiz security & flow", () => {
  it("snapshots only auto-graded questions and blocks teachers without access to the worksheet/class", async () => {
    await expect(
      createLiveQuizFromWorksheet(actor(ids.teacher2), { worksheetId: ids.worksheet })
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      createLiveQuizFromWorksheet(actor(ids.teacher), { worksheetId: ids.worksheet, classId: ids.class2 })
    ).rejects.toMatchObject({ statusCode: 403 });

    const created = await createLiveQuizFromWorksheet(actor(ids.teacher), {
      worksheetId: ids.worksheet,
      classId: ids.class1,
      questionLimitSec: 30,
    });
    expect(created.questionCount).toBe(2);
    expect(created.pinCode).toMatch(/^\d{6}$/);

    // Later edits of the worksheet do not affect the frozen snapshot
    await prisma.field.updateMany({ where: { worksheetId: ids.worksheet, type: "MULTIPLE_CHOICE" }, data: { answerKey: { correct: "A" } } });
    const row = await prisma.liveQuizSession.findUniqueOrThrow({ where: { id: created.id } });
    expect(JSON.stringify(row.questionsSnapshot)).toContain('"correct":"B"');
    await prisma.field.updateMany({ where: { worksheetId: ids.worksheet, type: "MULTIPLE_CHOICE" }, data: { answerKey: { correct: "B" } } });
  });

  it("class sessions: guests and outsiders cannot join, members can; no answer key while open; duplicates rejected", async () => {
    const { id: sessionId, pinCode } = await createLiveQuizFromWorksheet(actor(ids.teacher), {
      worksheetId: ids.worksheet,
      classId: ids.class1,
    });

    await expect(joinLiveQuiz(pinCode, { user: null, displayName: "Hacker" })).rejects.toMatchObject({
      statusCode: 401,
    });
    await expect(
      joinLiveQuiz(pinCode, { user: { id: ids.outsider, name: "Out", role: "STUDENT" } })
    ).rejects.toMatchObject({ statusCode: 403, code: "LIVE_QUIZ_NOT_IN_CLASS" });

    const p1 = await joinLiveQuiz(pinCode, { user: { id: ids.stu1, name: "S1", role: "STUDENT" } });
    const p2 = await joinLiveQuiz(pinCode, { user: { id: ids.stu2, name: "S2", role: "STUDENT" } });

    // Another teacher cannot drive the session; the class assistant can
    await expect(advanceLiveQuiz(sessionId, actor(ids.teacher2), "OPEN")).rejects.toMatchObject({ statusCode: 403 });
    await advanceLiveQuiz(sessionId, actor(ids.assistant), "OPEN");

    const playerOpen = await getLiveQuizPlayerView(sessionId, { joinToken: p1.joinToken });
    const hostOpen = await getLiveQuizHostView(sessionId, actor(ids.teacher));
    expect(playerOpen.question?.prompt).toBe("Pick B");
    for (const payload of [playerOpen, hostOpen]) {
      const json = JSON.stringify(payload);
      expect(json).not.toContain("answerKey");
      expect(json).not.toContain('"correct"');
    }
    expect(hostOpen.reveal).toBeNull();

    // Wrong question index / stranger token
    await expect(
      submitLiveQuizAnswer(sessionId, { joinToken: p1.joinToken }, { questionIndex: 1, answer: true })
    ).rejects.toMatchObject({ code: "LIVE_QUIZ_QUESTION_CLOSED" });
    await expect(
      submitLiveQuizAnswer(sessionId, { joinToken: "forged-token" }, { questionIndex: 0, answer: "B" })
    ).rejects.toMatchObject({ code: "LIVE_QUIZ_NOT_JOINED" });

    const res = await submitLiveQuizAnswer(sessionId, { joinToken: p1.joinToken }, { questionIndex: 0, answer: "B" });
    expect(res).toEqual({ accepted: true }); // correctness hidden until the reveal
    await expect(
      submitLiveQuizAnswer(sessionId, { joinToken: p1.joinToken }, { questionIndex: 0, answer: "A" })
    ).rejects.toMatchObject({ code: "LIVE_QUIZ_ALREADY_ANSWERED" });
    await submitLiveQuizAnswer(sessionId, { userId: ids.stu2 }, { questionIndex: 0, answer: "A" });

    await advanceLiveQuiz(sessionId, actor(ids.teacher), "CLOSE");
    await expect(
      submitLiveQuizAnswer(sessionId, { joinToken: p2.joinToken }, { questionIndex: 0, answer: "B" })
    ).rejects.toMatchObject({ code: "LIVE_QUIZ_QUESTION_CLOSED" });

    const playerClosed = await getLiveQuizPlayerView(sessionId, { joinToken: p1.joinToken });
    expect(playerClosed.reveal?.correctAnswer).toEqual({ correct: "B" });
    expect(playerClosed.myAnswer).toMatchObject({ isCorrect: true });
    expect(playerClosed.me.totalScore).toBeGreaterThanOrEqual(500);
    expect(playerClosed.me.rank).toBe(1);

    const hostClosed = await getLiveQuizHostView(sessionId, actor(ids.teacher));
    expect(hostClosed.reveal?.distribution.buckets).toEqual([
      { key: "A", label: "a", count: 1 },
      { key: "B", label: "b", count: 1 },
    ]);
    expect(hostClosed.leaderboard[0]?.displayName).toBe("S1");

    // Concurrent double-click: only one NEXT wins
    const results = await Promise.allSettled([
      advanceLiveQuiz(sessionId, actor(ids.teacher), "NEXT"),
      advanceLiveQuiz(sessionId, actor(ids.teacher), "NEXT"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const state = await prisma.liveQuizSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(state.currentIndex).toBe(1);
    expect(state.status).toBe("QUESTION_OPEN");

    await submitLiveQuizAnswer(sessionId, { joinToken: p1.joinToken }, { questionIndex: 1, answer: true });
    await advanceLiveQuiz(sessionId, actor(ids.teacher), "CLOSE");
    const finished = await advanceLiveQuiz(sessionId, actor(ids.teacher), "NEXT");
    expect(finished.status).toBe("FINISHED");
    await expect(joinLiveQuiz(pinCode, { user: { id: ids.stu1, name: "S1", role: "STUDENT" } })).rejects.toMatchObject({
      statusCode: 404,
    });

    // Export ratio to the gradebook: S1 2/2 → 10, S2 0/2 → 0
    await expect(exportLiveQuizToOfflineGrade(sessionId, actor(ids.teacher2), {})).rejects.toMatchObject({
      statusCode: 403,
    });
    const exported = await exportLiveQuizToOfflineGrade(sessionId, actor(ids.teacher), { maxScore: 10 });
    expect(exported.exportedCount).toBe(2);
    const entries = await prisma.offlineGradeEntry.findMany({ where: { columnId: exported.columnId } });
    const byStudent = Object.fromEntries(entries.map((e) => [e.studentId, e.score]));
    expect(byStudent[ids.stu1]).toBe(10);
    expect(byStudent[ids.stu2]).toBe(0);
  });

  it("open exit ticket lets guests join with a name and answer once", async () => {
    const ticket = await createExitTicketSession(actor(ids.teacher), {
      title: "Exit",
      type: "MULTIPLE_CHOICE",
      prompt: "Today's lesson was?",
      options: ["Easy", "OK", "Hard"],
      correctIndex: null,
    });
    const guest = await joinLiveQuiz(ticket.pinCode, { user: null, displayName: "  Khách   01 " });
    expect(guest.displayName).toBe("Khách 01");
    await advanceLiveQuiz(ticket.id, actor(ids.teacher), "OPEN");
    await submitLiveQuizAnswer(ticket.id, { joinToken: guest.joinToken }, { questionIndex: 0, answer: "C" });
    await expect(
      submitLiveQuizAnswer(ticket.id, { joinToken: guest.joinToken }, { questionIndex: 0, answer: "A" })
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      submitLiveQuizAnswer(ticket.id, { joinToken: guest.joinToken }, { questionIndex: 0, answer: { evil: true } })
    ).rejects.toBeTruthy();
  });
});

describe("Phase 27 integration: behavior points", () => {
  it("seeds default presets, awards only active class members, blocks cross-class IDOR, flows to gradebook & parent", async () => {
    const presets = await listBehaviorPresets(ids.class1);
    expect(presets.map((p) => p.delta).sort()).toEqual([-1, 1, 2, 2]);
    const good = presets.find((p) => p.delta === 2)!;

    const res = await awardBehaviorPoints(ids.class1, ids.teacher, {
      studentIds: [ids.stu1, ids.stu2, ids.outsider],
      presetId: good.id,
    });
    expect(res).toEqual({ awardedCount: 2, skippedCount: 1 });
    await awardBehaviorPoints(ids.class1, ids.teacher, { studentIds: [ids.stu2], delta: -1, reason: "Nói chuyện" });

    // Preset of class1 cannot be used in class2 and vice versa
    await expect(
      awardBehaviorPoints(ids.class2, ids.teacher2, { studentIds: [ids.outsider], presetId: good.id })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      awardBehaviorPoints(ids.class1, ids.teacher, { studentIds: [ids.stu1], delta: 50, reason: "x" })
    ).rejects.toMatchObject({ statusCode: 400 });

    const summary = await getClassBehaviorSummary(ids.class1);
    const totals = Object.fromEntries(summary.students.map((s) => [s.student.id, s.total]));
    expect(totals[ids.stu1]).toBe(2);
    expect(totals[ids.stu2]).toBe(1);

    // Deleting a point through another class id must fail (IDOR)
    const point = summary.recent[0]!;
    await expect(deleteBehaviorPoint(ids.class2, point.id)).rejects.toMatchObject({ statusCode: 404 });

    const gradebook = await getClassGradebook(ids.class1);
    const row = gradebook.rows.find((r) => r.student.id === ids.stu1);
    expect(row?.behaviorTotal).toBe(2);

    const overview = await getChildOverviewForParent(ids.stu1);
    expect(overview.behavior.total).toBe(2);
    expect(overview.behavior.recent[0]?.reason).toBe(good.label);
  });
});
