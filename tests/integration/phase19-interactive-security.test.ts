import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import zlib from "zlib";
import { prisma } from "@/lib/db";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import { createAssignmentsForClasses } from "@/server/assignmentService";
import { createWorksheet, saveWorksheetFields } from "@/server/worksheetService";
import {
  autosaveSubmissionAnswers,
  finalizeSubmissionInternal,
  getStudentAssignmentPayload,
  startOrResumeSubmission,
} from "@/server/submissionService";
import {
  exportWorksheetAsPdf,
  exportWorksheetAsZip,
  importWorksheetFile,
} from "@/server/worksheetTransferService";
import { POST as uploadSubmissionFile } from "@/app/api/submissions/[id]/files/route";

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
    for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeTinyPng(): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(2, 0);
  ihdrData.writeUInt32BE(2, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 2;
  const raw = Buffer.alloc(14);
  const idatData = zlib.deflateSync(raw);
  const chunk = (t: string, d: Buffer) => {
    const l = Buffer.alloc(4);
    l.writeUInt32BE(d.length, 0);
    const body = Buffer.concat([Buffer.from(t, "ascii"), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([l, body, c]);
  };
  return Buffer.concat([sig, chunk("IHDR", ihdrData), chunk("IDAT", idatData), chunk("IEND", Buffer.alloc(0))]);
}

const stamp = Date.now();
const prefix = `p19-${stamp}`;
const emails: string[] = [];

let adminId = "";
let teacherId = "";
let student1Id = "";
let classId = "";

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
  teacherId = await makeUser("t1", "TEACHER");
  student1Id = await makeUser("s1", "STUDENT");

  const cls = await createClass(teacherId, { name: `${prefix} Class` });
  classId = cls.id;
  await prisma.enrollment.create({
    data: { classId, studentId: student1Id, status: "ACTIVE" },
  });
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [teacherId] } } });
  await prisma.notification.deleteMany({ where: { userId: { in: [teacherId, student1Id] } } });
  await prisma.class.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.worksheet.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
});

