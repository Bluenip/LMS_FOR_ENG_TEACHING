import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import zlib from "zlib";
import { prisma } from "@/lib/db";
import { getStorageProvider } from "@/lib/storage";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import { createAssignmentsForClasses, type CreateAssignmentInput } from "@/server/assignmentService";

function assignmentInput(
  overrides: Partial<CreateAssignmentInput> & Pick<CreateAssignmentInput, "worksheetId" | "classIds" | "title">
): CreateAssignmentInput {
  return {
    maxAttempts: 2,
    shuffle: false,
    shuffleOptions: false,
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
    ...overrides,
  };
}
import {
  authorizeFileDownload,
  createWorksheet,
  saveWorksheetFields,
  uploadFieldIllustrationImage,
  uploadWorksheetBackgroundImages,
} from "@/server/worksheetService";
import {
  cloneWorksheetForTeacher,
  exportWorksheetAsPdf,
  exportWorksheetAsZip,
  importWorksheetFile,
} from "@/server/worksheetTransferService";
import {
  autosaveSubmissionAnswers,
  finalizeSubmissionInternal,
  getStudentAssignmentPayload,
  savePhotoAnnotations,
  startOrResumeSubmission,
} from "@/server/submissionService";

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePngBuffer(width = 160, height = 100): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((1 + width * 3) * height);
  for (let y = 0; y < height; y++) {
    const off = y * (1 + width * 3);
    for (let x = 0; x < width; x++) {
      raw[off + 1 + x * 3] = 220;
      raw[off + 2 + x * 3] = 230;
      raw[off + 3 + x * 3] = 250;
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, pngChunk("IHDR", ihdr), pngChunk("IDAT", idat), pngChunk("IEND", Buffer.alloc(0))]);
}

const stamp = Date.now();
const prefix = `p17-${stamp}`;
const emails: string[] = [];

let adminId = "";
let teacher1Id = "";
let teacher2Id = "";
let student1Id = "";
let student2Id = "";

async function makeUser(tag: string, role: "TEACHER" | "STUDENT") {
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
  teacher1Id = await makeUser("t1", "TEACHER");
  teacher2Id = await makeUser("t2", "TEACHER");
  student1Id = await makeUser("s1", "STUDENT");
  student2Id = await makeUser("s2", "STUDENT");
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [teacher1Id, teacher2Id] } } });
  await prisma.notification.deleteMany({
    where: { userId: { in: [teacher1Id, teacher2Id, student1Id, student2Id] } },
  });
  await prisma.class.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.worksheet.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

