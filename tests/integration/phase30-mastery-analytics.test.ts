import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import {
  clearAnalyticsCache,
  createRemedialAssignmentFromWeakTopics,
  getClassAtRiskStudents,
  getClassMasteryMatrix,
  getStudentMasteryProfile,
  getTeacherAtRiskSummary,
} from "@/server/masteryAnalyticsService";
import { getAssignmentItemAnalysis } from "@/server/reportService";
import { listStudentAssignments } from "@/server/assignmentService";

const suffix = `p30_${Date.now()}`;
const ids = { admin: "", teacher: "", teacher2: "", s1: "", s2: "", parent: "", parent2: "", class1: "", ws: "", asg: "", f1: "", f2: "" };

async function mk(role: "TEACHER" | "STUDENT" | "PARENT", tag: string) {
  const res = await createAccount(
    { id: ids.admin, role: "ADMIN" },
    { name: `${tag} ${suffix}`, email: `${tag.toLowerCase()}_${suffix}@test.vn`, password: "password123", role }
  );
  return res.user.id;
}

beforeAll(async () => {
  ids.admin = (await prisma.user.findUnique({ where: { email: "admin@engclass.vn" } }))!.id;
  ids.teacher = await mk("TEACHER", "T1");
  ids.teacher2 = await mk("TEACHER", "T2");
  ids.s1 = await mk("STUDENT", "S1");
  ids.s2 = await mk("STUDENT", "S2");
  ids.parent = await mk("PARENT", "P1");
  ids.parent2 = await mk("PARENT", "P2");
  await prisma.parentLink.create({ data: { parentId: ids.parent, studentId: ids.s2, verifiedAt: new Date() } });
  await prisma.parentLink.create({ data: { parentId: ids.parent2, studentId: ids.s2 } }); // not verified
  ids.class1 = (await createClass(ids.teacher, { name: `C ${suffix}` })).id;
  await prisma.enrollment.createMany({
    data: [ids.s1, ids.s2].map((studentId) => ({ classId: ids.class1, studentId, status: "ACTIVE" as const })),
  });
  const opts = ["A", "B", "C", "D"].map((id) => ({ id, text: id }));
  const ws = await prisma.worksheet.create({
    data: {
      ownerId: ids.teacher,
      title: `WS ${suffix}`,
      fields: {
        create: [
          { placement: "ANSWER_SHEET", type: "MULTIPLE_CHOICE", label: "1", order: 1, points: 2, options: opts, answerKey: { correct: "A" }, topicTag: `Tenses${suffix}` },
          { placement: "ANSWER_SHEET", type: "MULTIPLE_CHOICE", label: "2", order: 2, points: 2, options: opts, answerKey: { correct: "B" }, topicTag: `Passive${suffix}` },
        ],
      },
    },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  ids.ws = ws.id;
  ids.f1 = ws.fields[0]!.id;
  ids.f2 = ws.fields[1]!.id;
  ids.asg = (
    await prisma.assignment.create({
      data: { classId: ids.class1, worksheetId: ws.id, title: `A ${suffix}`, dueAt: new Date(Date.now() - 86_400_000) },
    })
  ).id;
  // S1: both right (10/10). S2: Q1 right, Q2 wrong (5/10).
  for (const [sid, a2, total] of [
    [ids.s1, "B", 4],
    [ids.s2, "C", 2],
  ] as const) {
    await prisma.submission.create({
      data: {
        assignmentId: ids.asg,
        studentId: sid,
        attemptNo: 1,
        status: "GRADED",
        submittedAt: new Date(),
        maxScore: 4,
        totalScore: total,
        answers: {
          create: [
            { fieldId: ids.f1, value: "A", score: 2, isCorrect: true },
            { fieldId: ids.f2, value: a2, score: a2 === "B" ? 2 : 0, isCorrect: a2 === "B" },
          ],
        },
      },
    });
  }
  // Two overdue assignments S2 never submitted → at-risk signal
  for (let i = 0; i < 2; i++) {
    await prisma.assignment.create({
      data: { classId: ids.class1, worksheetId: ws.id, title: `Overdue ${i} ${suffix}`, dueAt: new Date(Date.now() - (i + 2) * 86_400_000) },
    });
  }
  await prisma.questionBankItem.createMany({
    data: [1, 2, 3].map((i) => ({
      ownerId: ids.teacher,
      type: "MULTIPLE_CHOICE" as const,
      prompt: `Passive drill ${i} ${suffix}`,
      options: opts,
      answerKey: { correct: "A" },
      topicTag: `Passive${suffix}`,
    })),
  });
  clearAnalyticsCache();
});

afterAll(async () => {
  await prisma.class.deleteMany({ where: { id: ids.class1 } });
  await prisma.questionBankItem.deleteMany({ where: { ownerId: ids.teacher } });
  await prisma.worksheet.deleteMany({ where: { ownerId: ids.teacher } });
  await prisma.user.deleteMany({
    where: { id: { in: [ids.teacher, ids.teacher2, ids.s1, ids.s2, ids.parent, ids.parent2] } },
  });
});

describe("Phase 30 integration: mastery, at-risk, remedial work & item analysis", () => {
  it("builds the class heatmap and the student profile with IDOR protection", async () => {
    const m = await getClassMasteryMatrix(ids.class1);
    expect(m.tags[0]!.tag).toBe(`Passive${suffix}`); // weakest first
    const s2Row = m.rows.find((r) => r.student.id === ids.s2)!;
    expect(s2Row.cells[`Passive${suffix}`]!.level).toBe("NEEDS_WORK");
    expect(s2Row.cells[`Tenses${suffix}`]!.level).toBe("MASTERED");

    const self = await getStudentMasteryProfile(ids.s2, { id: ids.s2, role: "STUDENT" });
    expect(self.toReview.map((c) => c.tag)).toEqual([`Passive${suffix}`]);
    expect((await getStudentMasteryProfile(ids.s2, { id: ids.parent, role: "PARENT" })).strengths).toHaveLength(1);
    expect((await getStudentMasteryProfile(ids.s2, { id: ids.teacher, role: "TEACHER" })).topics).toHaveLength(2);

    await expect(getStudentMasteryProfile(ids.s2, { id: ids.s1, role: "STUDENT" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(getStudentMasteryProfile(ids.s2, { id: ids.parent2, role: "PARENT" })).rejects.toMatchObject({ statusCode: 403 });
    await expect(getStudentMasteryProfile(ids.s2, { id: ids.teacher2, role: "TEACHER" })).rejects.toMatchObject({ statusCode: 403 });
  });

  it("flags at-risk students for the class and on the teacher dashboard", async () => {
    const r = await getClassAtRiskStudents(ids.class1);
    const s2 = r.students.find((s) => s.student.id === ids.s2)!;
    expect(s2.reasons.map((x) => x.signal)).toEqual(["MISSING_WORK"]);
    expect(s2.level).toBe("MEDIUM");
    const summary = await getTeacherAtRiskSummary({ id: ids.teacher, role: "TEACHER" });
    expect(summary.students.some((s) => s.student.id === ids.s2 && s.classId === ids.class1)).toBe(true);
    expect((await getTeacherAtRiskSummary({ id: ids.teacher2, role: "TEACHER" })).total).toBe(0);
  });

  it("creates a remedial assignment only for the weak group and logs it", async () => {
    const res = await createRemedialAssignmentFromWeakTopics(
      ids.class1,
      { id: ids.teacher, role: "TEACHER" },
      { topicTags: [`Passive${suffix}`], studentIds: [ids.s2, ids.teacher2], questionCount: 2 }
    );
    expect(res).toMatchObject({ questionCount: 2, studentCount: 1 });
    const targets = await prisma.assignmentTarget.findMany({ where: { assignmentId: res.assignmentId } });
    expect(targets.map((t) => t.studentId)).toEqual([ids.s2]);
    expect(await prisma.remedialPlanLog.count({ where: { assignmentId: res.assignmentId } })).toBe(1);

    const forS1 = await listStudentAssignments(ids.s1);
    const forS2 = await listStudentAssignments(ids.s2);
    const has = (list: unknown) => JSON.stringify(list).includes(res.assignmentId);
    expect(has(forS1)).toBe(false);
    expect(has(forS2)).toBe(true);

    await expect(
      createRemedialAssignmentFromWeakTopics(ids.class1, { id: ids.teacher, role: "TEACHER" }, { topicTags: ["Nope"], studentIds: [ids.s2], questionCount: 3 })
    ).rejects.toMatchObject({ code: "REMEDIAL_NO_QUESTIONS" });
  });

  it("item analysis returns difficulty and distractors for each question", async () => {
    const res = await getAssignmentItemAnalysis(ids.asg);
    expect(res.examineeCount).toBe(2);
    const q2 = res.items.find((i) => i.fieldId === ids.f2)!;
    expect(q2.pValue).toBe(0.5);
    expect(q2.distractors.find((d) => d.optionId === "B")).toMatchObject({ isKey: true, overall: 0.5 });
    expect(res.items.find((i) => i.fieldId === ids.f1)!.flag).toBe("TOO_EASY");
  });
});
