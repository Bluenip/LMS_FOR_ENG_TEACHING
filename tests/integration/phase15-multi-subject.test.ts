import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import { createAssignmentsForClasses } from "@/server/assignmentService";
import {
  authorizeFileDownload,
  createWorksheet,
  saveWorksheetFields,
  updateWorksheet,
} from "@/server/worksheetService";
import {
  autosaveSubmissionAnswers,
  finalizeSubmissionInternal,
  getStudentAssignmentPayload,
  saveTeacherManualGrading,
  startOrResumeSubmission,
} from "@/server/submissionService";
import { regradeWorksheetSubmissions } from "@/server/regradeService";
import { exportWorksheetAsZip, importWorksheetFile } from "@/server/worksheetTransferService";
import { listTrash, restoreFromTrash, trashClass } from "@/server/trashService";
import { getAssignmentReport } from "@/server/reportService";

const stamp = Date.now();
const prefix = `p15-${stamp}`;
const emails: string[] = [];

let adminId = "";
let teacherId = "";
let otherTeacherId = "";
let studentId = "";
let otherStudentId = "";
let parentId = "";
let otherParentId = "";

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
  studentId = await makeUser("s1", "STUDENT");
  otherStudentId = await makeUser("s2", "STUDENT");
  parentId = await makeUser("p1", "PARENT");
  otherParentId = await makeUser("p2", "PARENT");

  await prisma.parentLink.create({
    data: {
      parentId,
      studentId,
      relation: "Phụ huynh",
      verifiedAt: new Date(),
    },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { summary: { contains: prefix } } });
  await prisma.parentLink.deleteMany({ where: { parentId } });
  await prisma.class.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.worksheet.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

