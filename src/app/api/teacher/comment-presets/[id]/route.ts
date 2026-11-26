import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { deleteCommentPreset } from "@/server/commentPresetService";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { id } = await context.params;
    const res = await deleteCommentPreset(id, user.id, user.role === "ADMIN");
    return NextResponse.json(res);
  } catch (error) {
    return handleApiError(error);
  }
}
