import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import {
  createQuestionBankItem,
  deleteQuestionBankItem,
  generateWorksheetFromMatrix,
  listQuestionBankItems,
  MatrixInsufficientError,
  saveFieldToQuestionBank,
  updateQuestionBankItem,
} from "@/server/questionBankService";
import {
  createWorksheet,
  saveWorksheetFields,
} from "@/server/worksheetService";
import {
  createExamSession,
  getExamSessionLiveSnapshot,
  getExamSessionReport,
} from "@/server/examSessionService";
import {
  autosaveSubmissionAnswers,
  startOrResumeSubmission,
  submitByStudent,
} from "@/server/submissionService";

const suffix = `p22_${Date.now()}`;
let adminId = "";
let teacherAId = "";
let teacherBId = "";
let stu1Id = "";
let stu2Id = "";
let stu3Id = "";
let classAId = "";
let classBId = "";
const createdWorksheetIds: string[] = [];
const createdBankItemIds: string[] = [];
let createdExamSessionId = "";

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@engclass.vn" },
    select: { id: true },
  });
  adminId = admin.id;
  const actor = { id: adminId, role: "ADMIN" as const };

  teacherAId = (
    await createAccount(actor, {
      name: "Teacher A P22",
      email: `ta_${suffix}@test.vn`,
      role: "TEACHER",
      password: "password123",
    })
  ).user.id;
  teacherBId = (
    await createAccount(actor, {
      name: "Teacher B P22",
      email: `tb_${suffix}@test.vn`,
      role: "TEACHER",
      password: "password123",
    })
  ).user.id;
  stu1Id = (
    await createAccount(actor, {
      name: "Student 1 P22",
      email: `s1_${suffix}@test.vn`,
      role: "STUDENT",
      password: "password123",
    })
  ).user.id;
  stu2Id = (
    await createAccount(actor, {
      name: "Student 2 P22",
      email: `s2_${suffix}@test.vn`,
      role: "STUDENT",
      password: "password123",
    })
  ).user.id;
  stu3Id = (
    await createAccount(actor, {
      name: "Student 3 P22",
      email: `s3_${suffix}@test.vn`,
      role: "STUDENT",
      password: "password123",
    })
  ).user.id;

  const clsA = await createClass(teacherAId, { name: `Class A P22 ${suffix}` });
  const clsB = await createClass(teacherAId, { name: `Class B P22 ${suffix}` });
  classAId = clsA.id;
  classBId = clsB.id;

  await prisma.enrollment.createMany({
    data: [
      { classId: classAId, studentId: stu1Id, status: "ACTIVE" },
      { classId: classAId, studentId: stu2Id, status: "ACTIVE" },
      { classId: classBId, studentId: stu3Id, status: "ACTIVE" },
    ],
  });
});

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { userId: { in: [stu1Id, stu2Id, stu3Id, teacherAId, teacherBId].filter(Boolean) } },
  });
  if (createdExamSessionId) {
    await prisma.examSession.deleteMany({ where: { id: createdExamSessionId } });
  }
  await prisma.class.deleteMany({ where: { id: { in: [classAId, classBId].filter(Boolean) } } });
  await prisma.worksheet.deleteMany({ where: { id: { in: createdWorksheetIds } } });
  await prisma.questionBankItem.deleteMany({
    where: {
      OR: [
        { id: { in: createdBankItemIds } },
        { ownerId: { in: [teacherAId, teacherBId].filter(Boolean) } },
      ],
    },
  });
  await prisma.user.deleteMany({
    where: {
      id: { in: [teacherAId, teacherBId, stu1Id, stu2Id, stu3Id].filter(Boolean) },
    },
  });
});