describe("Phase 15: Multi-subject worksheets, THPT 2025 T/F, Photo Upload & Class Trash", () => {
  it("persists subject, passages, TRUE_FALSE_GROUP, PHOTO_UPLOAD, and gates passages until attempt starts", async () => {
    const cls = await createClass(teacherId, { name: `${prefix} Toan 12A` });
    await prisma.enrollment.create({
      data: { classId: cls.id, studentId, status: "ACTIVE" },
    });

    const ws = await createWorksheet(teacherId, {
      title: `${prefix} Math & Lit Worksheet`,
      subject: "MATH",
      instructions: "Giải $x^2 - 4 = 0$",
    });
    expect(ws.subject).toBe("MATH");

    const passages = [
      {
        id: "psg-1",
        title: "Bài toán thực tế",
        content: "Cho hàm số $y = x^2 - 2x + 3$.",
        order: 0,
      },
    ];
    await updateWorksheet(ws.id, { passages });

    const savedFields = await saveWorksheetFields(ws.id, [
      {
        placement: "ANSWER_SHEET",
        type: "TRUE_FALSE_GROUP",
        label: "1",
        prompt: "Xét tính đúng sai của các mệnh đề sau:",
        passageId: "psg-1",
        order: 0,
        points: 1,
        options: [
          { id: "a", text: "$y(0) = 3$" },
          { id: "b", text: "Hàm số đồng biến trên $\\mathbb{R}$" },
          { id: "c", text: "Giá trị nhỏ nhất bằng $2$" },
          { id: "d", text: "Đồ thị cắt trục hoành tại 2 điểm" },
        ],
        answerKey: { correct: { a: true, b: false, c: true, d: false } },
        gradingOpts: { tfScoring: "THPT_2025" },
      },
      {
        placement: "ANSWER_SHEET",
        type: "PHOTO_UPLOAD",
        label: "2",
        prompt: "Chụp ảnh bài tự luận giải chi tiết vào vở",
        passageId: "psg-1",
        order: 1,
        points: 4,
        answerKey: { rubric: "Đủ bước lập bảng biến thiên", maxFiles: 5 },
      },
    ]);

    const [asg] = await createAssignmentsForClasses(teacherId, false, {
      worksheetId: ws.id,
      classIds: [cls.id],
      title: `${prefix} Đề kiểm tra Toán`,
      maxAttempts: 1,
      shuffle: false,
      showResult: "AFTER_SUBMIT",
      showAnswerKey: true,
      allowLate: true,
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
    });
    expect(asg).toBeDefined();

    // Before attempt starts: passages & fields must NOT be exposed
    const beforeStart = await getStudentAssignmentPayload(asg!.id, studentId);
    expect(beforeStart.assignment.worksheet.subject).toBe("MATH");
    expect(beforeStart.assignment.worksheet.fields).toHaveLength(0);
    expect(beforeStart.assignment.worksheet.passages).toHaveLength(0);

    // Start attempt
    const started = await startOrResumeSubmission(asg!.id, studentId);
    const subId = started.submission.id;

    const afterStart = await getStudentAssignmentPayload(asg!.id, studentId);
    expect(afterStart.assignment.worksheet.passages).toHaveLength(1);
    expect(afterStart.assignment.worksheet.fields[0]?.passageId).toBe("psg-1");

    // Authorization check for student photo files (submissions/{subId}/...)
    const validPhotoKey = `submissions/${subId}/${savedFields[1]!.id}/notebook-1.jpg`;
    const spoofedPhotoKey = `submissions/other-sub-id/${savedFields[1]!.id}/evil.jpg`;

    expect(await authorizeFileDownload(studentId, "STUDENT", validPhotoKey)).toBe(true);
    expect(await authorizeFileDownload(otherStudentId, "STUDENT", validPhotoKey)).toBe(false);
    expect(await authorizeFileDownload(teacherId, "TEACHER", validPhotoKey)).toBe(true);
    expect(await authorizeFileDownload(otherTeacherId, "TEACHER", validPhotoKey)).toBe(false);
    expect(await authorizeFileDownload(parentId, "PARENT", validPhotoKey)).toBe(true);
    expect(await authorizeFileDownload(otherParentId, "PARENT", validPhotoKey)).toBe(false);
    expect(await authorizeFileDownload(adminId, "ADMIN", validPhotoKey)).toBe(true);

    // Autosave must strip spoofed photo keys belonging to another submissionId (IDOR guard)
    await autosaveSubmissionAnswers(subId, studentId, {
      attemptVersion: started.submission.attemptVersion,
      answers: [
        {
          fieldId: savedFields[0]!.id,
          value: { a: true, b: false, c: true, d: true }, // 3/4 correct -> 0.5 pt under THPT 2025
        },
        {
          fieldId: savedFields[1]!.id,
          value: {
            files: [
              { key: validPhotoKey, name: "vo.jpg", mimeType: "image/jpeg" },
              { key: spoofedPhotoKey, name: "evil.jpg", mimeType: "image/jpeg" },
            ],
            note: "Em đã giải xong ạ",
          },
        },
      ],
    });

    const finalized = await finalizeSubmissionInternal(subId);
    expect(finalized.status).toBe("SUBMITTED"); // waiting for manual PHOTO_UPLOAD grading
    expect(finalized.autoScore).toBe(0.5);
    expect(finalized.maxScore).toBe(5);

    const savedPhotoAnswer = await prisma.answer.findUniqueOrThrow({
      where: { submissionId_fieldId: { submissionId: subId, fieldId: savedFields[1]!.id } },
    });
    expect(savedPhotoAnswer.value).toEqual({
      files: [{ key: validPhotoKey, name: "vo.jpg", mimeType: "image/jpeg" }],
      note: "Em đã giải xong ạ",
    });

    // Teacher manually grades the PHOTO_UPLOAD question
    const graded = await saveTeacherManualGrading(subId, {
      teacherComment: "Trình bày sạch đẹp",
      grades: [{ fieldId: savedFields[1]!.id, score: 3.5, isCorrect: true }],
    });
    expect(graded.status).toBe("GRADED");
    expect(graded.autoScore).toBe(0.5);
    expect(graded.manualScore).toBe(3.5);
    expect(graded.totalScore).toBe(4);

    // Regrading worksheet must preserve PHOTO_UPLOAD manual score and status=GRADED
    await regradeWorksheetSubmissions(ws.id);
    const afterRegrade = await prisma.submission.findUniqueOrThrow({ where: { id: subId } });
    expect(afterRegrade.status).toBe("GRADED");
    expect(afterRegrade.totalScore).toBe(4);

    // Assignment report renders formatted TRUE_FALSE_GROUP wrong answers instead of [object Object]
    const report = await getAssignmentReport(asg!.id, "vi");
    expect(report.questionAnalytics[0]?.commonWrongAnswers[0]?.answer).toBe(
      "a:Đ b:S c:Đ d:Đ"
    );

    // Export ZIP -> Import roundtrip preserves subject, passages, passageId & new FieldTypes
    const exported = await exportWorksheetAsZip(ws.id);
    const imported = await importWorksheetFile(
      otherTeacherId,
      exported.buffer,
      exported.filename
    );
    const importedWs = await prisma.worksheet.findUniqueOrThrow({
      where: { id: imported.worksheets[0]!.id },
      include: { fields: { orderBy: { order: "asc" } } },
    });
    // Tag title with prefix for cleanup
    await prisma.worksheet.update({
      where: { id: importedWs.id },
      data: { title: `${prefix} ${importedWs.title}` },
    });
    expect(importedWs.subject).toBe("MATH");
    expect(importedWs.passages).toEqual(passages);
    expect(importedWs.fields[0]?.type).toBe("TRUE_FALSE_GROUP");
    expect(importedWs.fields[0]?.passageId).toBe("psg-1");
    expect(importedWs.fields[1]?.type).toBe("PHOTO_UPLOAD");
  });

  it("supports filtering trash by CLASS kind and restoring deleted classes", async () => {
    const cls = await createClass(teacherId, { name: `${prefix} Trash Class` });
    await trashClass({ id: teacherId, role: "TEACHER" }, cls.id);

    const onlyClasses = await listTrash({ id: teacherId, role: "TEACHER" }, "CLASS");
    expect(onlyClasses.every((i) => i.kind === "CLASS")).toBe(true);
    expect(onlyClasses.some((i) => i.id === cls.id)).toBe(true);

    await restoreFromTrash({ id: teacherId, role: "TEACHER" }, "CLASS", cls.id);
    const afterRestore = await listTrash({ id: teacherId, role: "TEACHER" }, "CLASS");
    expect(afterRestore.some((i) => i.id === cls.id)).toBe(false);
  });
});
