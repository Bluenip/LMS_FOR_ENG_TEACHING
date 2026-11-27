import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { getVnDayKey } from "@/lib/streak";

export interface GeminiDeps {
  fetchImpl?: typeof fetch;
  apiKeyOverride?: string;
  now?: Date;
  timeoutMs?: number;
}

export function getAiDailyLimit(): number {
  const raw = Number(process.env.AI_DAILY_LIMIT_PER_TEACHER ?? "20");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 20;
}

export function getGeminiModelName(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
}

/** Throws 429 when the teacher used today's AI quota (shared by all AI features, Phase 25). */
export async function assertAiQuota(userId: string, now?: Date) {
  const limit = getAiDailyLimit();
  const dayKey = getVnDayKey(now ?? new Date());
  const used = await prisma.aiUsageLog.count({ where: { userId, dayKey } });
  if (used >= limit) {
    throw new AppError(
      `Bạn đã dùng hết hạn mức AI hôm nay (${limit} lượt/ngày). Vui lòng thử lại vào ngày mai.`,
      429,
      "AI_QUOTA_EXCEEDED"
    );
  }
  return { limit, used, dayKey };
}

export async function logAiUsage(userId: string, action: string, dayKey: string, tokensUsed: number | null) {
  await prisma.aiUsageLog.create({ data: { userId, action, dayKey, tokensUsed } });
}

/**
 * Calls Gemini `generateContent` with a prepared body and returns the first text part.
 * The API key is sent in a header (never logged, never returned to the client).
 */
export async function callGemini(
  body: unknown,
  deps: GeminiDeps = {}
): Promise<{ text: string; tokensUsed: number | null; model: string }> {
  const apiKey = (deps.apiKeyOverride ?? process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new AppError("Tính năng AI chưa được kích hoạt (thiếu GEMINI_API_KEY).", 503, "AI_NOT_CONFIGURED");
  }
  const model = getGeminiModelName();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? 45_000);
  let response: Response;
  try {
    response = await (deps.fetchImpl ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AppError("Dịch vụ AI phản hồi quá lâu. Vui lòng thử lại.", 504, "AI_TIMEOUT");
    }
    void error;
    throw new AppError("Không thể kết nối tới dịch vụ AI.", 502, "AI_UPSTREAM_ERROR");
  } finally {
    clearTimeout(timer);
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
  const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const tokensUsed = typeof payload?.usageMetadata?.totalTokenCount === "number" ? payload.usageMetadata.totalTokenCount : null;
  return { text, tokensUsed, model };
}
