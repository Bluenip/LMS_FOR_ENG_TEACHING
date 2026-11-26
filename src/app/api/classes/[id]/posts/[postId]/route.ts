import { NextResponse } from "next/server";
import {
  handleApiError,
  requireMemberOfClass,
  requireTeacherOfClass,
} from "@/lib/permissions";
import { updatePostModerationSchema } from "@/lib/validators";
import { deletePost, updatePostModeration } from "@/server/postService";

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string; postId: string }> }
) {
  try {
    const { id, postId } = await context.params;
    const { user } = await requireTeacherOfClass(id, "CO_TEACHER");
    const data = updatePostModerationSchema.parse(await req.json());
    const post = await updatePostModeration(id, postId, data, user.id);
    return NextResponse.json({ post });
  } catch (error) {
    return handleApiError(error);
  }
}

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
