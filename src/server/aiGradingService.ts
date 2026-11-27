import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hasMinClassRole } from "@/lib/class-roles";
import { getStorageProvider } from "@/lib/storage";
import {
  isCodeAnswer,
  isPhotoUploadAnswer,
  type CodeOptions,
  type RubricCriterion,
  type RubricScoreMap,
} from "@/lib/grading";
import {
  buildRubricGradeRequestBody,
  parseRubricGrade,
  redactPii,
  type AnonymousGradingContext,
} from "@/lib/ai/rubric-grade-prompt";
import { assertAiQuota, callGemini, logAiUsage, type GeminiDeps } from "./aiGeminiClient";
import { resolveUserClassRole } from "./classRoleHelper";
import { saveSingleFieldGrade } from "./submissionService";

export const AI_GRADABLE_TYPES = ["ESSAY", "PHOTO_UPLOAD", "CODE"] as const;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

interface Actor {
  id: string;
  role: Role;
}

async function loadForTeacher(submissionId: string, fieldId: string, actor: Actor) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: {
      student: { select: { name: true, email: true, phone: true } },
      assignment: {
        select: {
          classId: true,
          class: { select: { teacherId: true, name: true, deletedAt: true } },
          worksheet: { select: { fields: { where: { id: fieldId } } } },
        },
      },
      answers: { where: { fieldId } },
    },
  });
  if (!submission || submission.assignment.class.deletedAt) {
    throw new AppError("Không tìm thấy bài làm.", 404, "NOT_FOUND");
  }
  const role = await resolveUserClassRole(
    submission.assignment.classId,
    actor.id,
    actor.role,
    submission.assignment.class.teacherId
  );
  if (!hasMinClassRole(role, "ASSISTANT")) {
    throw new AppError("Bạn không có quyền truy cập bài làm này.", 403, "FORBIDDEN");
  }
  const field = submission.assignment.worksheet.fields[0];
  if (!field) throw new AppError("Không tìm thấy câu hỏi trong bài tập này.", 404, "NOT_FOUND");
  return { submission, field, answer: submission.answers[0] ?? null };
}

