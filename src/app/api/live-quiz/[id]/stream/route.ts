import { NextResponse } from "next/server";
import { getOptionalAuthUser, handleApiError } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { readLiveQuizJoinToken } from "@/lib/live-quiz/cookie";
import { subscribeLiveQuiz } from "@/lib/live-quiz/live-bus";
import { canControlLiveQuiz, resolveParticipant } from "@/server/liveQuizService";

export const dynamic = "force-dynamic";

/** SSE of state-change signals only (no question content); clients refetch GET /api/live-quiz/[id]. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const session = await prisma.liveQuizSession.findUnique({
      where: { id },
      select: { id: true, hostId: true, classId: true },
    });
    if (!session) throw new AppError("Không tìm thấy phiên Live Quiz.", 404, "NOT_FOUND");

    const user = await getOptionalAuthUser();
    const isHost = Boolean(user && (await canControlLiveQuiz(user, session)));
    if (!isHost) {
      const joinToken = await readLiveQuizJoinToken(id);
      const participant = await resolveParticipant(id, { userId: user?.id, joinToken });
      if (!participant) {
        throw new AppError("Bạn chưa tham gia phiên Live Quiz này.", 403, "LIVE_QUIZ_NOT_JOINED");
      }
    }

    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;
    let keepAlive: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
      start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        send("connected", { sessionId: id, at: new Date().toISOString() });
        unsubscribe = subscribeLiveQuiz(id, (event) => {
          try {
            send("livequiz", event);
          } catch {
            // stream closed
          }
        });
        keepAlive = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch {
            if (keepAlive) clearInterval(keepAlive);
          }
        }, 15_000);
      },
      cancel() {
        if (keepAlive) clearInterval(keepAlive);
        unsubscribe?.();
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
