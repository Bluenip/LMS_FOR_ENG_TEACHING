import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfAssignment } from "@/lib/permissions";
import { getLiveProctoringSnapshot } from "@/server/proctorService";
import { subscribeAssignmentLive } from "@/lib/proctor-bus";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: assignmentId } = await context.params;
    await requireTeacherOfAssignment(assignmentId);

    const url = new URL(req.url);
    if (url.searchParams.get("mode") === "snapshot") {
      const snapshot = await getLiveProctoringSnapshot(assignmentId);
      return NextResponse.json(snapshot);
    }

    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
      start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        };

        send("connected", { assignmentId, at: new Date().toISOString() });

        unsubscribe = subscribeAssignmentLive(assignmentId, (payload) => {
          try {
            send("proctor", payload);
          } catch {
            // Stream closed
          }
        });

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
        if (unsubscribe) unsubscribe();
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
