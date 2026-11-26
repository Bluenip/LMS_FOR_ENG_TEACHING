import "dotenv/config";
import zlib from "zlib";
import bcrypt from "bcryptjs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "../src/lib/db";
import { getStorageProvider } from "../src/lib/storage";
import { parsePdfMetadata } from "../src/lib/pdf/server-pdf";

async function generateMixedOrientationWorksheetPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  // Page 1: Portrait A4 (595 x 842 pt)
  const p1 = doc.addPage([595, 842]);
  p1.drawRectangle({ x: 36, y: 760, width: 523, height: 52, color: rgb(0.93, 0.95, 1) });
  p1.drawText("PIVORA - ENGLISH 12 PRACTICE WORKSHEET", {
    x: 52,
    y: 790,
    size: 14,
    font: fontBold,
    color: rgb(0.21, 0.15, 0.8),
  });
  p1.drawText("Unit 7: The World of Work - Combined Overlay & Answer Sheet", {
    x: 52,
    y: 772,
    size: 10,
    font: fontRegular,
    color: rgb(0.28, 0.28, 0.35),
  });

  p1.drawText("PART I: FILL IN THE BLANKS & INTERACTIVE OVERLAY (Questions 1 - 4)", {
    x: 44,
    y: 720,
    size: 11,
    font: fontBold,
    color: rgb(0.05, 0.11, 0.19),
  });

  p1.drawText("1. She _________________________ in Hanoi since 2018. (live)", {
    x: 44,
    y: 675,
    size: 11,
    font: fontRegular,
    color: rgb(0.1, 0.1, 0.15),
  });

  p1.drawText("2. Choose the best connector: He worked hard, ______________ he got promoted.", {
    x: 44,
    y: 615,
    size: 11,
    font: fontRegular,
    color: rgb(0.1, 0.1, 0.15),
  });

  p1.drawText("3. Tick the box if this sentence is grammatically correct: [      ] 'She don't like coffee.'", {
    x: 44,
    y: 555,
    size: 11,
    font: fontRegular,
    color: rgb(0.1, 0.1, 0.15),
  });

  p1.drawText("4. Write 1-2 sentences explaining why teamwork matters at work:", {
    x: 44,
    y: 495,
    size: 11,
    font: fontRegular,
    color: rgb(0.1, 0.1, 0.15),
  });
  p1.drawRectangle({
    x: 44,
    y: 385,
    width: 505,
    height: 95,
    borderColor: rgb(0.75, 0.78, 0.85),
    borderWidth: 1,
  });

  p1.drawText("PART II: MULTIPLE CHOICE (Answer on the Answer Sheet on the right)", {
    x: 44,
    y: 335,
    size: 11,
    font: fontBold,
    color: rgb(0.05, 0.11, 0.19),
  });
  p1.drawText("5. After graduating with honors, he decided ______ for an internship.", {
    x: 44,
    y: 305,
    size: 10.5,
    font: fontRegular,
  });
  p1.drawText("A. apply     B. to apply     C. applied     D. applying", {
    x: 60,
    y: 285,
    size: 10,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.35),
  });
  p1.drawText("6. Good communication is an essential ______ skill for every candidate.", {
    x: 44,
    y: 250,
    size: 10.5,
    font: fontRegular,
  });
  p1.drawText("A. soft     B. hard     C. heavy     D. strict", {
    x: 60,
    y: 230,
    size: 10,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.35),
  });
  p1.drawText("7. If I had known about the vacancy, I ______ you immediately.", {
    x: 44,
    y: 195,
    size: 10.5,
    font: fontRegular,
  });
  p1.drawText("A. will tell     B. would tell     C. would have told     D. told", {
    x: 60,
    y: 175,
    size: 10,
    font: fontRegular,
    color: rgb(0.25, 0.25, 0.35),
  });
  p1.drawText("8. True or False: 'CV' stands for Curriculum Vitae.", {
    x: 44,
    y: 140,
    size: 10.5,
    font: fontRegular,
  });

  // Page 2: Landscape A4 (842 x 595 pt) to verify mixed orientation alignment!
  const p2 = doc.addPage([842, 595]);
  p2.drawRectangle({ x: 36, y: 520, width: 770, height: 42, color: rgb(0.93, 0.98, 0.95) });
  p2.drawText("PAGE 2 (LANDSCAPE) - READING PASSAGE & NUMBER QUESTION", {
    x: 52,
    y: 536,
    size: 13,
    font: fontBold,
    color: rgb(0, 0.33, 0.22),
  });
  p2.drawText(
    "Remote work has transformed how international teams collaborate across time zones.",
    { x: 52, y: 475, size: 11, font: fontRegular }
  );
  p2.drawText(
    "According to a 2025 survey of 400 companies, 75 percent offer hybrid schedules.",
    { x: 52, y: 452, size: 11, font: fontRegular }
  );
  p2.drawText(
    "9. According to the passage, what percentage of surveyed companies offer hybrid schedules?  [               ] %",
    { x: 52, y: 395, size: 11.5, font: fontBold, color: rgb(0.1, 0.1, 0.2) }
  );

  return Buffer.from(await doc.save());
}

async function generateSimpleWorksheetPdf(title: string, subtitle: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);

  page.drawRectangle({ x: 36, y: 760, width: 523, height: 52, color: rgb(0.95, 0.96, 1) });
  page.drawText(title, { x: 52, y: 790, size: 14, font: fontBold, color: rgb(0.21, 0.15, 0.8) });
  page.drawText(subtitle, { x: 52, y: 772, size: 10, font: fontRegular, color: rgb(0.3, 0.3, 0.4) });

  const qs = [
    "1. Many endangered species are threatened by habitat ______. (A. loss  B. gain  C. build  D. rise)",
    "2. Wildlife conservation helps protect ______. (A. pollution  B. biodiversity  C. traffic  D. noise)",
    "3. Deforestation leads to soil ______. (A. erosion  B. growth  C. painting  D. mining)",
    "4. We should reduce single-use ______. (A. trees  B. oxygen  C. plastics  D. rivers)",
    "5. True or False: Sea turtles are classified as endangered species.",
    "6. Short answer: Write the negative contraction of 'do not'.",
  ];
  qs.forEach((q, idx) => {
    page.drawText(q, { x: 48, y: 700 - idx * 55, size: 10.5, font: fontRegular });
  });

  return Buffer.from(await doc.save());
}

