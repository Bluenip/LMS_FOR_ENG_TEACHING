import type { WorksheetSubject } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getVnDayKey } from "@/lib/streak";
import {
  buildGeminiQuestionPrompt,
  parseAndSanitizeAiQuestions,
  type AiGeneratedQuestionDraft,
  type AiSupportedQuestionType,
} from "@/lib/ai/gemini-prompt";

export interface AiGenerateQuestionsParams {
  sourceText: string;
  subject: WorksheetSubject;
  count: number;
  types: AiSupportedQuestionType[];
  level?: string | null;
  worksheetId?: string | null;
}

function getDailyLimit(): number {
  const raw = Number(process.env.AI_DAILY_LIMIT_PER_TEACHER ?? "20");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20;
}

function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
}

export async function getTeacherAiQuotaStatus(userId: string) {
  const limit = getDailyLimit();
  const dayKey = getVnDayKey(new Date());
  const used = await prisma.aiUsageLog.count({
    where: { userId, dayKey },
  });
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    hasApiKey: Boolean(process.env.GEMINI_API_KEY?.trim()),
    model: getGeminiModel(),
    dayKey,
  };
}

export async function generateWorksheetQuestionsWithAi(
  actor: { id: string; role: string },
  input: AiGenerateQuestionsParams,
  deps?: {
    fetchImpl?: typeof fetch;
    apiKeyOverride?: string;
    now?: Date;
  }
): Promise<{
  questions: AiGeneratedQuestionDraft[];
  quota: { limit: number; used: number; remaining: number; dayKey: string };
}> {
  if (input.worksheetId) {
    const ws = await prisma.worksheet.findFirst({
      where: { id: input.worksheetId, deletedAt: null },
      select: { id: true, ownerId: true },
    });
    if (!ws) {
      throw new AppError("Không tìm thấy phiếu bài tập.", 404, "NOT_FOUND");
    }
    if (actor.role !== "ADMIN" && ws.ownerId !== actor.id) {
      throw new AppError("Bạn không có quyền chỉnh sửa phiếu bài tập này.", 403, "FORBIDDEN");
    }
  }

  const limit = getDailyLimit();
  const dayKey = getVnDayKey(deps?.now ?? new Date());
  const usedBefore = await prisma.aiUsageLog.count({
    where: { userId: actor.id, dayKey },
  });
  if (usedBefore >= limit) {
    throw new AppError(
      `Bạn đã dùng hết hạn mức AI hôm nay (${limit} lượt/ngày). Vui lòng thử lại vào ngày mai.`,
      429,
      "AI_QUOTA_EXCEEDED"
    );
  }

  const apiKey = (deps?.apiKeyOverride ?? process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new AppError(
      "Tính năng AI chưa được kích hoạt (thiếu GEMINI_API_KEY).",
      503,
      "AI_NOT_CONFIGURED"
    );
  }

  const model = getGeminiModel();
  const prompt = buildGeminiQuestionPrompt(input);
  const fetchFn = deps?.fetchImpl ?? fetch;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch {
    throw new AppError("Không thể kết nối tới dịch vụ AI.", 502, "AI_UPSTREAM_ERROR");
  }

  if (!response.ok) {
    throw new AppError(
      `Dịch vụ AI trả về lỗi (${response.status}).`,
      response.status === 429 ? 429 : 502,
      "AI_UPSTREAM_ERROR"
    );
  }

  const payload = (await response.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { totalTokenCount?: number };
  } | null;

  const rawText = payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const allowedSet = new Set(input.types);
  const questions = parseAndSanitizeAiQuestions(rawText).filter((q) => allowedSet.has(q.type));
  if (questions.length === 0) {
    throw new AppError(
      "AI không tạo được câu hỏi hợp lệ cho định dạng yêu cầu. Vui lòng thử lại.",
      502,
      "AI_INVALID_OUTPUT"
    );
  }

  const tokensUsed =
    typeof payload?.usageMetadata?.totalTokenCount === "number"
      ? payload.usageMetadata.totalTokenCount
      : null;

  await prisma.aiUsageLog.create({
    data: {
      userId: actor.id,
      action: "GENERATE_QUESTIONS",
      dayKey,
      tokensUsed,
    },
  });

  const used = usedBefore + 1;
  return {
    questions,
    quota: {
      limit,
      used,
      remaining: Math.max(0, limit - used),
      dayKey,
    },
  };
}
