import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { subscribeAssignmentLive } from "@/lib/proctor-bus";
import {
  assertExamSessionAccess,
  getExamSessionLiveSnapshot,
} from "@/server/examSessionService";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const isAdmin = user.role === "ADMIN";
    const url = new URL(req.url);

    if (url.searchParams.get("stream") === "1") {
      const session = await assertExamSessionAccess(id, user.id, isAdmin);
      const assignmentIds = session.assignments
        .filter((a) => !a.class.deletedAt)
        .map((a) => a.id);

      const encoder = new TextEncoder();
      const unsubscribers: Array<() => void> = [];
      let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

      const stream = new ReadableStream({
        start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
            );
          };

          send("connected", {
            sessionId: session.id,
            assignmentIds,
            at: new Date().toISOString(),
          });

          for (const asgId of assignmentIds) {
            const unsub = subscribeAssignmentLive(asgId, (payload) => {
              try {
                send("proctor", payload);
              } catch {
                // Stream closed
              }
            });
            unsubscribers.push(unsub);
          }

          keepAliveTimer = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": keep-alive\n\n"));
            } catch {
              if (keepAliveTimer) clearInterval(keepAliveTimer);
            }
          }, 15_000);
        },
        cancel() {
          if (keepAliveTimer) clearInterval(keepAliveTimer);
          for (const unsub of unsubscribers) unsub();
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
    }

    const snapshot = await getExamSessionLiveSnapshot(id, user.id, isAdmin);
    return NextResponse.json(snapshot);
  } catch (error) {
    return handleApiError(error);
  }
}
