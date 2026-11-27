import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { isCodeAnswer, type CodeOptions } from "@/lib/grading";
import {
  compareCode,
  compareEssays,
  normalizeCodeTokens,
  normalizeEssayText,
  type CodeLanguage,
  type MatchedSpan,
} from "@/lib/plagiarism/winnowing";

export const SIMILARITY_MIN_WORDS = 25;
export const SIMILARITY_MIN_CODE_CHARS = 40;
export const SIMILARITY_STATUSES = ["OPEN", "DISMISSED", "CONFIRMED"] as const;
export type SimilarityStatus = (typeof SIMILARITY_STATUSES)[number];

function answerText(type: string, value: unknown): string | null {
  if (type === "ESSAY" && typeof value === "string") return value;
  if (type === "CODE" && isCodeAnswer(value)) return value.code;
  return null;
}

function longEnough(type: string, text: string, lang: CodeLanguage): boolean {
  if (type === "CODE") {
    return text.replace(/\s+/g, "").length >= SIMILARITY_MIN_CODE_CHARS && normalizeCodeTokens(text, lang).length > 0;
  }
  return normalizeEssayText(text).length >= SIMILARITY_MIN_WORDS;
}

/**
 * Compares every pair of finished submissions (latest attempt of two DIFFERENT students) for each
 * ESSAY / CODE question and upserts a report when similarity ≥ minThreshold. Teacher decisions
 * (DISMISSED / CONFIRMED) survive re-scans; stale OPEN reports below the threshold are removed.
 */
export async function runAssignmentSimilarityCheck(
  assignmentId: string,
  actorId: string,
  opts: { fieldId?: string | null; minThreshold?: number } = {}
) {
  const minThreshold = Math.min(1, Math.max(0.1, opts.minThreshold ?? 0.35));
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: {
      worksheet: {
        select: {
          fields: {
            where: { type: { in: ["ESSAY", "CODE"] }, ...(opts.fieldId ? { id: opts.fieldId } : {}) },
            select: { id: true, type: true, options: true },
          },
        },
      },
    },
  });
  if (!assignment) throw new AppError("Không tìm thấy bài tập.", 404, "NOT_FOUND");
  const fields = assignment.worksheet.fields;
  if (opts.fieldId && fields.length === 0) {
    throw new AppError("Chỉ kiểm tra tương đồng được câu tự luận hoặc lập trình.", 400, "SIMILARITY_UNSUPPORTED_FIELD");
  }

  const submissions = await prisma.submission.findMany({
    where: { assignmentId, status: { in: ["SUBMITTED", "GRADED", "RETURNED"] } },
    orderBy: [{ studentId: "asc" }, { attemptNo: "desc" }],
    select: { id: true, studentId: true, answers: { where: { fieldId: { in: fields.map((f) => f.id) } }, select: { fieldId: true, value: true } } },
  });
  // latest attempt per student only
  const latest = new Map<string, (typeof submissions)[number]>();
  for (const s of submissions) if (!latest.has(s.studentId)) latest.set(s.studentId, s);
  const subs = Array.from(latest.values()).sort((a, b) => (a.id < b.id ? -1 : 1));

  let pairsCompared = 0;
  let flagged = 0;
  for (const field of fields) {
    const lang = ((field.options as unknown as CodeOptions | null)?.language ?? "python") as CodeLanguage;
    const texts = subs
      .map((s) => ({ sub: s, text: answerText(field.type, s.answers.find((a) => a.fieldId === field.id)?.value) }))
      .filter((x): x is { sub: (typeof subs)[number]; text: string } => Boolean(x.text && longEnough(field.type, x.text, lang)));

    const keep = new Set<string>();
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const A = texts[i]!;
        const B = texts[j]!;
        if (A.sub.studentId === B.sub.studentId) continue;
        pairsCompared++;
        const r = field.type === "CODE" ? compareCode(A.text, B.text, lang) : compareEssays(A.text, B.text);
        if (r.similarity < minThreshold) continue;
        flagged++;
        const key = { assignmentId, fieldId: field.id, submissionAId: A.sub.id, submissionBId: B.sub.id };
        keep.add(`${A.sub.id}:${B.sub.id}`);
        await prisma.similarityReport.upsert({
          where: { assignmentId_fieldId_submissionAId_submissionBId: key },
          create: { ...key, similarity: r.similarity, matchedSpans: r.matchedSpans as unknown as Prisma.InputJsonValue },
          update: { similarity: r.similarity, matchedSpans: r.matchedSpans as unknown as Prisma.InputJsonValue },
        });
      }
    }
    const stale = await prisma.similarityReport.findMany({
      where: { assignmentId, fieldId: field.id, status: "OPEN" },
      select: { id: true, submissionAId: true, submissionBId: true },
    });
    const staleIds = stale.filter((r) => !keep.has(`${r.submissionAId}:${r.submissionBId}`)).map((r) => r.id);
    if (staleIds.length > 0) await prisma.similarityReport.deleteMany({ where: { id: { in: staleIds } } });
  }
  void actorId;
  return { fieldsChecked: fields.length, submissionsChecked: subs.length, pairsCompared, flagged };
}

