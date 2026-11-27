import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { videoProgressSchema } from "@/lib/validators";
import { getLessonVideoForStudent, reportVideoHeartbeat, submitCheckpointAnswer } from "@/server/videoLessonService";

type Ctx = { params: Promise<{ itemId: string }> };

export async function GET(_req: Request, context: Ctx) {
  try {
    const { itemId } = await context.params;
    const user = await requireRole(["STUDENT"]);
    return NextResponse.json(await getLessonVideoForStudent(itemId, user.id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request, context: Ctx) {
  try {
    const { itemId } = await context.params;
    const user = await requireRole(["STUDENT"]);
    const data = videoProgressSchema.parse(await req.json());
    if (data.kind === "HEARTBEAT") return NextResponse.json(await reportVideoHeartbeat(itemId, user.id, data));
    return NextResponse.json(await submitCheckpointAnswer(itemId, user.id, data.checkpointId, data.answer));
  } catch (error) {
    return handleApiError(error);
  }
}
