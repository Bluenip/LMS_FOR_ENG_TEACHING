import { NextResponse } from "next/server";
import { handleApiError, requireMemberOfClass } from "@/lib/permissions";
import { deletePost } from "@/server/classService";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; postId: string }> }
) {
  try {
    const { id, postId } = await context.params;
    const { user, isTeacher } = await requireMemberOfClass(id);
    await deletePost(id, postId, user.id, isTeacher);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
