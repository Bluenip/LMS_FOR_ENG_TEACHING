import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getVnDayKey } from "@/lib/streak";
import { encodeGrayPng } from "@/lib/omr/png";
import { createAccount } from "@/server/accountService";
import { createClass } from "@/server/classService";
import { extractQuestionsFromImages } from "@/server/aiOcrService";
import { applyAiSuggestion, suggestManualGrade } from "@/server/aiGradingService";
import {
  getSimilarityReportDetail,
  listSimilarityReports,
  runAssignmentSimilarityCheck,
  updateSimilarityReportStatus,
} from "@/server/similarityService";

const suffix = `p29_${Date.now()}`;
const ids = { admin: "", teacher: "", teacher2: "", s1: "", s2: "", s3: "", class1: "", ws: "", asg: "", asg2: "", essay: "", code: "" };
const T = (id: string) => ({ id, role: "TEACHER" as const });

const ESSAY_A =
  "Bảo vệ môi trường là trách nhiệm của mỗi người dân. Chúng ta cần giảm rác thải nhựa, trồng thêm cây xanh, tiết kiệm điện nước hằng ngày và tuyên truyền cho mọi người cùng hành động để Trái Đất luôn xanh sạch đẹp.";
const ESSAY_B =
  "Theo em, bảo vệ môi trường là trách nhiệm của mỗi người dân. Chúng ta cần giảm rác thải nhựa, trồng thêm cây xanh, tiết kiệm điện nước hằng ngày và tuyên truyền cho mọi người cùng hành động.";
const ESSAY_C =
  "Mùa hè vừa qua em được về quê thăm ông bà nội. Ở đó em cùng các anh chị đi câu cá, thả diều trên đồng lúa chín vàng và nghe bà kể chuyện cổ tích mỗi tối.";

/** fetch stub returning a Gemini-shaped response and recording the request body. */
function geminiStub(text: string, calls: string[] = []) {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(String(init?.body ?? ""));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: { totalTokenCount: 321 } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

async function mk(role: "TEACHER" | "STUDENT", tag: string) {
  const res = await createAccount(
    { id: ids.admin, role: "ADMIN" },
    { name: `${tag} Nguyễn ${suffix}`, email: `${tag.toLowerCase()}_${suffix}@test.vn`, password: "password123", role }
  );
  return res.user.id;
}

async function submit(asgId: string, studentId: string, answers: Record<string, unknown>) {
  return prisma.submission.create({
    data: {
      assignmentId: asgId,
      studentId,
      attemptNo: 1,
      status: "SUBMITTED",
      submittedAt: new Date(),
      maxScore: 6,
      answers: { create: Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value: value as object })) },
    },
  });
}

beforeAll(async () => {
  ids.admin = (await prisma.user.findUnique({ where: { email: "admin@engclass.vn" } }))!.id;
  ids.teacher = await mk("TEACHER", "Thầy");
  ids.teacher2 = await mk("TEACHER", "Cô");
  ids.s1 = await mk("STUDENT", "Hùng");
  ids.s2 = await mk("STUDENT", "Lan");
  ids.s3 = await mk("STUDENT", "Minh");
  ids.class1 = (await createClass(ids.teacher, { name: `AI C1 ${suffix}` })).id;
  await prisma.enrollment.createMany({
    data: [ids.s1, ids.s2, ids.s3].map((studentId) => ({ classId: ids.class1, studentId, status: "ACTIVE" as const })),
  });
  const ws = await prisma.worksheet.create({
    data: {
      ownerId: ids.teacher,
      title: `AI WS ${suffix}`,
      fields: {
        create: [
          {
            placement: "ANSWER_SHEET",
            type: "ESSAY",
            label: "1",
            prompt: "Viết đoạn văn về bảo vệ môi trường",
            explanation: "Nêu ít nhất 2 giải pháp",
            order: 1,
            points: 3,
            answerKey: {},
            rubric: [
              { id: "c1", title: "Nội dung", maxPoints: 2 },
              { id: "c2", title: "Diễn đạt", maxPoints: 1 },
            ],
          },
          {
            placement: "ANSWER_SHEET",
            type: "CODE",
            label: "2",
            prompt: "Tính tổng 1..n",
            order: 2,
            points: 3,
            options: { language: "python" },
            answerKey: {},
          },
        ],
      },
    },
    include: { fields: { orderBy: { order: "asc" } } },
  });
  ids.ws = ws.id;
  ids.essay = ws.fields[0]!.id;
  ids.code = ws.fields[1]!.id;
  ids.asg = (await prisma.assignment.create({ data: { classId: ids.class1, worksheetId: ws.id, title: `Asg ${suffix}` } })).id;
  ids.asg2 = (await prisma.assignment.create({ data: { classId: ids.class1, worksheetId: ws.id, title: `Asg2 ${suffix}` } })).id;
});