function suggestionDTO(s: {
  id: string;
  submissionId: string;
  fieldId: string;
  suggestedScore: number;
  suggestedRubricScores: Prisma.JsonValue;
  suggestedComment: string;
  model: string;
  appliedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: s.id,
    submissionId: s.submissionId,
    fieldId: s.fieldId,
    suggestedScore: s.suggestedScore,
    suggestedRubricScores: (s.suggestedRubricScores as RubricScoreMap | null) ?? null,
    suggestedComment: s.suggestedComment,
    model: s.model,
    appliedAt: s.appliedAt?.toISOString() ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}

/**
 * Asks Gemini for a grade suggestion on one manual answer. The request is anonymised (only the
 * question, model answer, rubric and the student's work with their own name/email redacted).
 * The result is stored as a suggestion only: Answer.score / teacherNote are NOT touched.
 */
export async function suggestManualGrade(
  submissionId: string,
  fieldId: string,
  actor: Actor,
  opts: { locale?: "vi" | "en" } = {},
  deps: GeminiDeps = {}
) {
  const { submission, field, answer } = await loadForTeacher(submissionId, fieldId, actor);
  if (!(AI_GRADABLE_TYPES as readonly string[]).includes(field.type)) {
    throw new AppError("AI chỉ gợi ý chấm câu tự luận, ảnh bài làm và lập trình.", 400, "AI_UNSUPPORTED_FIELD");
  }
  if (submission.status === "IN_PROGRESS") {
    throw new AppError("Học sinh chưa nộp bài, chưa thể chấm điểm.", 409, "SUBMISSION_IN_PROGRESS");
  }

  const piiTerms = [submission.student.name, submission.student.email, submission.student.phone, submission.assignment.class.name];
  const value = answer?.value as unknown;
  let answerText: string | null = null;
  let images: Array<{ mimeType: string; data: string }> = [];
  if (field.type === "ESSAY" && typeof value === "string") answerText = redactPii(value, piiTerms);
  if (field.type === "CODE" && isCodeAnswer(value)) answerText = redactPii(value.code, piiTerms);
  if (field.type === "PHOTO_UPLOAD" && isPhotoUploadAnswer(value)) {
    const storage = getStorageProvider();
    const imgs = value.files.filter((f) => f.mimeType.startsWith("image/")).slice(0, 4);
    for (const f of imgs) {
      const got = await storage.get(f.key).catch(() => null);
      if (got && got.size <= MAX_PHOTO_BYTES) images.push({ mimeType: got.contentType, data: got.buffer.toString("base64") });
    }
    if (value.note) answerText = redactPii(value.note, piiTerms);
  }
  if (!answerText?.trim() && images.length === 0) {
    throw new AppError("Bài làm câu này đang bỏ trống, không có gì để AI chấm.", 400, "AI_EMPTY_ANSWER");
  }

  const rubric = Array.isArray(field.rubric) ? (field.rubric as unknown as RubricCriterion[]) : [];
  const ctx: AnonymousGradingContext = {
    questionType: field.type as AnonymousGradingContext["questionType"],
    questionPrompt: field.prompt?.trim() || field.label,
    maxPoints: field.points,
    modelAnswer: field.explanation ?? null,
    rubric,
    answerText,
    codeLanguage: field.type === "CODE" ? ((field.options as unknown as CodeOptions | null)?.language ?? null) : null,
    images,
    locale: opts.locale ?? "vi",
  };

  const { dayKey } = await assertAiQuota(actor.id, deps.now);
  const res = await callGemini(buildRubricGradeRequestBody(ctx), deps);
  const parsed = parseRubricGrade(res.text, rubric, field.points);
  if (!parsed) {
    throw new AppError("AI trả về kết quả không hợp lệ. Vui lòng thử lại.", 502, "AI_INVALID_OUTPUT");
  }
  await logAiUsage(actor.id, "SUGGEST_GRADE", dayKey, res.tokensUsed);
  images = [];

  const data = {
    suggestedScore: parsed.score,
    suggestedRubricScores: (parsed.rubricScores ?? null) as Prisma.InputJsonValue,
    suggestedComment: parsed.comment,
    model: res.model,
    appliedAt: null,
    createdById: actor.id,
  };
  const saved = await prisma.aiGradingSuggestion.upsert({
    where: { submissionId_fieldId: { submissionId, fieldId } },
    create: { submissionId, fieldId, ...data },
    update: { ...data, createdAt: new Date() },
  });
  return suggestionDTO(saved);
}

/** Teacher accepts the suggestion: saved through the normal manual-grade path, then marked applied. */
export async function applyAiSuggestion(submissionId: string, fieldId: string, actor: Actor) {
  await loadForTeacher(submissionId, fieldId, actor);
  const s = await prisma.aiGradingSuggestion.findUnique({ where: { submissionId_fieldId: { submissionId, fieldId } } });
  if (!s) throw new AppError("Không tìm thấy gợi ý AI cho câu này.", 404, "NOT_FOUND");
  await saveSingleFieldGrade(submissionId, {
    fieldId,
    score: s.suggestedScore,
    teacherNote: s.suggestedComment || null,
    rubricScores: (s.suggestedRubricScores as RubricScoreMap | null) ?? undefined,
  });
  const updated = await prisma.aiGradingSuggestion.update({ where: { id: s.id }, data: { appliedAt: new Date() } });
  return suggestionDTO(updated);
}

export async function dismissAiSuggestion(submissionId: string, fieldId: string, actor: Actor) {
  await loadForTeacher(submissionId, fieldId, actor);
  await prisma.aiGradingSuggestion.deleteMany({ where: { submissionId, fieldId, appliedAt: null } });
  return { ok: true };
}

export async function getAiSuggestion(submissionId: string, fieldId: string, actor: Actor) {
  await loadForTeacher(submissionId, fieldId, actor);
  const s = await prisma.aiGradingSuggestion.findUnique({ where: { submissionId_fieldId: { submissionId, fieldId } } });
  return s ? suggestionDTO(s) : null;
}