describe("Phase 19 Integration: Zero Key Leak, File Magic Bytes & Transfer Round-Trip", () => {
  it("never leaks wordsearch hints or referenceCode, validates DRAW/VOICE uploads, strips spoofed keys & round-trips zip/pdf", async () => {
    const ws = await createWorksheet(teacherId, {
      title: `${prefix} Interactive Sheet`,
      subject: "GENERAL",
    });

    const fields = await saveWorksheetFields(ws.id, [
      {
        placement: "ANSWER_SHEET",
        type: "WORDSEARCH",
        label: "1",
        order: 0,
        points: 2,
        options: { rows: 7, cols: 7, seed: 99, showWordList: false, wordHints: ["SECRET"] },
        answerKey: { words: ["SECRET", "CODE"] },
      },
      {
        placement: "ANSWER_SHEET",
        type: "DRAW",
        label: "2",
        order: 1,
        points: 2,
        options: { width: 400, height: 200 },
        answerKey: { note: "Draw a circle" },
      },
      {
        placement: "ANSWER_SHEET",
        type: "VOICE_ANSWER",
        label: "3",
        order: 2,
        points: 2,
        options: { maxDurationSec: 60 },
        answerKey: { note: "Speak clearly" },
      },
      {
        placement: "ANSWER_SHEET",
        type: "CODE",
        label: "4",
        order: 3,
        points: 2,
        options: { language: "javascript", starterCode: "console.log(1);" },
        answerKey: { referenceCode: "console.log(42);", expectedOutput: "42" },
      },
    ]);

    const wsFieldId = fields[0]!.id;
    const drawFieldId = fields[1]!.id;
    const voiceFieldId = fields[2]!.id;

    const [asg] = await createAssignmentsForClasses(teacherId, false, {
      worksheetId: ws.id,
      classIds: [classId],
      title: `${prefix} Exam`,
      maxAttempts: 2,
      shuffle: false,
      showResult: "AFTER_SUBMIT",
      showAnswerKey: false,
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
    });

    // 1. Start submission -> inspect student payload for zero leaks
    const started = await startOrResumeSubmission(asg!.id, student1Id, { rulesAccepted: false });
    const subId = started.submission.id;

    const payload = await getStudentAssignmentPayload(asg!.id, student1Id);
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("SECRET");
    expect(serialized).not.toContain("console.log(42)");
    expect(serialized).not.toContain('"answerKey"');

    const studentWs = payload.assignment.worksheet.fields.find((f) => f.id === wsFieldId)!;
    const wsOpts = studentWs.options as {
      grid?: string[][];
      wordHints?: string[];
      showWordList?: boolean;
      wordCount?: number;
    };
    expect(Array.isArray(wsOpts.grid)).toBe(true);
    expect(wsOpts.grid).toHaveLength(7);
    expect(wsOpts.showWordList).toBe(false);
    expect(wsOpts.wordHints).toBeUndefined();
    expect(wsOpts.wordCount).toBe(2);

    // 2. Spoofed cross-submission DRAW fileKey MUST be stripped to null by sanitizeAnswerValueForSubmission
    await autosaveSubmissionAnswers(subId, student1Id, {
      attemptVersion: started.submission.attemptVersion,
      answers: [
        { fieldId: drawFieldId, value: { fileKey: "submissions/other-sub/field/stolen.png" } },
      ],
    });
    const afterSpoof = await prisma.answer.findUnique({
      where: { submissionId_fieldId: { submissionId: subId, fieldId: drawFieldId } },
    });
    expect(afterSpoof?.value === "" || afterSpoof?.value === null).toBe(true);
    expect(JSON.stringify(afterSpoof?.value)).not.toContain("stolen.png");

    // 3. Upload endpoint validates magic bytes per field type
    mockAuth.mockResolvedValue({ user: { id: student1Id, role: "STUDENT", email: emails[1] } });

    const fakePngForDraw = new FormData();
    fakePngForDraw.append("fieldId", drawFieldId);
    fakePngForDraw.append("file", new Blob([Buffer.from("not-a-png")], { type: "image/png" }), "bad.png");
    const badDrawRes = await uploadSubmissionFile(
      new Request(`http://localhost/api/submissions/${subId}/files`, { method: "POST", body: fakePngForDraw }),
      { params: Promise.resolve({ id: subId }) }
    );
    expect(badDrawRes.status).toBe(400);

    const realPngForDraw = new FormData();
    realPngForDraw.append("fieldId", drawFieldId);
    realPngForDraw.append("file", new Blob([new Uint8Array(makeTinyPng())], { type: "image/png" }), "draw.png");
    const okDrawRes = await uploadSubmissionFile(
      new Request(`http://localhost/api/submissions/${subId}/files`, { method: "POST", body: realPngForDraw }),
      { params: Promise.resolve({ id: subId }) }
    );
    expect(okDrawRes.status).toBe(201);
    const okDrawJson = (await okDrawRes.json()) as { file: { key: string; mimeType: string } };
    expect(okDrawJson.file.key.startsWith(`submissions/${subId}/${drawFieldId}/`)).toBe(true);

    // Reject PNG uploaded into VOICE_ANSWER field, accept OggS audio header
    const pngInVoice = new FormData();
    pngInVoice.append("fieldId", voiceFieldId);
    pngInVoice.append("file", new Blob([new Uint8Array(makeTinyPng())], { type: "audio/ogg" }), "fake.ogg");
    const badVoiceRes = await uploadSubmissionFile(
      new Request(`http://localhost/api/submissions/${subId}/files`, { method: "POST", body: pngInVoice }),
      { params: Promise.resolve({ id: subId }) }
    );
    expect(badVoiceRes.status).toBe(400);

    const realOgg = Buffer.concat([Buffer.from("OggS", "ascii"), Buffer.alloc(32)]);
    const oggInVoice = new FormData();
    oggInVoice.append("fieldId", voiceFieldId);
    oggInVoice.append("file", new Blob([new Uint8Array(realOgg)], { type: "audio/ogg" }), "voice.ogg");
    const okVoiceRes = await uploadSubmissionFile(
      new Request(`http://localhost/api/submissions/${subId}/files`, { method: "POST", body: oggInVoice }),
      { params: Promise.resolve({ id: subId }) }
    );
    expect(okVoiceRes.status).toBe(201);

    await finalizeSubmissionInternal(subId);

    // 4. Transfer round-trip (.engclass.zip + PDF export)
    const exportedZip = await exportWorksheetAsZip(ws.id);
    const reimported = await importWorksheetFile(
      teacherId,
      exportedZip.buffer,
      exportedZip.filename,
      { subject: "GENERAL" }
    );
    const clonedWs = await prisma.worksheet.findUniqueOrThrow({
      where: { id: reimported.worksheets[0]!.id },
      include: { fields: { orderBy: { order: "asc" } } },
    });
    expect(clonedWs.fields).toHaveLength(4);
    expect(clonedWs.fields[0]!.type).toBe("WORDSEARCH");
    expect((clonedWs.fields[0]!.answerKey as { words: string[] }).words).toEqual(["SECRET", "CODE"]);
    expect(clonedWs.fields[3]!.type).toBe("CODE");

    // Prefix cleanup expects title match -> update temp imported title so afterAll cleans it
    await prisma.worksheet.update({
      where: { id: clonedWs.id },
      data: { title: `${prefix} Imported Sheet` },
    });

    const exportedPdf = await exportWorksheetAsPdf(ws.id, "key");
    expect(exportedPdf.buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
