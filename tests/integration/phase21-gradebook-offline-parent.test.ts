import ExcelJS from "exceljs";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import {
  createQuickTextbookAssignment,
  uploadQuickAssignmentAttachment,
} from "@/server/assignmentService";
import { authorizeFileDownload } from "@/server/worksheetService";
import {
  createOfflineGradeColumn,
  deleteOfflineGradeColumn,
  importOfflineGradesFromExcel,
  listOfflineGradeColumns,
  saveOfflineGradeEntries,
  updateOfflineGradeColumn,
} from "@/server/offlineGradeService";
import {
  exportClassGradebookExcel,
  exportStudentReportCardPdf,
  getClassGradebook,
} from "@/server/gradebookService";
import { getChildOverviewForParent } from "@/server/parentService";
import {
  startOrResumeSubmission,
  submitByStudent,
  autosaveSubmissionAnswers,
} from "@/server/submissionService";
import { createWorksheet, saveWorksheetFields } from "@/server/worksheetService";

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeTinyPng(): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc(2 * (1 + 2 * 3), 200);
  raw[0] = 0;
  raw[7] = 0;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const suffix = `p21_${Date.now()}`;
let actorAdminId = "";
let teacherId = "";
let outsiderTeacherId = "";
let stu1Id = "";
let stu2Id = "";
let outsiderStuId = "";
let parent1Id = "";
let outsiderParentId = "";
let classId = "";
let outsiderClassId = "";
const createdWorksheetIds: string[] = [];

beforeAll(async () => {
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: "admin@engclass.vn" },
    select: { id: true },
  });
  actorAdminId = admin.id;
  const actor = { id: actorAdminId, role: "ADMIN" as const };

  teacherId = (
    await createAccount(actor, {
      name: "GV Phase 21",
      email: `t_${suffix}@test.vn`,
      role: "TEACHER",
      password: "password123",
    })
  ).user.id;
  outsiderTeacherId = (
    await createAccount(actor, {
      name: "GV Ngoai 21",
      email: `tout_${suffix}@test.vn`,
      role: "TEACHER",
      password: "password123",
    })
  ).user.id;

  stu1Id = (
    await createAccount(actor, {
      name: "Nguyễn Minh Anh P21",
      email: `s1_${suffix}@test.vn`,
      role: "STUDENT",
      password: "password123",
    })
  ).user.id;
  stu2Id = (
    await createAccount(actor, {
      name: "Trần Bảo Châu P21",
      email: `s2_${suffix}@test.vn`,
      role: "STUDENT",
      password: "password123",
    })
  ).user.id;
  outsiderStuId = (
    await createAccount(actor, {
      name: "HS Ngoai Lop P21",
      email: `sout_${suffix}@test.vn`,
      role: "STUDENT",
      password: "password123",
    })
  ).user.id;

  parent1Id = (
    await createAccount(actor, {
      name: "PH 1 P21",
      email: `p1_${suffix}@test.vn`,
      role: "PARENT",
      password: "password123",
    })
  ).user.id;
  outsiderParentId = (
    await createAccount(actor, {
      name: "PH Ngoai P21",
      email: `pout_${suffix}@test.vn`,
      role: "PARENT",
      password: "password123",
    })
  ).user.id;

  await prisma.parentLink.create({
    data: { parentId: parent1Id, studentId: stu1Id, relation: "Phụ huynh", verifiedAt: new Date() },
  });
  await prisma.parentLink.create({
    data: { parentId: outsiderParentId, studentId: outsiderStuId, relation: "Phụ huynh", verifiedAt: new Date() },
  });

  const cls = await createClass(teacherId, { name: `Lop 12 P21 ${suffix}` });
  classId = cls.id;
  await prisma.enrollment.createMany({
    data: [
      { classId, studentId: stu1Id, status: "ACTIVE" },
      { classId, studentId: stu2Id, status: "ACTIVE" },
    ],
  });

  const outCls = await createClass(outsiderTeacherId, { name: `Lop Ngoai ${suffix}` });
  outsiderClassId = outCls.id;
  await prisma.enrollment.create({
    data: { classId: outsiderClassId, studentId: outsiderStuId, status: "ACTIVE" },
  });
});

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { userId: { in: [stu1Id, stu2Id, outsiderStuId, parent1Id, outsiderParentId, teacherId].filter(Boolean) } },
  });
  await prisma.class.deleteMany({ where: { id: { in: [classId, outsiderClassId].filter(Boolean) } } });
  await prisma.worksheet.deleteMany({ where: { id: { in: createdWorksheetIds } } });
  await prisma.user.deleteMany({
    where: {
      id: {
        in: [
          teacherId,
          outsiderTeacherId,
          stu1Id,
          stu2Id,
          outsiderStuId,
          parent1Id,
          outsiderParentId,
        ].filter(Boolean),
      },
    },
  });
});