afterAll(async () => {
  await prisma.aiUsageLog.deleteMany({ where: { userId: { in: [ids.teacher, ids.teacher2] } } });
  await prisma.class.deleteMany({ where: { id: ids.class1 } });
  await prisma.worksheet.deleteMany({ where: { id: ids.ws } });
  await prisma.user.deleteMany({ where: { id: { in: [ids.teacher, ids.teacher2, ids.s1, ids.s2, ids.s3] } } });
});

describe("Phase 29 integration: AI OCR & grade suggestions (mocked Gemini)", () => {
  it("OCR validates images, consumes quota and returns drafts with KaTeX", async () => {
    const png = encodeGrayPng({ width: 4, height: 4, data: new Uint8ClampedArray(16).fill(255) });
    await expect(
      extractQuestionsFromImages(T(ids.teacher), [Buffer.from("not-an-image-but-long-enough")], {}, { apiKeyOverride: "k", fetchImpl: geminiStub("[]") })
    ).rejects.toMatchObject({ code: "OCR_IMAGE_INVALID" });
    await expect(
      extractQuestionsFromImages(T(ids.teacher), Array(6).fill(png), {}, { apiKeyOverride: "k" })
    ).rejects.toMatchObject({ code: "OCR_IMAGE_COUNT" });

    const calls: string[] = [];
    const out = await extractQuestionsFromImages(
      T(ids.teacher),
      [png],
      { subject: "MATH" },
      {
        apiKeyOverride: "test-key",
        fetchImpl: geminiStub(
          JSON.stringify([
            {
              type: "MULTIPLE_CHOICE",
              prompt: "Nghiệm của \\(x^2=9\\)",
              options: [
                { id: "A", text: "3" },
                { id: "B", text: "\\(\\pm 3\\)" },
              ],
              answerKey: { correct: "B" },
            },
          ]),
          calls
        ),
      }
    );
    expect(out.questions[0]!.prompt).toBe("Nghiệm của $x^2=9$");
    expect(JSON.parse(calls[0]!).contents[0].parts[1].inline_data.mime_type).toBe("image/png");
    expect(calls[0]).not.toContain("test-key"); // key travels in a header, not the body
    expect(await prisma.aiUsageLog.count({ where: { userId: ids.teacher, action: "OCR_WORKSHEET" } })).toBe(1);
  });

  it("suggests a rubric grade from an anonymised request, never touching Answer.score until applied", async () => {
    const sub = await submit(ids.asg2, ids.s1, {
      [ids.essay]: `Em là Hùng Nguyễn ${suffix}. ${ESSAY_A}`,
    });
    const calls: string[] = [];
    await expect(
      suggestManualGrade(sub.id, ids.essay, T(ids.teacher2), {}, { apiKeyOverride: "k", fetchImpl: geminiStub("{}") })
    ).rejects.toMatchObject({ statusCode: 403 });

    const suggestion = await suggestManualGrade(
      sub.id,
      ids.essay,
      T(ids.teacher),
      { locale: "vi" },
      {
        apiKeyOverride: "k",
        fetchImpl: geminiStub('{"rubricScores":{"c1":1.75,"c2":9},"score":10,"comment":"Bài viết rõ ý."}', calls),
      }
    );
    expect(suggestion).toMatchObject({ suggestedScore: 2.75, suggestedRubricScores: { c1: 1.75, c2: 1 }, appliedAt: null });
    // zero PII in the outgoing request
    const body = calls[0]!;
    for (const pii of [`Hùng Nguyễn ${suffix}`, `hùng_${suffix}@test.vn`, `AI C1 ${suffix}`]) expect(body).not.toContain(pii);
    expect(body).toContain("[ẩn]");

    const before = await prisma.answer.findFirst({ where: { submissionId: sub.id, fieldId: ids.essay } });
    expect(before?.score).toBeNull();
    expect(before?.teacherNote).toBeNull();

    const applied = await applyAiSuggestion(sub.id, ids.essay, T(ids.teacher));
    expect(applied.appliedAt).not.toBeNull();
    const after = await prisma.answer.findFirst({ where: { submissionId: sub.id, fieldId: ids.essay } });
    expect(after?.score).toBe(2.75);
    expect(after?.teacherNote).toBe("Bài viết rõ ý.");
  });

  it("enforces the shared daily AI quota", async () => {
    const prev = process.env.AI_DAILY_LIMIT_PER_TEACHER;
    process.env.AI_DAILY_LIMIT_PER_TEACHER = "2";
    try {
      const used = await prisma.aiUsageLog.count({ where: { userId: ids.teacher, dayKey: getVnDayKey(new Date()) } });
      expect(used).toBe(2);
      const png = encodeGrayPng({ width: 4, height: 4, data: new Uint8ClampedArray(16).fill(255) });
      await expect(
        extractQuestionsFromImages(T(ids.teacher), [png], {}, { apiKeyOverride: "k", fetchImpl: geminiStub("[]") })
      ).rejects.toMatchObject({ statusCode: 429, code: "AI_QUOTA_EXCEEDED" });
    } finally {
      if (prev === undefined) delete process.env.AI_DAILY_LIMIT_PER_TEACHER;
      else process.env.AI_DAILY_LIMIT_PER_TEACHER = prev;
    }
  });
});

