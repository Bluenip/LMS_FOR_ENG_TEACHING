import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { trashLessonItem } from "@/server/trashService";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { id, itemId } = await context.params;
    await trashLessonItem(user, id, itemId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
