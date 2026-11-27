import { NextResponse } from "next/server";
import { handleApiError, requireSubmissionAccess } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { subscribeAssignmentLive } from "@/lib/proctor-bus";

export const dynamic = "force-dynamic";

const FOR_STUDENT = new Set(["TEACHER_MESSAGE", "TIME_EXTENDED", "SUBMISSION_UNLOCKED", "TEACHER_REMINDER"]);

/** Student SSE: teacher messages / extra time / unlocks addressed to THIS submission only. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { submission, isOwnerStudent } = await requireSubmissionAccess(id);
    if (!isOwnerStudent) throw new AppError("Bạn không có quyền truy cập bài làm này.", 403, "FORBIDDEN");
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | null = null;
    let keepAlive: ReturnType<typeof setInterval> | null = null;
    const stream = new ReadableStream({
      start(controller) {
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        send("connected", { at: new Date().toISOString() });
        unsubscribe = subscribeAssignmentLive(submission.assignmentId, (p) => {
          if (p.submissionId !== submission.id || !FOR_STUDENT.has(p.kind)) return;
          try {
            send("teacher", { kind: p.kind, message: p.message ?? null, at: p.at });
          } catch {
            // closed
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
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
