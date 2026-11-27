import { NextResponse } from "next/server";
import { getOptionalAuthUser, handleApiError } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { LIVE_QUIZ_COOKIE_MAX_AGE_SEC, liveQuizCookieName } from "@/lib/live-quiz/cookie";
import { joinLiveQuizSchema } from "@/lib/validators";
import { joinLiveQuiz } from "@/server/liveQuizService";

export async function POST(req: Request) {
  try {
    // Brute-force guard: a 6-digit PIN space is small, so cap join attempts per IP.
    const rl = await checkRateLimitAsync(`livequiz-join:${getClientIp(req.headers)}`, 20, 60_000);
    if (!rl.allowed) {
      throw new AppError("Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.", 429, "RATE_LIMITED");
    }
    const { pin, displayName } = joinLiveQuizSchema.parse(await req.json());
    const user = await getOptionalAuthUser();
    const joined = await joinLiveQuiz(pin, { user, displayName });

    const res = NextResponse.json({
      sessionId: joined.sessionId,
      participantId: joined.participantId,
      displayName: joined.displayName,
    });
    res.cookies.set(liveQuizCookieName(joined.sessionId), joined.joinToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: LIVE_QUIZ_COOKIE_MAX_AGE_SEC,
    });
    return res;
  } catch (error) {
    return handleApiError(error);
  }
}