describe("Phase 29 integration: similarity reports", () => {
  it("flags copied essays/code between different students, keeps decisions on rescan, blocks IDOR", async () => {
    const codeA = "def tong(n):\n    s = 0\n    for i in range(1, n + 1):\n        s = s + i\n    return s\nprint(tong(10))";
    const codeB = "def sum_to(m):\n    total = 0  # copy\n    for k in range(1, m + 1):\n        total = total + k\n    return total\nprint(sum_to(5))";
    const subA = await submit(ids.asg, ids.s1, { [ids.essay]: ESSAY_A, [ids.code]: { code: codeA } });
    const subB = await submit(ids.asg, ids.s2, { [ids.essay]: ESSAY_B, [ids.code]: { code: codeB } });
    await submit(ids.asg, ids.s3, { [ids.essay]: ESSAY_C, [ids.code]: { code: "print('hi')" } }); // short code skipped

    const res = await runAssignmentSimilarityCheck(ids.asg, ids.teacher);
    expect(res).toMatchObject({ fieldsChecked: 2, submissionsChecked: 3, flagged: 2 });
    const reports = await listSimilarityReports(ids.asg);
    expect(reports).toHaveLength(2);
    const essayReport = reports.find((r) => r.fieldId === ids.essay)!;
    expect(essayReport.similarity).toBeGreaterThan(0.6);
    expect([essayReport.studentAName, essayReport.studentBName].sort()).toEqual(
      [`Hùng Nguyễn ${suffix}`, `Lan Nguyễn ${suffix}`].sort()
    );
    expect(reports.find((r) => r.fieldId === ids.code)!.similarity).toBe(1);

    const detail = await getSimilarityReportDetail(ids.asg, essayReport.id);
    const span = detail.matchedSpans[0]!;
    const aText = detail.a.submissionId === subA.id ? ESSAY_A : ESSAY_B;
    expect(aText.slice(span.startA, span.endA)).toContain("trách nhiệm của mỗi người dân");
    void subB;

    // IDOR: a report cannot be read / changed through another assignment id
    await expect(getSimilarityReportDetail(ids.asg2, essayReport.id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(updateSimilarityReportStatus(ids.asg2, essayReport.id, ids.teacher, "DISMISSED")).rejects.toMatchObject({
      statusCode: 404,
    });

    await updateSimilarityReportStatus(ids.asg, essayReport.id, ids.teacher, "CONFIRMED");
    await runAssignmentSimilarityCheck(ids.asg, ids.teacher);
    const again = await listSimilarityReports(ids.asg);
    expect(again.find((r) => r.id === essayReport.id)?.status).toBe("CONFIRMED");
    expect(again).toHaveLength(2);
  });
});