describe("Phase 21: Quick Textbook, Offline Grades, Excel Import, Report Card PDF & Parent Privacy", () => {
  it("validates quick textbook upload magic bytes, creates assignment & enforces attachment anti-IDOR", async () => {
    // Reject invalid bytes disguised as PNG
    await expect(
      uploadQuickAssignmentAttachment(classId, {
        buffer: Buffer.from("not-an-image"),
        originalName: "fake.png",
        mimeType: "image/png",
      })
    ).rejects.toMatchObject({ code: "INVALID_FILE_TYPE" });

    const pngAtt = await uploadQuickAssignmentAttachment(classId, {
      buffer: makeTinyPng(),
      originalName: "sgk-page-12.png",
      mimeType: "image/png",
    });
    expect(pngAtt.key).toContain(`assignments/quick/${classId}/`);

    const created = await createQuickTextbookAssignment(teacherId, false, {
      title: "SGK Integration Trang 12",
      classIds: [classId],
      promptText: "Giải bài 1, 2 trang 12 SGK",
      attachmentKeys: [pngAtt],
      weight: 1,
      maxScore: 10,
    });
    createdWorksheetIds.push(created.worksheet.id);
    expect(created.assignments).toHaveLength(1);
    expect(created.assignments[0]!.isQuickTextbook).toBe(true);

    // Anti-IDOR on quick textbook attachment
    expect(await authorizeFileDownload(teacherId, "TEACHER", pngAtt.key)).toBe(true);
    expect(await authorizeFileDownload(stu1Id, "STUDENT", pngAtt.key)).toBe(true);
    expect(await authorizeFileDownload(parent1Id, "PARENT", pngAtt.key)).toBe(true);
    expect(await authorizeFileDownload(outsiderStuId, "STUDENT", pngAtt.key)).toBe(false);
    expect(await authorizeFileDownload(outsiderTeacherId, "TEACHER", pngAtt.key)).toBe(false);
    expect(await authorizeFileDownload(outsiderParentId, "PARENT", pngAtt.key)).toBe(false);
  });

  it("manages offline grade columns, rejects cross-class/invalid scores, imports Excel, builds Gradebook + PDF & scopes Parent data", async () => {
    // 1. Seed one graded online assignment for weighted gradebook check
    const ws = await createWorksheet(teacherId, { title: `WS P21 ${suffix}` });
    createdWorksheetIds.push(ws.id);
    const savedFields = await saveWorksheetFields(ws.id, [
      {
        label: "1",
        type: "TEXT",
        placement: "ANSWER_SHEET",
        order: 0,
        points: 10,
        prompt: "2 + 2 = ?",
        answerKey: { accepted: ["4"] },
      },
    ]);
    const onlineAsg = await prisma.assignment.create({
      data: {
        classId,
        worksheetId: ws.id,
        title: "Online Quiz P21",
        weight: 1,
        showResult: "AFTER_SUBMIT",
      },
    });
    const started = await startOrResumeSubmission(onlineAsg.id, stu1Id, {});
    await autosaveSubmissionAnswers(started.submission.id, stu1Id, {
      attemptVersion: started.submission.attemptVersion,
      answers: [{ fieldId: savedFields[0]!.id, value: "4" }],
    });
    await submitByStudent(started.submission.id, stu1Id); // 10/10

    // 2. Offline column CRUD & entry validation
    const col1 = await createOfflineGradeColumn(classId, teacherId, {
      title: "Kiểm tra giấy 15p P21",
      maxScore: 10,
      weight: 2,
      date: "2026-11-10",
    });
    const colTemp = await createOfflineGradeColumn(classId, teacherId, {
      title: "Temp Column",
      maxScore: 10,
      weight: 1,
    });
    await updateOfflineGradeColumn(classId, colTemp.id, { title: "Temp Renamed" });
    await deleteOfflineGradeColumn(classId, colTemp.id);

    const cols = await listOfflineGradeColumns(classId);
    expect(cols.some((c) => c.id === col1.id)).toBe(true);
    expect(cols.some((c) => c.id === colTemp.id)).toBe(false);

    // Reject outsider student
    await expect(
      saveOfflineGradeEntries(classId, col1.id, [{ studentId: outsiderStuId, score: 9 }])
    ).rejects.toMatchObject({ code: "STUDENT_NOT_IN_CLASS" });

    // Reject score > maxScore
    await expect(
      saveOfflineGradeEntries(classId, col1.id, [{ studentId: stu1Id, score: 15 }])
    ).rejects.toMatchObject({ code: "INVALID_SCORE" });

    // 3. Excel import: match 1 by email, 1 by exact name, report 1 missing & 1 out-of-range
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Scores");
    sheet.addRow(["Email", "Họ và tên", "Điểm", "Ghi chú"]);
    sheet.addRow([`s1_${suffix}@test.vn`, "", 7, "Tốt"]);
    sheet.addRow(["", "Trần Bảo Châu P21", 8.5, "Khá"]);
    sheet.addRow(["unknown@test.vn", "", 9, ""]);
    sheet.addRow([`s2_${suffix}@test.vn`, "", 99, "Quá điểm"]);
    const xlsxBuf = Buffer.from(await wb.xlsx.writeBuffer());

    const preview = await importOfflineGradesFromExcel(classId, col1.id, xlsxBuf, { commit: false });
    expect(preview.matched).toHaveLength(2);
    expect(preview.errors).toHaveLength(2);
    expect(preview.savedCount).toBe(0);

    const committed = await importOfflineGradesFromExcel(classId, col1.id, xlsxBuf, { commit: true });
    expect(committed.savedCount).toBe(2);

    // 4. Class Gradebook weighted avg: stu1 has Online 10 (w=1) + Offline 7 (w=2) => (10+14)/3 = 8.0
    const gb = await getClassGradebook(classId);
    const s1Row = gb.rows.find((r) => r.student.id === stu1Id);
    const s2Row = gb.rows.find((r) => r.student.id === stu2Id);
    expect(s1Row?.weightedAvg10).toBe(8);
    expect(s2Row?.weightedAvg10).toBe(8.5);
    expect(gb.offlineColumns.find((c) => c.id === col1.id)?.classAvg10).toBe(7.75);

    // 5. Excel & PDF exports
    const { buffer: gbXlsx } = await exportClassGradebookExcel(classId, undefined, "vi");
    expect(gbXlsx.subarray(0, 2).toString("ascii")).toBe("PK");

    const { buffer: reportPdf } = await exportStudentReportCardPdf(classId, stu1Id, undefined, "vi");
    expect(reportPdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(reportPdf.byteLength).toBeGreaterThan(1500);

    // 6. Parent Portal privacy: parent1 sees ONLY stu1's score (7), never stu2's name/score (8.5)
    const parentOverview = await getChildOverviewForParent(stu1Id, classId);
    const parentCol = parentOverview.offlineGrades.find((g) => g.columnId === col1.id);
    expect(parentCol?.score).toBe(7);
    expect(parentCol?.classAvg10).toBe(7.75);
    const serialized = JSON.stringify(parentOverview);
    expect(serialized).not.toContain(stu2Id);
    expect(serialized).not.toContain("Trần Bảo Châu P21");
  });
});