/** Generates a tiny playable 16-bit mono PCM WAV tone for the Dictation Demo seed. */
function generateSampleWavBuffer(durationSec = 2, freqHz = 440): Buffer {
  const sampleRate = 8000;
  const numSamples = sampleRate * durationSec;
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.round(Math.sin((2 * Math.PI * freqHz * i) / sampleRate) * 6000);
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  return buf;
}

function pngCrc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

function generateSolidPngBuffer(
  width: number,
  height: number,
  rgbColor: [number, number, number]
): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB color type
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rowStride = 1 + width * 3;
  const raw = Buffer.alloc(rowStride * height);
  for (let y = 0; y < height; y++) {
    const rowOff = y * rowStride;
    raw[rowOff] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const px = rowOff + 1 + x * 3;
      raw[px] = rgbColor[0];
      raw[px + 1] = rgbColor[1];
      raw[px + 2] = rgbColor[2];
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    makePngChunk("IHDR", ihdr),
    makePngChunk("IDAT", idat),
    makePngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  console.log("Seeding Pivora database...");
  const passwordHash = await bcrypt.hash("password123", 10);

  // Clean existing data in dependency order for idempotent re-seeding
  await prisma.oneTimeExport.deleteMany();
  await prisma.errorLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.assignmentReminderSent.deleteMany();
  await prisma.assignmentOverride.deleteMany();
  await prisma.assignmentTarget.deleteMany();
  await prisma.teacherCommentPreset.deleteMany();
  await prisma.audioPlay.deleteMany();
  await prisma.proctorEvent.deleteMany();
  await prisma.answer.deleteMany();
  await prisma.submission.deleteMany();
  await prisma.assignment.deleteMany();
  await prisma.field.deleteMany();
  await prisma.worksheetAudio.deleteMany();
  await prisma.worksheetPage.deleteMany();
  await prisma.worksheet.deleteMany();
  await prisma.lessonItem.deleteMany();
  await prisma.classLesson.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.class.deleteMany();
  await prisma.parentInviteCode.deleteMany();
  await prisma.parentLink.deleteMany();
  await prisma.user.deleteMany();

  // 1 Admin
  const admin = await prisma.user.create({
    data: {
      email: "admin@engclass.vn",
      name: "Quản trị viên Hệ thống",
      role: "ADMIN",
      passwordHash,
    },
  });

  // 2 Teachers
  const teacher1 = await prisma.user.create({
    data: {
      email: "teacher1@engclass.vn",
      name: "Cô Mai Phương",
      role: "TEACHER",
      passwordHash,
    },
  });
  const teacher2 = await prisma.user.create({
    data: {
      email: "teacher2@engclass.vn",
      name: "Thầy Minh Đức",
      role: "TEACHER",
      passwordHash,
    },
  });

  // 10 Students
  const studentNames = [
    "Nguyễn Văn Minh",
    "Trần Thị Mai",
    "Lê Hoàng Long",
    "Phạm Minh Anh",
    "Vũ Thu Hà",
    "Đỗ Đức Trí",
    "Nguyễn Phương Linh",
    "Bùi Tuấn Kiệt",
    "Hoàng Bảo Ngọc",
    "Đặng Quốc Huy",
  ];

  const students = [];
  for (let i = 0; i < studentNames.length; i++) {
    const s = await prisma.user.create({
      data: {
        email: `student${i + 1}@engclass.vn`,
        name: studentNames[i]!,
        role: "STUDENT",
        passwordHash,
      },
    });
    students.push(s);
  }

  // 2 Parents
  const parent1 = await prisma.user.create({
    data: {
      email: "parent1@engclass.vn",
      name: "Nguyễn Văn Hùng",
      role: "PARENT",
      passwordHash,
    },
  });
  const parent2 = await prisma.user.create({
    data: {
      email: "parent2@engclass.vn",
      name: "Lê Thị Lan",
      role: "PARENT",
      passwordHash,
    },
  });

  // Link parent1 -> student1 (Nguyễn Văn Minh) & student2 (Trần Thị Mai)
  // Link parent2 -> student3 (Lê Hoàng Long)
  await prisma.parentLink.createMany({
    data: [
      { parentId: parent1.id, studentId: students[0]!.id, relation: "Bố", verifiedAt: new Date() },
      { parentId: parent1.id, studentId: students[1]!.id, relation: "Phụ huynh", verifiedAt: new Date() },
      { parentId: parent2.id, studentId: students[2]!.id, relation: "Mẹ", verifiedAt: new Date() },
    ],
  });

  // Create an unused ParentInviteCode for student4 so invite redemption can be tested live
  await prisma.parentInviteCode.create({
    data: {
      studentId: students[3]!.id,
      code: "PR4INV88",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  // 2 Classes
  const class1 = await prisma.class.create({
    data: {
      name: "English 12 - Ôn thi THPT Quốc Gia (12A1)",
      description: "Lớp luyện thi THPT Quốc Gia môn Tiếng Anh — Ngữ pháp, Từ vựng, Đọc hiểu & Viết.",
      joinCode: "ENG12A",
      teacherId: teacher1.id,
      requireApproval: false,
    },
  });

  const class2 = await prisma.class.create({
    data: {
      name: "IELTS Intensive 6.5+ (K24)",
      description: "Luyện chuyên sâu 4 kỹ năng IELTS mục tiêu 6.5+.",
      joinCode: "IELT65",
      teacherId: teacher2.id,
      requireApproval: true,
    },
  });

  // Enroll students 1..6 into Class 1, students 7..10 into Class 2
  for (let i = 0; i < 6; i++) {
    await prisma.enrollment.create({
      data: { classId: class1.id, studentId: students[i]!.id, status: "ACTIVE" },
    });
  }
  for (let i = 6; i < 10; i++) {
    await prisma.enrollment.create({
      data: { classId: class2.id, studentId: students[i]!.id, status: "ACTIVE" },
    });
  }

  // Feed Posts & Comments
  const post1 = await prisma.post.create({
    data: {
      classId: class1.id,
      authorId: teacher1.id,
      content:
        "Chào cả lớp 12A1! Tuần này chúng ta hoàn thành phiếu bài tập Unit 7: The World of Work. Các em chú ý điền trực tiếp vào các ô trên PDF và kiểm tra kỹ phần phiếu trả lời bên phải trước khi nộp nhé!",
    },
  });
  await prisma.comment.create({
    data: {
      postId: post1.id,
      authorId: students[0]!.id,
      content: "Dạ vâng thưa cô, em đã nhận được bài ạ!",
    },
  });

  await prisma.post.create({
    data: {
      classId: class2.id,
      authorId: teacher2.id,
      content:
        "Welcome to IELTS Intensive K24! Tài liệu Listening & Reading tuần 1 đã có trong mục Bài giảng.",
    },
  });

  // Generate real PDFs and store via StorageProvider
  const storage = getStorageProvider();

  const unit7Pdf = await generateMixedOrientationWorksheetPdf();
  const unit7Meta = await parsePdfMetadata(unit7Pdf);
  const unit7Key = "worksheets/seed/unit7-world-of-work.pdf";
  await storage.put(unit7Key, unit7Pdf, "application/pdf");

  const unit6Pdf = await generateSimpleWorksheetPdf(
    "UNIT 6: ENDANGERED SPECIES - VOCABULARY",
    "Answer Sheet Mode (Mode B) - English 12"
  );
  const unit6Meta = await parsePdfMetadata(unit6Pdf);
  const unit6Key = "worksheets/seed/unit6-endangered-species.pdf";
  await storage.put(unit6Key, unit6Pdf, "application/pdf");

  const lessonPdf = await generateSimpleWorksheetPdf(
    "GRAMMAR HANDOUT: PRESENT PERFECT & CONDITIONALS",
    "Class 12A1 Study Material"
  );
  const lessonPdfKey = "lessons/seed/grammar-handout.pdf";
  await storage.put(lessonPdfKey, lessonPdf, "application/pdf");

  // Lessons for Class 1
  // Lesson library (Phase 14): owned by the teacher, shown in class 12A1 through ClassLesson
  await prisma.lesson.create({
    data: {
      classId: class1.id,
      ownerId: class1.teacherId,
      classLinks: { create: { classId: class1.id, order: 0 } },
      title: "Chương 1: Thì hiện tại hoàn thành & Câu điều kiện",
      description: "Tài liệu tổng ôn ngữ pháp trọng tâm học kỳ II.",
      order: 0,
      items: {
        create: [
          {
            title: "Tài liệu tóm tắt ngữ pháp (PDF)",
            type: "PDF",
            fileKey: lessonPdfKey,
            order: 0,
          },
          {
            title: "Video bài giảng: Conditional Sentences Type 1, 2, 3",
            type: "VIDEO",
            url: "https://www.youtube.com/watch?v=9ifCM8kJFKI",
            order: 1,
          },
          {
            title: "Từ điển Cambridge Online (Tra cứu từ vựng)",
            type: "LINK",
            url: "https://dictionary.cambridge.org/",
            order: 2,
          },
        ],
      },
    },
  });

  // A lesson kept in the library but not given to any class yet
  await prisma.lesson.create({
    data: {
      ownerId: class1.teacherId,
      title: "Chương 2: Câu bị động (Passive Voice)",
      description: "Lý thuyết + video luyện tập, chưa giao lớp nào.",
      items: {
        create: [
          {
            title: "Video: Passive Voice in 10 minutes",
            type: "VIDEO",
            url: "https://www.youtube.com/watch?v=4VDzv0Hkq1k",
            order: 0,
          },
        ],
      },
    },
  });

  // Worksheet 1: Mode A + B Combined (Mixed portrait + landscape PDF)
  const wsUnit7 = await prisma.worksheet.create({
    data: {
      ownerId: teacher1.id,
      title: "Unit 7: The World of Work - Đề số 1",
      instructions:
        "Điền trực tiếp vào các ô tương tác trên trang PDF (câu 1-4 và câu 9) và chọn đáp án trên Phiếu trả lời bên phải (câu 5-8).",
      pdfFileKey: unit7Key,
      pageCount: unit7Meta.pageCount,
      pages: {
        create: unit7Meta.pages.map((p) => ({
          pageIndex: p.pageIndex,
          widthPt: p.widthPt,
          heightPt: p.heightPt,
        })),
      },
      fields: {
        create: [
          {
            placement: "OVERLAY",
            type: "TEXT",
            label: "1",
            skillTag: "GRAMMAR",
            order: 0,
            points: 1,
            pageIndex: 0,
            x: 0.1314,
            y: 0.1787,
            w: 0.257,
            h: 0.03,
            style: { fontSize: 13, align: "center" },
            answerKey: { accepted: ["has lived", "'s lived"] },
            gradingOpts: { caseSensitive: false, ignoreExtraSpaces: true },
            explanation: "Dấu hiệu 'since 2018' dùng thì Hiện tại hoàn thành: has lived.",
          },
          {
            placement: "OVERLAY",
            type: "DROPDOWN",
            label: "2",
            skillTag: "GRAMMAR",
            order: 1,
            points: 1,
            pageIndex: 0,
            x: 0.4647,
            y: 0.25,
            w: 0.1439,
            h: 0.03,
            style: { fontSize: 13, align: "left" },
            options: [
              { id: "so", text: "so" },
              { id: "but", text: "but" },
              { id: "although", text: "although" },
            ],
            answerKey: { correct: "so" },
            explanation: "Chỉ kết quả (làm việc chăm chỉ -> nên được thăng chức) dùng 'so'.",
          },
          {
            placement: "OVERLAY",
            type: "CHECKBOX",
            label: "3",
            skillTag: "GRAMMAR",
            order: 2,
            points: 1,
            pageIndex: 0,
            x: 0.5279,
            y: 0.3266,
            w: 0.0411,
            h: 0.019,
            answerKey: { checked: false },
            explanation: "Câu sai ngữ pháp (phải là 'She doesn't like coffee'), nên không tick.",
          },
          {
            placement: "OVERLAY",
            type: "ESSAY",
            label: "4",
            skillTag: "WRITING",
            order: 3,
            points: 2,
            pageIndex: 0,
            x: 0.08,
            y: 0.435,
            w: 0.84,
            h: 0.105,
            style: { fontSize: 13, align: "left" },
            answerKey: { rubric: "Viết 1-2 câu rõ ý, đúng ngữ pháp giải thích tầm quan trọng của teamwork." },
            rubric: [
              { id: "crit_content", title: "Ý tưởng & nội dung rõ ràng", maxPoints: 1.0 },
              { id: "crit_grammar", title: "Đúng ngữ pháp & chính tả", maxPoints: 0.5 },
              { id: "crit_vocab", title: "Từ vựng phù hợp ngữ cảnh", maxPoints: 0.5 },
            ],
          },
          {
            placement: "OVERLAY",
            type: "NUMBER",
            label: "9",
            skillTag: "READING",
            order: 4,
            points: 1,
            pageIndex: 1,
            x: 0.6789,
            y: 0.3084,
            w: 0.066,
            h: 0.042,
            style: { fontSize: 14, align: "center" },
            answerKey: { value: 75, tolerance: 0 },
            explanation: "Đoạn văn nêu rõ '75 percent offer hybrid schedules'.",
          },
          {
            placement: "ANSWER_SHEET",
            type: "MULTIPLE_CHOICE",
            label: "5",
            prompt: "After graduating with honors, he decided ______ for an internship.",
            skillTag: "GRAMMAR",
            order: 5,
            points: 1,
            options: [
              { id: "A", text: "apply" },
              { id: "B", text: "to apply" },
              { id: "C", text: "applied" },
              { id: "D", text: "applying" },
            ],
            answerKey: { correct: "B" },
            explanation: "Cấu trúc decide + to-V.",
          },
          {
            placement: "ANSWER_SHEET",
            type: "MULTIPLE_CHOICE",
            label: "6",
            prompt: "Good communication is an essential ______ skill for every candidate.",
            skillTag: "VOCABULARY",
            order: 6,
            points: 1,
            options: [
              { id: "A", text: "soft" },
              { id: "B", text: "hard" },
              { id: "C", text: "heavy" },
              { id: "D", text: "strict" },
            ],
            answerKey: { correct: "A" },
            explanation: "Cụm từ 'soft skill' (kỹ năng mềm).",
          },
          {
            placement: "ANSWER_SHEET",
            type: "MULTIPLE_CHOICE",
            label: "7",
            prompt: "If I had known about the vacancy, I ______ you immediately.",
            skillTag: "GRAMMAR",
            order: 7,
            points: 1,
            options: [
              { id: "A", text: "will tell" },
              { id: "B", text: "would tell" },
              { id: "C", text: "would have told" },
              { id: "D", text: "told" },
            ],
            answerKey: { correct: "C" },
            explanation: "Câu điều kiện loại 3: If + S + had V3, S + would have V3.",
          },
          {
            placement: "ANSWER_SHEET",
            type: "TRUE_FALSE",
            label: "8",
            prompt: "'CV' stands for Curriculum Vitae.",
            skillTag: "VOCABULARY",
            order: 8,
            points: 1,
            answerKey: { correct: true },
            explanation: "Đúng — CV là viết tắt của Curriculum Vitae.",
          },
        ],
      },
    },
    include: { fields: { orderBy: { order: "asc" } } },
  });

  // Worksheet 2: Mode B (Answer Sheet Only)
  const wsUnit6 = await prisma.worksheet.create({
    data: {
      ownerId: teacher1.id,
      title: "Unit 6: Endangered Species - Vocabulary",
      instructions: "Xem đề PDF bên trái và chọn đáp án đúng vào phiếu trả lời bên phải.",
      pdfFileKey: unit6Key,
      pageCount: unit6Meta.pageCount,
      pages: {
        create: unit6Meta.pages.map((p) => ({
          pageIndex: p.pageIndex,
          widthPt: p.widthPt,
          heightPt: p.heightPt,
        })),
      },
      fields: {
        create: [
          {
            placement: "ANSWER_SHEET",
            type: "MULTIPLE_CHOICE",
            label: "1",
            skillTag: "VOCABULARY",
            order: 0,
            points: 2,
            options: [
              { id: "A", text: "loss" },
              { id: "B", text: "gain" },
              { id: "C", text: "build" },
              { id: "D", text: "rise" },
            ],
            answerKey: { correct: "A" },
          },
          {
            placement: "ANSWER_SHEET",
            type: "MULTIPLE_CHOICE",
            label: "2",
            skillTag: "VOCABULARY",
            order: 1,
            points: 2,
            options: [
              { id: "A", text: "pollution" },
              { id: "B", text: "biodiversity" },
              { id: "C", text: "traffic" },
              { id: "D", text: "noise" },
            ],
            answerKey: { correct: "B" },
          },
          {
            placement: "ANSWER_SHEET",
            type: "MULTIPLE_CHOICE",
            label: "3",
            skillTag: "READING",
            order: 2,
            points: 2,
            options: [
              { id: "A", text: "erosion" },
              { id: "B", text: "growth" },
              { id: "C", text: "painting" },
              { id: "D", text: "mining" },
            ],
            answerKey: { correct: "A" },
          },
          {
            placement: "ANSWER_SHEET",
            type: "MULTIPLE_CHOICE",
            label: "4",
            skillTag: "LISTENING",
            order: 3,
            points: 1,
            options: [
              { id: "A", text: "trees" },
              { id: "B", text: "oxygen" },
              { id: "C", text: "plastics" },
              { id: "D", text: "rivers" },
            ],
            answerKey: { correct: "C" },
          },
          {
            placement: "ANSWER_SHEET",
            type: "TRUE_FALSE",
            label: "5",
            skillTag: "READING",
            order: 4,
            points: 1,
            answerKey: { correct: true },
          },
          {
            placement: "ANSWER_SHEET",
            type: "TEXT",
            label: "6",
            skillTag: "GRAMMAR",
            order: 5,
            points: 2,
            answerKey: { accepted: ["don't", "do not"] },
            gradingOpts: { caseSensitive: false, ignoreExtraSpaces: true },
          },
        ],
      },
    },
    include: { fields: { orderBy: { order: "asc" } } },
  });

  // Assignment 1 (Past Due, Graded -> populates Leaderboard, Reports, Parent Portal)
  const pastDue = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const asgUnit6 = await prisma.assignment.create({
    data: {
      classId: class1.id,
      worksheetId: wsUnit6.id,
      title: "Unit 6: Endangered Species - Vocabulary",
      openAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      dueAt: pastDue,
      timeLimitMin: 30,
      maxAttempts: 1,
      showResult: "AFTER_SUBMIT",
      showAnswerKey: true,
      showLeaderboard: "AFTER_DUE",
      leaderboardAnon: false,
      proctorMode: "OFF",
    },
  });

  // Seed 6 graded submissions for Unit 6 with realistic scores & ties
  const unit6SeedRuns = [
    { studentIdx: 2, answers: ["A", "B", "A", "C", true, "don't"], mins: 12, comment: "Xuất sắc! Hoàn thành bài nhanh và chính xác tuyệt đối." }, // 10/10
    { studentIdx: 1, answers: ["A", "B", "A", "C", true, "don't"], mins: 16, comment: "Rất tốt, nắm chắc từ vựng Unit 6." }, // 10/10 slower -> rank 2
    { studentIdx: 0, answers: ["A", "B", "A", "A", true, "don't"], mins: 18, comment: "Minh có tiến bộ rõ rệt phần Ngữ pháp và Đọc hiểu. Phụ huynh nhắc con ôn thêm phần Listening nhé!" }, // 9/10
    { studentIdx: 3, answers: ["A", "B", "B", "C", true, "don't"], mins: 20, comment: "Làm bài cẩn thận, chú ý từ 'erosion'." }, // 8/10
    { studentIdx: 4, answers: ["A", "B", "B", "C", true, "do not"], mins: 22, comment: "Khá tốt, cần cải thiện tốc độ." }, // 8/10
    { studentIdx: 5, answers: ["A", "A", "B", "C", false, "dont"], mins: 25, comment: "Cần ôn lại từ vựng trọng tâm Unit 6." }, // 3/10
  ];

  for (const run of unit6SeedRuns) {
    const started = new Date(pastDue.getTime() - (run.mins + 60) * 60_000);
    const submitted = new Date(started.getTime() + run.mins * 60_000);
    let total = 0;
    const answerCreates = wsUnit6.fields.map((f, idx) => {
      const val = run.answers[idx]!;
      let correct = false;
      if (f.type === "MULTIPLE_CHOICE") correct = val === (f.answerKey as { correct: string }).correct;
      if (f.type === "TRUE_FALSE") correct = val === (f.answerKey as { correct: boolean }).correct;
      if (f.type === "TEXT") {
        correct = (f.answerKey as { accepted: string[] }).accepted.includes(String(val).toLowerCase());
      }
      const sc = correct ? f.points : 0;
      total += sc;
      return {
        fieldId: f.id,
        value: val,
        isCorrect: correct,
        score: sc,
      };
    });

    await prisma.submission.create({
      data: {
        assignmentId: asgUnit6.id,
        studentId: students[run.studentIdx]!.id,
        attemptNo: 1,
        status: "GRADED",
        startedAt: started,
        submittedAt: submitted,
        autoScore: total,
        manualScore: 0,
        totalScore: total,
        maxScore: 10,
        teacherComment: run.comment,
        answers: { create: answerCreates },
      },
    });
  }

  // Assignment 2: Active Mode A+B Assignment (Unit 7)
  const nextWeek = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const asgUnit7 = await prisma.assignment.create({
    data: {
      classId: class1.id,
      worksheetId: wsUnit7.id,
      title: "Unit 7: The World of Work - Đề số 1",
      openAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      dueAt: nextWeek,
      timeLimitMin: 45,
      maxAttempts: 2,
      showResult: "AFTER_SUBMIT",
      showAnswerKey: true,
      showLeaderboard: "AFTER_SUBMIT",
      leaderboardAnon: false,
      proctorMode: "OFF",
    },
  });

  // Seed 2 submissions on Unit 7 (student2 graded, student3 pending manual ESSAY grading)
  // Leave student1 unstarted so student1 can immediately do it in demo / E2E!
  await prisma.submission.create({
    data: {
      assignmentId: asgUnit7.id,
      studentId: students[1]!.id,
      attemptNo: 1,
      status: "GRADED",
      startedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      submittedAt: new Date(Date.now() - 2.6 * 60 * 60 * 1000),
      autoScore: 8,
      manualScore: 1.5,
      totalScore: 9.5,
      maxScore: 10,
      teacherComment: "Bài viết ngắn mạch lạc, ngữ pháp chính xác.",
      answers: {
        create: [
          { fieldId: wsUnit7.fields[0]!.id, value: "has lived", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[1]!.id, value: "so", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[2]!.id, value: false, isCorrect: true, score: 1 },
          {
            fieldId: wsUnit7.fields[3]!.id,
            value: "Teamwork helps colleagues share ideas and solve complex tasks faster.",
            isCorrect: true,
            score: 1.5,
            teacherNote: "Ý hay, dùng từ tốt!",
            rubricScores: { crit_content: 0.8, crit_grammar: 0.4, crit_vocab: 0.3 },
          },
          { fieldId: wsUnit7.fields[4]!.id, value: "75", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[5]!.id, value: "B", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[6]!.id, value: "A", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[7]!.id, value: "C", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[8]!.id, value: true, isCorrect: true, score: 1 },
        ],
      },
    },
  });

  await prisma.submission.create({
    data: {
      assignmentId: asgUnit7.id,
      studentId: students[2]!.id,
      attemptNo: 1,
      status: "SUBMITTED",
      startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      submittedAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000),
      autoScore: 7,
      manualScore: null,
      totalScore: 7,
      maxScore: 10,
      answers: {
        create: [
          { fieldId: wsUnit7.fields[0]!.id, value: "has lived", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[1]!.id, value: "so", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[2]!.id, value: true, isCorrect: false, score: 0 },
          {
            fieldId: wsUnit7.fields[3]!.id,
            value: "Working in a team creates synergy and improves productivity.",
            isCorrect: null,
            score: null,
          },
          { fieldId: wsUnit7.fields[4]!.id, value: "75", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[5]!.id, value: "B", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[6]!.id, value: "A", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[7]!.id, value: "C", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[8]!.id, value: true, isCorrect: true, score: 1 },
        ],
      },
    },
  });

  // Assignment 3: Proctored Exam (LOCKDOWN + LOCK at 1 violation)
  await prisma.assignment.create({
    data: {
      classId: class1.id,
      worksheetId: wsUnit6.id,
      title: "Kiểm tra định kỳ - Chế độ giám sát (Khoá khi rời tab)",
      openAt: new Date(Date.now() - 60 * 60 * 1000),
      dueAt: nextWeek,
      timeLimitMin: 30,
      maxAttempts: 1,
      shuffle: true,
      showResult: "AFTER_SUBMIT",
      showAnswerKey: false,
      showLeaderboard: "AFTER_DUE",
      leaderboardAnon: true,
      proctorMode: "LOCKDOWN",
      violationAction: "LOCK",
      maxViolations: 1,
      requireFullscreen: true,
      blockCopyPaste: true,
      shareProctorWithParent: true,
    },
  });

  // Phase 18 seed: Camera AI (HIGH sensitivity) + Mic monitor + student2 timeline events + snapshot
  const asgCameraMic = await prisma.assignment.create({
    data: {
      classId: class1.id,
      worksheetId: wsUnit7.id,
      title: "Đề kiểm tra Camera AI & Micro (Phase 18)",
      openAt: new Date(Date.now() - 60 * 60 * 1000),
      dueAt: nextWeek,
      timeLimitMin: 35,
      maxAttempts: 5,
      showResult: "AFTER_SUBMIT",
      showAnswerKey: false,
      showLeaderboard: "AFTER_DUE",
      proctorMode: "MONITOR",
      violationAction: "WARN",
      maxViolations: 3,
      requireCamera: true,
      cameraSnapshots: true,
      cameraEnforce: false,
      cameraSensitivity: "HIGH",
      cameraCountLookAway: false,
      requireMicMonitor: true,
    },
  });

  const subCameraMic = await prisma.submission.create({
    data: {
      assignmentId: asgCameraMic.id,
      studentId: students[1]!.id,
      attemptNo: 1,
      status: "SUBMITTED",
      startedAt: new Date(Date.now() - 40 * 60 * 1000),
      submittedAt: new Date(Date.now() - 12 * 60 * 1000),
      rulesAcceptedAt: new Date(Date.now() - 40 * 60 * 1000),
      cameraConsentAt: new Date(Date.now() - 40 * 60 * 1000),
      autoScore: 8,
      manualScore: null,
      totalScore: 8,
      maxScore: 10,
      violationCount: 1,
      flagged: true,
      answers: {
        create: [
          { fieldId: wsUnit7.fields[0]!.id, value: "has lived", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[1]!.id, value: "so", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[2]!.id, value: false, isCorrect: true, score: 1 },
          {
            fieldId: wsUnit7.fields[3]!.id,
            value: "Teamwork helps solve problems faster.",
            isCorrect: null,
            score: null,
          },
          { fieldId: wsUnit7.fields[4]!.id, value: "75", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[5]!.id, value: "B", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[6]!.id, value: "A", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[7]!.id, value: "C", isCorrect: true, score: 1 },
          { fieldId: wsUnit7.fields[8]!.id, value: true, isCorrect: true, score: 1 },
        ],
      },
    },
  });

  const seedSnapKey = `proctor/${subCameraMic.id}/seed-gaze.png`;
  const seedSnapBuf = generateSolidPngBuffer(320, 240, [63, 72, 204]);
  await storage.put(seedSnapKey, seedSnapBuf, "image/png");

  await prisma.proctorEvent.createMany({
    data: [
      {
        submissionId: subCameraMic.id,
        type: "CAMERA_GAZE_AWAY",
        at: new Date(Date.now() - 30 * 60 * 1000),
        durationMs: 3200,
        meta: { snapshotKey: seedSnapKey, gazeXOffset: 0.31 },
      },
      {
        submissionId: subCameraMic.id,
        type: "MIC_VOICE",
        at: new Date(Date.now() - 25 * 60 * 1000),
        durationMs: 2800,
        meta: { peakRms: 0.24 },
      },
      {
        submissionId: subCameraMic.id,
        type: "TAB_HIDDEN",
        at: new Date(Date.now() - 20 * 60 * 1000),
        durationMs: 4000,
        meta: { seeded: true },
      },
    ],
  });

  // Worksheet 3: Dictation & Listening Demo (with sample WAV audio + DICTATION fields)
  const wsDictation = await prisma.worksheet.create({
    data: {
      ownerId: teacher1.id,
      title: "Dictation Demo — Unit 8: Listening & Chép chính tả",
      instructions:
        "Nghe kỹ từng đoạn audio (giới hạn số lần nghe) và tự gõ lại chính xác nội dung. Dán văn bản và kiểm tra chính tả bị tắt.",
      isShared: true,
    },
  });

  const sampleWav = generateSampleWavBuffer(2, 440);
  const sampleAudioKey = `worksheets/${wsDictation.id}/audio/seed-dictation-part1.wav`;
  await storage.put(sampleAudioKey, sampleWav, "audio/wav");

  const audioTrack1 = await prisma.worksheetAudio.create({
    data: {
      worksheetId: wsDictation.id,
      title: "Part 1 — Daily Routine (Audio mẫu)",
      fileKey: sampleAudioKey,
      mimeType: "audio/wav",
      sizeBytes: sampleWav.length,
      durationSec: 2,
      order: 0,
    },
  });

  await prisma.field.createMany({
    data: [
      {
        worksheetId: wsDictation.id,
        placement: "ANSWER_SHEET",
        type: "DICTATION",
        label: "1",
        prompt: "Nghe Part 1 và chép lại chính xác câu tiếng Anh bạn nghe được:",
        skillTag: "LISTENING",
        audioId: audioTrack1.id,
        order: 0,
        points: 2,
        answerKey: {
          transcript: "Good morning everyone, today we will practice English listening skills.",
        },
        gradingOpts: {
          caseSensitive: false,
          ignorePunctuation: true,
          scoring: "WORD_ACCURACY",
        },
      },
      {
        worksheetId: wsDictation.id,
        placement: "ANSWER_SHEET",
        type: "DICTATION",
        label: "2",
        prompt: "Chép chính tả câu thứ hai:",
        skillTag: "LISTENING",
        audioId: audioTrack1.id,
        order: 1,
        points: 2,
        answerKey: {
          transcript: "Please listen carefully and type every single word without copying.",
        },
        gradingOpts: {
          caseSensitive: false,
          ignorePunctuation: true,
          scoring: "WORD_ACCURACY",
        },
      },
    ],
  });

  await prisma.assignment.create({
    data: {
      classId: class1.id,
      worksheetId: wsDictation.id,
      title: "Luyện Chép Chính Tả Tiếng Anh (Giới hạn 2 lượt nghe, không giới hạn lượt làm)",
      openAt: new Date(Date.now() - 60 * 60 * 1000),
      dueAt: nextWeek,
      timeLimitMin: 20,
      maxAttempts: null, // unlimited attempts!
      shuffle: false,
      showResult: "AFTER_SUBMIT",
      showAnswerKey: true,
      showLeaderboard: "AFTER_SUBMIT",
      proctorMode: "OFF",
      blockCopyPaste: true,
      audioMaxPlays: 2,
      audioBlockPause: false,
      audioBlockSeek: true,
    },
  });

  // Worksheet 4: Shared Memorization Focus Mode Demo (Unit 17 Survival Tips)
  const wsSurvival = await prisma.worksheet.create({
    data: {
      ownerId: teacher1.id,
      title: "Unit 17: Survival Tips — Học thuộc (Chế độ tập trung 1 câu/màn)",
      instructions: "Điền từ/cụm từ chính xác vào chỗ trống. Nhấn Enter để chuyển nhanh sang câu tiếp theo.",
      isShared: true,
      fields: {
        create: [
          {
            placement: "ANSWER_SHEET",
            type: "TEXT",
            label: "1",
            prompt: "What ________?",
            skillTag: "VOCABULARY",
            order: 0,
            points: 1,
            answerKey: { accepted: ["do you know about jungles"] },
            gradingOpts: { caseSensitive: false, ignorePunctuation: true, ignoreExtraSpaces: true },
          },
          {
            placement: "ANSWER_SHEET",
            type: "TEXT",
            label: "2",
            prompt: "Have you ________?",
            skillTag: "VOCABULARY",
            order: 1,
            points: 1,
            answerKey: { accepted: ["ever been in the jungle"] },
            gradingOpts: { caseSensitive: false, ignorePunctuation: true, ignoreExtraSpaces: true },
          },
          {
            placement: "ANSWER_SHEET",
            type: "TEXT",
            label: "3a",
            prompt: "(1) ____ [3a] ____. Climb ________.",
            skillTag: "VOCABULARY",
            order: 2,
            points: 0.5,
            answerKey: { accepted: ["Find a hill"] },
            gradingOpts: { caseSensitive: false, ignorePunctuation: true, ignoreExtraSpaces: true },
          },
          {
            placement: "ANSWER_SHEET",
            type: "TEXT",
            label: "3b",
            prompt: "(1) ________. Climb ____ [3b] ____.",
            skillTag: "VOCABULARY",
            order: 3,
            points: 0.5,
            answerKey: { accepted: ["a hill so that you can see over the top of the trees"] },
            gradingOpts: { caseSensitive: false, ignorePunctuation: true, ignoreExtraSpaces: true },
          },
        ],
      },
    },
  });

  await prisma.assignment.create({
    data: {
      classId: class1.id,
      worksheetId: wsSurvival.id,
      title: "Bài học thuộc Unit 17: Survival Tips (1 câu/màn hình)",
      openAt: new Date(Date.now() - 60 * 60 * 1000),
      dueAt: nextWeek,
      timeLimitMin: 15,
      maxAttempts: null,
      shuffle: false,
      showResult: "AFTER_SUBMIT",
      showAnswerKey: true,
      showLeaderboard: "AFTER_SUBMIT",
      proctorMode: "OFF",
      blockCopyPaste: true,
      oneQuestionPerPage: true,
    },
  });

  // Phase 17 seed: Math Fill-on-Image worksheet with KaTeX formula & field illustration PNG
  const wsMathImg = await prisma.worksheet.create({
    data: {
      ownerId: teacher1.id,
      title: "Toán 10 — Phương trình bậc hai (Fill on image & Minh hoạ)",
      subject: "MATH",
      instructions:
        "Điền nghiệm trực tiếp lên ảnh phiếu bài tập bên trái và chọn đáp án đúng cho câu hỏi đồ thị.",
      pdfFileKey: null,
      pageCount: 1,
      isShared: true,
    },
  });

  const mathBgPng = generateSolidPngBuffer(850, 600, [244, 247, 255]);
  const mathBgKey = `worksheets/${wsMathImg.id}/images/seed-math-bg-page-0.png`;
  await storage.put(mathBgKey, mathBgPng, "image/png");

  const mathDiagramPng = generateSolidPngBuffer(400, 240, [238, 242, 255]);
  const mathDiagramKey = `worksheets/${wsMathImg.id}/images/seed-math-q2-diagram.png`;
  await storage.put(mathDiagramKey, mathDiagramPng, "image/png");

  await prisma.worksheetPage.create({
    data: {
      worksheetId: wsMathImg.id,
      pageIndex: 0,
      widthPt: 595,
      heightPt: 420,
      imageKey: mathBgKey,
    },
  });

  await prisma.field.createMany({
    data: [
      {
        worksheetId: wsMathImg.id,
        placement: "OVERLAY",
        type: "TEXT",
        label: "1",
        order: 0,
        points: 1,
        pageIndex: 0,
        x: 0.25,
        y: 0.35,
        w: 0.25,
        h: 0.08,
        answerKey: { accepted: ["x = 2", "2"] },
        gradingOpts: { caseSensitive: false, ignoreExtraSpaces: true, ignorePunctuation: true },
        style: { fontSize: 13, align: "center", transparentBg: false },
      },
      {
        worksheetId: wsMathImg.id,
        placement: "ANSWER_SHEET",
        type: "MULTIPLE_CHOICE",
        label: "2",
        prompt: "Tìm tập nghiệm của phương trình $x^2 - 4 = 0$ từ đồ thị $y = x^2 - 4$:",
        explanation: "Ta có $x^2 = 4 \\Leftrightarrow x = \\pm 2$.",
        imageKey: mathDiagramKey,
        order: 1,
        points: 1,
        options: [
          { id: "A", text: "$S = \\{-2; 2\\}$" },
          { id: "B", text: "$S = \\{2\\}$" },
          { id: "C", text: "$S = \\{-4; 4\\}$" },
          { id: "D", text: "$S = \\emptyset$" },
        ],
        answerKey: { correct: "A" },
      },
    ],
  });

  // Notifications
  await prisma.notification.createMany({
    data: [
      {
        userId: students[0]!.id,
        type: "ASSIGNMENT_CREATED",
        title: "Bài tập mới: Unit 7: The World of Work - Đề số 1",
        body: "Cô Mai Phương vừa giao bài tập mới cho lớp 12A1.",
        link: `/student/assignments/${asgUnit7.id}/do`,
      },
      {
        userId: parent1.id,
        type: "PARENT_ALERT",
        title: "Nguyễn Văn Minh đạt 9.0/10 bài Unit 6",
        body: "Xem báo cáo chi tiết và nhận xét của Cô Mai Phương trong Cổng phụ huynh.",
        link: `/parent?childId=${students[0]!.id}`,
      },
      {
        userId: teacher1.id,
        type: "SUBMISSION_GRADED",
        title: "Có 1 bài tự luận chờ chấm",
        body: "Lê Hoàng Long đã nộp bài Unit 7: The World of Work - Đề số 1.",
        link: `/teacher/assignments/${asgUnit7.id}/grading`,
      },
    ],
  });

  // Phase 16 seed: TeacherCommentPreset + sample AssignmentOverride for student4
  await prisma.teacherCommentPreset.createMany({
    data: [
      {
        teacherId: teacher1.id,
        category: "Khen ngợi",
        content: "Bài làm cẩn thận, trình bày rõ ràng và đúng trọng tâm.",
        order: 0,
      },
      {
        teacherId: teacher1.id,
        category: "Góp ý nội dung",
        content: "Ý đúng nhưng em cần bổ sung thêm dẫn chứng hoặc giải thích chi tiết hơn.",
        order: 1,
      },
      {
        teacherId: teacher1.id,
        category: "Ngữ pháp",
        content: "Chú ý chia thì động từ và kiểm tra lại chính tả trước khi nộp bài.",
        order: 2,
      },
    ],
  });

  await prisma.assignmentOverride.create({
    data: {
      assignmentId: asgUnit7.id,
      studentId: students[3]!.id,
      extraAttempts: 1,
      timeLimitMin: 55,
      note: "Học sinh gặp sự cố mạng giữa giờ (mẫu gia hạn)",
    },
  });

  // Phase 13 seed: sample AuditLog & ErrorLog entries for /admin/audit and /admin/errors
  await prisma.auditLog.createMany({
    data: [
      {
        actorId: admin.id,
        action: "USER_CREATED",
        targetType: "USER",
        targetId: teacher1.id,
        summary: `Tạo tài khoản Giáo viên: ${teacher1.name} (${teacher1.email})`,
        meta: {
          email: teacher1.email,
          role: "TEACHER",
          summaryEn: `Created TEACHER account: ${teacher1.name} (${teacher1.email})`,
        },
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      },
      {
        actorId: admin.id,
        action: "USER_CREATED",
        targetType: "USER",
        targetId: teacher2.id,
        summary: `Tạo tài khoản Giáo viên: ${teacher2.name} (${teacher2.email})`,
        meta: {
          email: teacher2.email,
          role: "TEACHER",
          summaryEn: `Created TEACHER account: ${teacher2.name} (${teacher2.email})`,
        },
        createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000),
      },
      {
        actorId: teacher1.id,
        action: "ASSIGNMENT_UPDATED",
        targetType: "ASSIGNMENT",
        targetId: asgUnit7.id,
        summary: `Cập nhật cài đặt bài tập: ${asgUnit7.title}`,
        meta: { classId: class1.id, maxAttempts: 2, summaryEn: `Updated assignment: ${asgUnit7.title}` },
        createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
    ],
  });

  await prisma.errorLog.createMany({
    data: [
      {
        source: "SERVER",
        level: "WARN",
        message: "Mẫu cảnh báo hệ thống (seed): kết nối lưu trữ chậm bất thường",
        path: "/api/worksheets",
        method: "GET",
        statusCode: 503,
        userId: admin.id,
        meta: { seeded: true },
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      },
      {
        source: "CLIENT",
        level: "ERROR",
        message: "Mẫu lỗi trình duyệt (seed): TypeError: Failed to fetch",
        path: "/student/assignments",
        userId: students[0]!.id,
        userAgent: "Mozilla/5.0 (Seeded Sample)",
        meta: { seeded: true },
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ],
  });

  console.log("Seed completed successfully!");
  console.log("Accounts (password: password123):");
  console.log("  Admin   :", admin.email);
  console.log("  Teacher1:", teacher1.email, "(Class 12A1 joinCode: ENG12A)");
  console.log("  Teacher2:", teacher2.email, "(Class IELTS joinCode: IELT65)");
  console.log("  Students: student1@engclass.vn .. student10@engclass.vn");
  console.log("  Parent1 :", parent1.email, "(Linked to student1 & student2)");
  console.log("  Parent2 :", parent2.email, "(Linked to student3)");
  console.log("  Unused Parent Invite Code for student4: PR4INV88");
}

main()
  .catch((err) => {
    console.error("Seed error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