describe("Phase 17: Fill on Image, Anti-IDOR Images, Shuffle Options, Photo Annotations, Clone & PDF Export", () => {
  it("validates image magic bytes, locks background image replacement after submissions, and enforces anti-IDOR file authorization", async () => {
    const cls = await createClass(teacher1Id, { name: `${prefix} Image Class` });
    await prisma.enrollment.create({
      data: { classId: cls.id, studentId: student1Id, status: "ACTIVE" },
    });

    const ws = await createWorksheet(teacher1Id, {
      title: `${prefix} Image Worksheet`,
      subject: "MATH",
    });

    // Reject fake PNG (invalid magic bytes)
    await expect(
      uploadFieldIllustrationImage(ws.id, null, Buffer.from("not-a-png"), "image/png")
    ).rejects.toMatchObject({ code: "INVALID_IMAGE" });

    // Reject oversized field illustration (> 5MB)
    await expect(
      uploadFieldIllustrationImage(ws.id, null, Buffer.alloc(5 * 1024 * 1024 + 10), "image/png")
    ).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });

    // Upload valid background page image (Fill on image)
    const validPng = makePngBuffer(1190, 842);
    const updatedWs = await uploadWorksheetBackgroundImages(ws.id, [
      { buffer: validPng, mimeType: "image/png" },
    ]);
    expect(updatedWs.pdfFileKey).toBeNull();
    expect(updatedWs.pageCount).toBe(1);
    const bgKey = updatedWs.pages[0]!.imageKey!;
    expect(bgKey.startsWith(`worksheets/${ws.id}/images/`)).toBe(true);
    expect(updatedWs.pages[0]!.widthPt).toBe(595);

    // Save an OVERLAY TEXT field + ANSWER_SHEET field with illustration
    const fieldImg = await uploadFieldIllustrationImage(ws.id, null, validPng, "image/png");
    const savedFields = await saveWorksheetFields(ws.id, [
      {
        placement: "OVERLAY",
        type: "TEXT",
        label: "1",
        order: 0,
        points: 2,
        pageIndex: 0,
        x: 0.2,
        y: 0.3,
        w: 0.25,
        h: 0.08,
        answerKey: { accepted: ["42"] },
      },
      {
        placement: "ANSWER_SHEET",
        type: "ESSAY",
        label: "2",
        prompt: "Giải thích lời giải với $\\frac{a}{b}$",
        imageKey: fieldImg.imageKey,
        order: 1,
        points: 3,
        answerKey: { rubric: "Rõ ràng" },
      },
    ]);
    expect(savedFields[1]!.imageKey).toBe(fieldImg.imageKey);

    // Assign to class -> before student1 starts, student1 CANNOT download background/field image; teacher2 CANNOT either
    const [asg] = await createAssignmentsForClasses(
      teacher1Id,
      false,
      assignmentInput({
        worksheetId: ws.id,
        classIds: [cls.id],
        title: `${prefix} Fill-on-image Assignment`,
      })
    );

    expect(await authorizeFileDownload(teacher1Id, "TEACHER", bgKey)).toBe(true);
    expect(await authorizeFileDownload(teacher2Id, "TEACHER", bgKey)).toBe(false);
    expect(await authorizeFileDownload(student1Id, "STUDENT", bgKey)).toBe(false);
    expect(await authorizeFileDownload(student2Id, "STUDENT", bgKey)).toBe(false);

    // After student1 starts attempt -> enrolled student with submission CAN access both images; student2 still blocked
    await startOrResumeSubmission(asg!.id, student1Id);
    expect(await authorizeFileDownload(student1Id, "STUDENT", bgKey)).toBe(true);
    expect(await authorizeFileDownload(student1Id, "STUDENT", fieldImg.imageKey)).toBe(true);
    expect(await authorizeFileDownload(student2Id, "STUDENT", bgKey)).toBe(false);

    // Once submissions exist, replacing background images is blocked (409)
    await expect(
      uploadWorksheetBackgroundImages(ws.id, [{ buffer: validPng, mimeType: "image/png" }])
    ).rejects.toMatchObject({ code: "WORKSHEET_HAS_SUBMISSIONS" });

    // Clone & ZIP export preserve WorksheetPage.imageKey and Field.imageKey
    await prisma.worksheet.update({ where: { id: ws.id }, data: { isShared: true } });
    expect(await authorizeFileDownload(teacher2Id, "TEACHER", bgKey)).toBe(true);

    const clonedSummary = await cloneWorksheetForTeacher(ws.id, teacher2Id);
    const cloned = await prisma.worksheet.findUniqueOrThrow({
      where: { id: clonedSummary.id },
      include: { pages: { orderBy: { pageIndex: "asc" } }, fields: { orderBy: { order: "asc" } } },
    });
    expect(cloned.pages[0]?.imageKey).toBeTruthy();
    expect(cloned.pages[0]?.imageKey).not.toBe(bgKey);
    expect(cloned.fields[1]?.imageKey).toBeTruthy();
    expect(cloned.fields[1]?.imageKey).not.toBe(fieldImg.imageKey);
    const clonedStored = await getStorageProvider().get(cloned.pages[0]!.imageKey!);
    expect(clonedStored?.buffer.byteLength).toBeGreaterThan(20);

    const exportedZip = await exportWorksheetAsZip(ws.id);
    const importedRes = await importWorksheetFile(
      teacher2Id,
      exportedZip.buffer,
      `${prefix}-reimport.engclass.zip`
    );
    const importedWs = await prisma.worksheet.findUniqueOrThrow({
      where: { id: importedRes.worksheets[0]!.id },
      include: { pages: { orderBy: { pageIndex: "asc" } }, fields: { orderBy: { order: "asc" } } },
    });
    expect(importedWs.pages[0]?.imageKey).toBeTruthy();
    expect(importedWs.fields[1]?.imageKey).toBeTruthy();

    // Printable PDF export returns valid %PDF- for both student & key modes
    const studentPdf = await exportWorksheetAsPdf(ws.id, "student");
    const keyPdf = await exportWorksheetAsPdf(ws.id, "key");
    expect(studentPdf.buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(keyPdf.buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(keyPdf.buffer.byteLength).toBeGreaterThan(studentPdf.buffer.byteLength);
  });

  it("shuffles MCQ options per submission and scores accurately regardless of shuffled order", async () => {
    const cls = await createClass(teacher1Id, { name: `${prefix} Shuffle Class` });
    await prisma.enrollment.create({
      data: { classId: cls.id, studentId: student1Id, status: "ACTIVE" },
    });

    const ws = await createWorksheet(teacher1Id, {
      title: `${prefix} Shuffle MCQ WS`,
      subject: "ENGLISH",
    });
    const [mcqField] = await saveWorksheetFields(ws.id, [
      {
        placement: "ANSWER_SHEET",
        type: "MULTIPLE_CHOICE",
        label: "1",
        prompt: "Pick the right choice",
        order: 0,
        points: 4,
        options: [
          { id: "A", text: "Wrong 1" },
          { id: "B", text: "Correct Choice" },
          { id: "C", text: "Wrong 2" },
          { id: "D", text: "Wrong 3" },
        ],
        answerKey: { correct: "B" },
      },
    ]);

    const [asg] = await createAssignmentsForClasses(
      teacher1Id,
      false,
      assignmentInput({
        worksheetId: ws.id,
        classIds: [cls.id],
        title: `${prefix} Shuffle MCQ Assignment`,
        shuffleOptions: true,
      })
    );

    const started = await startOrResumeSubmission(asg!.id, student1Id);
    const orderMap = started.submission.optionOrder as Record<string, string[]> | null;
    expect(orderMap).toBeTruthy();
    const shuffledIds = orderMap![mcqField!.id]!;
    expect(shuffledIds).toHaveLength(4);
    expect([...shuffledIds].sort()).toEqual(["A", "B", "C", "D"]);

    const payload = await getStudentAssignmentPayload(asg!.id, student1Id);
    const returnedOpts = payload.assignment.worksheet.fields[0]!.options as Array<{ id: string }>;
    expect(returnedOpts.map((o) => o.id)).toEqual(shuffledIds);

    await autosaveSubmissionAnswers(started.submission.id, student1Id, {
      attemptVersion: started.submission.attemptVersion,
      answers: [{ fieldId: mcqField!.id, value: "B" }],
    });
    const fin = await finalizeSubmissionInternal(started.submission.id);
    expect(fin.autoScore).toBe(4);
    expect(fin.totalScore).toBe(4);
  });

  it("validates photo annotations and prevents leaking annotations before revealResult", async () => {
    const cls = await createClass(teacher1Id, { name: `${prefix} Annotate Class` });
    await prisma.enrollment.create({
      data: { classId: cls.id, studentId: student1Id, status: "ACTIVE" },
    });

    const ws = await createWorksheet(teacher1Id, {
      title: `${prefix} Photo Annotate WS`,
      subject: "MATH",
    });
    const saved = await saveWorksheetFields(ws.id, [
      {
        placement: "ANSWER_SHEET",
        type: "TEXT",
        label: "1",
        order: 0,
        points: 1,
        answerKey: { accepted: ["5"] },
      },
      {
        placement: "ANSWER_SHEET",
        type: "PHOTO_UPLOAD",
        label: "2",
        prompt: "Chụp lời giải tự luận",
        order: 1,
        points: 4,
        answerKey: { maxFiles: 3 },
      },
    ]);
    const textFieldId = saved[0]!.id;
    const photoFieldId = saved[1]!.id;

    // Assign with showResult AFTER_DUE (future dueAt) so revealResult === false initially
    const [asg] = await createAssignmentsForClasses(
      teacher1Id,
      false,
      assignmentInput({
        worksheetId: ws.id,
        classIds: [cls.id],
        title: `${prefix} Photo Annotate Assignment`,
        dueAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        showResult: "AFTER_DUE",
        showAnswerKey: false,
      })
    );

    const started = await startOrResumeSubmission(asg!.id, student1Id);
    const subId = started.submission.id;
    const photoKey = `submissions/${subId}/${photoFieldId}/notebook.png`;
    await getStorageProvider().put(photoKey, makePngBuffer(), "image/png");

    await autosaveSubmissionAnswers(subId, student1Id, {
      attemptVersion: started.submission.attemptVersion,
      answers: [
        { fieldId: textFieldId, value: "5" },
        {
          fieldId: photoFieldId,
          value: { files: [{ key: photoKey, name: "notebook.png", mimeType: "image/png" }] },
        },
      ],
    });
    await finalizeSubmissionInternal(subId);

    // Reject wrong field type
    await expect(savePhotoAnnotations(subId, textFieldId, { [photoKey]: [] })).rejects.toMatchObject({
      code: "INVALID_FIELD_TYPE",
    });
    // Reject spoofed fileKey not in answer.value.files
    await expect(
      savePhotoAnnotations(subId, photoFieldId, {
        [`submissions/${subId}/${photoFieldId}/fake.png`]: [],
      })
    ).rejects.toMatchObject({ code: "INVALID_FILE" });

    // Save valid annotations
    await savePhotoAnnotations(subId, photoFieldId, {
      [photoKey]: [
        { id: "a1", type: "check", color: "#DC2626", strokeWidth: 3, x: 0.4, y: 0.5 },
        { id: "a2", type: "text", color: "#DC2626", strokeWidth: 2, x: 0.2, y: 0.3, text: "Tốt!" },
      ],
    });

    // Zero-leak check when showResult="AFTER_DUE" & not yet due -> annotations MUST be null
    const beforeRelease = await getStudentAssignmentPayload(asg!.id, student1Id);
    const hiddenAns = beforeRelease.submission?.answers.find((a) => a.fieldId === photoFieldId);
    expect(hiddenAns?.annotations).toBeNull();

    // Update assignment showResult -> AFTER_SUBMIT -> annotations now returned cleanly
    await prisma.assignment.update({
      where: { id: asg!.id },
      data: { showResult: "AFTER_SUBMIT" },
    });
    const afterRelease = await getStudentAssignmentPayload(asg!.id, student1Id);
    const visibleAns = afterRelease.submission?.answers.find((a) => a.fieldId === photoFieldId);
    expect(visibleAns?.annotations?.[photoKey]).toHaveLength(2);
    expect(visibleAns?.annotations?.[photoKey]?.[1]?.text).toBe("Tốt!");
  });
});
