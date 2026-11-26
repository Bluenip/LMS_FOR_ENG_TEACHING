import { NextResponse } from "next/server";
import { handleApiError, requireMemberOfClass } from "@/lib/permissions";
import { createCommentSchema } from "@/lib/validators";
import { createComment } from "@/server/postService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; postId: string }> }
) {
  try {
    const { id, postId } = await context.params;
    const { user, isTeacher } = await requireMemberOfClass(id);
    const body = await req.json();
    const data = createCommentSchema.parse(body);
    const comment = await createComment(id, postId, user.id, data.content, isTeacher);
    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