export async function listSimilarityReports(assignmentId: string) {
  const rows = await prisma.similarityReport.findMany({
    where: { assignmentId },
    orderBy: [{ similarity: "desc" }, { createdAt: "asc" }],
  });
  const subIds = Array.from(new Set(rows.flatMap((r) => [r.submissionAId, r.submissionBId])));
  const fieldIds = Array.from(new Set(rows.map((r) => r.fieldId)));
  const [subs, fields] = await Promise.all([
    prisma.submission.findMany({ where: { id: { in: subIds } }, select: { id: true, student: { select: { name: true } } } }),
    prisma.field.findMany({ where: { id: { in: fieldIds } }, select: { id: true, label: true, type: true } }),
  ]);
  const name = new Map(subs.map((s) => [s.id, s.student.name]));
  const fieldMap = new Map(fields.map((f) => [f.id, f]));
  return rows.map((r) => ({
    id: r.id,
    fieldId: r.fieldId,
    fieldLabel: fieldMap.get(r.fieldId)?.label ?? "?",
    fieldType: fieldMap.get(r.fieldId)?.type ?? "ESSAY",
    submissionAId: r.submissionAId,
    submissionBId: r.submissionBId,
    studentAName: name.get(r.submissionAId) ?? "?",
    studentBName: name.get(r.submissionBId) ?? "?",
    similarity: r.similarity,
    status: r.status as SimilarityStatus,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
  }));
}

/** Both answers + highlighted spans for the side-by-side dialog (report must belong to the assignment). */
export async function getSimilarityReportDetail(assignmentId: string, reportId: string) {
  const r = await prisma.similarityReport.findFirst({ where: { id: reportId, assignmentId } });
  if (!r) throw new AppError("Không tìm thấy báo cáo tương đồng.", 404, "NOT_FOUND");
  const [answers, field] = await Promise.all([
    prisma.answer.findMany({
      where: { fieldId: r.fieldId, submissionId: { in: [r.submissionAId, r.submissionBId] } },
      select: { submissionId: true, value: true, submission: { select: { student: { select: { name: true } } } } },
    }),
    prisma.field.findUnique({ where: { id: r.fieldId }, select: { label: true, type: true, prompt: true } }),
  ]);
  const side = (subId: string) => {
    const a = answers.find((x) => x.submissionId === subId);
    return {
      submissionId: subId,
      studentName: a?.submission.student.name ?? "?",
      text: answerText(field?.type ?? "ESSAY", a?.value) ?? "",
    };
  };
  return {
    id: r.id,
    similarity: r.similarity,
    status: r.status as SimilarityStatus,
    field: { id: r.fieldId, label: field?.label ?? "?", type: field?.type ?? "ESSAY", prompt: field?.prompt ?? null },
    a: side(r.submissionAId),
    b: side(r.submissionBId),
    matchedSpans: r.matchedSpans as unknown as MatchedSpan[],
  };
}

export async function updateSimilarityReportStatus(
  assignmentId: string,
  reportId: string,
  actorId: string,
  status: SimilarityStatus
) {
  const res = await prisma.similarityReport.updateMany({
    where: { id: reportId, assignmentId },
    data: { status, reviewedById: status === "OPEN" ? null : actorId, reviewedAt: status === "OPEN" ? null : new Date() },
  });
  if (res.count === 0) throw new AppError("Không tìm thấy báo cáo tương đồng.", 404, "NOT_FOUND");
  return { ok: true, status };
}
