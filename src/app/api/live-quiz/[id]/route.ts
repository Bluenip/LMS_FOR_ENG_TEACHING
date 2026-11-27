import { NextResponse } from "next/server";
import { getOptionalAuthUser, handleApiError } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { readLiveQuizJoinToken } from "@/lib/live-quiz/cookie";
import {
  canControlLiveQuiz,
  getLiveQuizHostView,
  getLiveQuizPlayerView,
} from "@/server/liveQuizService";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await getOptionalAuthUser();
    const session = await prisma.liveQuizSession.findUnique({
      where: { id },
      select: { hostId: true, classId: true },
    });
    if (!session) throw new AppError("Không tìm thấy phiên Live Quiz.", 404, "NOT_FOUND");

    if (user && (user.role === "TEACHER" || user.role === "ADMIN") && (await canControlLiveQuiz(user, session))) {
      return NextResponse.json(await getLiveQuizHostView(id, user));
    }
    const joinToken = await readLiveQuizJoinToken(id);
    return NextResponse.json(await getLiveQuizPlayerView(id, { userId: user?.id, joinToken }));
  } catch (error) {
    return handleApiError(error);
  }
}
