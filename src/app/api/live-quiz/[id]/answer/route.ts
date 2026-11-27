import { NextResponse } from "next/server";
import { getOptionalAuthUser, handleApiError } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { checkRateLimitAsync } from "@/lib/rate-limit";
import { readLiveQuizJoinToken } from "@/lib/live-quiz/cookie";
import { liveQuizAnswerSchema } from "@/lib/validators";
import { submitLiveQuizAnswer } from "@/server/liveQuizService";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await getOptionalAuthUser();
    const joinToken = await readLiveQuizJoinToken(id);
    if (!joinToken && !user) {
      throw new AppError("Bạn chưa tham gia phiên Live Quiz này.", 403, "LIVE_QUIZ_NOT_JOINED");
    }
    const rl = await checkRateLimitAsync(`livequiz-answer:${id}:${joinToken ?? user?.id}`, 60, 60_000);
    if (!rl.allowed) {
      throw new AppError("Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.", 429, "RATE_LIMITED");
    }
    const data = liveQuizAnswerSchema.parse(await req.json());
    const result = await submitLiveQuizAnswer(id, { userId: user?.id, joinToken }, data);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
