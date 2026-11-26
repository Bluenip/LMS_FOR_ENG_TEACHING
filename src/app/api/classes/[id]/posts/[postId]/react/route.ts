import { NextResponse } from "next/server";
import { handleApiError, requireMemberOfClass } from "@/lib/permissions";
import { togglePostReactionSchema } from "@/lib/validators";
import { togglePostReaction } from "@/server/postService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; postId: string }> }
) {
  try {
    const { id, postId } = await context.params;
    const { user } = await requireMemberOfClass(id);
    const data = togglePostReactionSchema.parse(await req.json());
    const post = await togglePostReaction(id, postId, user.id, data.emoji);
    return NextResponse.json({ post });
  } catch (error) {
    return handleApiError(error);
  }
}
