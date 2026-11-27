import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { videoCheckpointSchema } from "@/lib/validators";
import { createCheckpoint, deleteCheckpoint, listCheckpointsForOwner } from "@/server/videoLessonService";

type Ctx = { params: Promise<{ itemId: string }> };

export async function GET(_req: Request, context: Ctx) {
  try {
    const { itemId } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    return NextResponse.json(await listCheckpointsForOwner(itemId, user));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request, context: Ctx) {
  try {
    const { itemId } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = videoCheckpointSchema.parse(await req.json());
    return NextResponse.json({ checkpoint: await createCheckpoint(itemId, user, data) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, context: Ctx) {
  try {
    const { itemId } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const id = new URL(req.url).searchParams.get("checkpointId");
    if (!id) throw new AppError("Không tìm thấy câu hỏi.", 404, "NOT_FOUND");
    return NextResponse.json(await deleteCheckpoint(itemId, user, id));
  } catch (error) {
    return handleApiError(error);
  }
}