describe("Phase 22 Integration: Question Bank, Matrix Generator, Variants & Cross-class Exams", () => {
  it("enforces Question Bank anti-IDOR and saves fields + builds a 20-question matrix worksheet", async () => {
    // 1. Seed 22 private questions owned by teacherA (tag p22private) + 1 unshared for IDOR test
    const uniqueTag = `tag_${suffix}`;
    for (let i = 0; i < 20; i++) {
      const it = await createQuestionBankItem(teacherAId, {
        subject: "ENGLISH",
        type: i % 2 === 0 ? "MULTIPLE_CHOICE" : "TEXT",
        prompt: `Question ${i + 1} (${suffix})`,
        options:
          i % 2 === 0
            ? [
                { id: "A", text: "Opt A" },
                { id: "B", text: "Opt B" },
                { id: "C", text: "Opt C" },
              ]
            : null,
        answerKey: i % 2 === 0 ? { correct: "A" } : { accepted: ["ans"] },
        topicTag: i < 10 ? "Ngữ pháp" : "Từ vựng",
        difficulty: (i % 5) + 1,
        tags: [uniqueTag],
        isShared: false,
      });
      createdBankItemIds.push(it.id);
    }

    const privateId = createdBankItemIds[0]!;
    // TeacherB CANNOT see teacherA's private items, CANNOT update or delete them
    const bList = await listQuestionBankItems(teacherBId, false, { q: suffix });
    expect(bList.items.some((x) => x.id === privateId)).toBe(false);

    await expect(
      updateQuestionBankItem(privateId, teacherBId, false, { prompt: "hacked" })
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      deleteQuestionBankItem(privateId, teacherBId, false)
    ).rejects.toMatchObject({ statusCode: 403 });

    // TeacherB CANNOT draw teacherA's private items in matrix
    await expect(
      generateWorksheetFromMatrix(teacherBId, false, {
        title: "Unauthorized Matrix",
        subject: "ENGLISH",
        rows: [{ tags: [uniqueTag], count: 1 }],
      })
    ).rejects.toBeInstanceOf(MatrixInsufficientError);

    // 2. TeacherA promotes a Field from Worksheet into Question Bank
    const srcWs = await createWorksheet(teacherAId, {
      title: `Source WS ${suffix}`,
      subject: "ENGLISH",
    });
    createdWorksheetIds.push(srcWs.id);
    const savedSrcFields = await saveWorksheetFields(srcWs.id, [
      {
        label: "1",
        type: "TEXT",
        placement: "ANSWER_SHEET",
        order: 0,
        points: 2,
        prompt: "Promoted question",
        topicTag: "Đọc hiểu",
        answerKey: { accepted: ["yes"] },
      },
    ]);
    const promoted = await saveFieldToQuestionBank(savedSrcFields[0]!.id, teacherAId, false, {
      difficulty: 4,
      tags: [uniqueTag],
    });
    createdBankItemIds.push(promoted.id);
    expect(promoted.topicTag).toBe("Đọc hiểu");

    // 3. TeacherA builds a 20-question worksheet from matrix (10 Grammar + 10 Vocab)
    const generated = await generateWorksheetFromMatrix(teacherAId, false, {
      title: `Matrix 20Q ${suffix}`,
      subject: "ENGLISH",
      includeShared: false,
      rows: [
        { subject: "ENGLISH", topicTag: "Ngữ pháp", tags: [uniqueTag], count: 10, points: 0.5 },
        { subject: "ENGLISH", topicTag: "Từ vựng", tags: [uniqueTag], count: 10, points: 0.5 },
      ],
    });
    createdWorksheetIds.push(generated.worksheet.id);
    expect(generated.fieldCount).toBe(20);

    const dbFields = await prisma.field.findMany({
      where: { worksheetId: generated.worksheet.id },
    });
    expect(dbFields).toHaveLength(20);
    expect(dbFields.every((f) => Boolean(f.bankItemId) && Boolean(f.topicTag))).toBe(true);
  });

  it("organizes multi-class ExamSession with 4 variants, grades shuffled attempts & merges report", async () => {
    const ws = await createWorksheet(teacherAId, {
      title: `Exam Source ${suffix}`,
      subject: "ENGLISH",
    });
    createdWorksheetIds.push(ws.id);
    const fields = await saveWorksheetFields(ws.id, [
      {
        label: "1",
        type: "MULTIPLE_CHOICE",
        placement: "ANSWER_SHEET",
        order: 0,
        points: 5,
        topicTag: "Ngữ pháp",
        prompt: "Q1?",
        options: [
          { id: "A", text: "Correct" },
          { id: "B", text: "Wrong 1" },
          { id: "C", text: "Wrong 2" },
        ],
        answerKey: { correct: "A" },
      },
      {
        label: "2",
        type: "TEXT",
        placement: "ANSWER_SHEET",
        order: 1,
        points: 5,
        topicTag: "Từ vựng",
        prompt: "Q2?",
        answerKey: { accepted: ["hello"] },
      },
    ]);

    const created = await createExamSession(teacherAId, false, {
      title: `Exam Session ${suffix}`,
      worksheetId: ws.id,
      classIds: [classAId, classBId],
      variantCount: 4,
      showResult: "AFTER_SUBMIT",
      proctorMode: "OFF",
    });
    createdExamSessionId = created.session.id;
    expect(created.assignments).toHaveLength(2);

    const asgA = created.assignments.find((a) => a.classId === classAId)!;
    const asgB = created.assignments.find((a) => a.classId === classBId)!;

    const variantsA = await prisma.examVariant.findMany({
      where: { assignmentId: asgA.id },
      orderBy: { code: "asc" },
    });
    expect(variantsA.map((v) => v.code)).toEqual(["101", "102", "103", "104"]);

    // Stu1 & Stu2 start in Class A -> get different variants 101 and 102
    const s1Start = await startOrResumeSubmission(asgA.id, stu1Id, {});
    const s2Start = await startOrResumeSubmission(asgA.id, stu2Id, {});
    expect(s1Start.submission.examVariantId).not.toBe(s2Start.submission.examVariantId);

    // Stu3 starts in Class B
    const s3Start = await startOrResumeSubmission(asgB.id, stu3Id, {});

    // Submit all 3: stu1 & stu3 get 10/10, stu2 gets 5/10 (only Q1 right)
    for (const [sub, q2Val] of [
      [s1Start.submission, "hello"],
      [s2Start.submission, "wrong"],
      [s3Start.submission, "hello"],
    ] as const) {
      await autosaveSubmissionAnswers(sub.id, sub.studentId, {
        attemptVersion: sub.attemptVersion,
        answers: [
          { fieldId: fields[0]!.id, value: "A" },
          { fieldId: fields[1]!.id, value: q2Val },
        ],
      });
      await submitByStudent(sub.id, sub.studentId);
    }

    // TeacherB cannot view TeacherA's exam report
    await expect(
      getExamSessionReport(createdExamSessionId, teacherBId, false)
    ).rejects.toMatchObject({ statusCode: 403 });

    const report = await getExamSessionReport(createdExamSessionId, teacherAId, false);
    expect(report.classComparisons).toHaveLength(2);
    expect(report.overall.submittedCount).toBe(3);
    // Scores across both classes: 10, 5, 10 => avg = 8.33
    expect(report.overall.avgScore10).toBe(8.33);
    // Merged Q1 should be 3/3 = 100%, Q2 should be 2/3 = 67%
    const q1Stat = report.questionAnalytics.find((q) => q.fieldId === fields[0]!.id);
    const q2Stat = report.questionAnalytics.find((q) => q.fieldId === fields[1]!.id);
    expect(q1Stat?.correctRate).toBe(100);
    expect(q2Stat?.correctRate).toBe(67);

    const live = await getExamSessionLiveSnapshot(createdExamSessionId, teacherAId, false);
    expect(live.totals.submitted).toBe(3);
  });
});
