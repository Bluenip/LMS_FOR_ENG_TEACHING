import { NextResponse } from "next/server";
import { handleApiError, requireMemberOfClass } from "@/lib/permissions";
import { votePostPollSchema } from "@/lib/validators";
import { voteOnPostPoll } from "@/server/postService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; postId: string }> }
) {
  try {
    const { id, postId } = await context.params;
    const { user } = await requireMemberOfClass(id);
    const data = votePostPollSchema.parse(await req.json());
    const post = await voteOnPostPoll(id, postId, user.id, data.optionIds);
    return NextResponse.json({ post });
  } catch (error) {
    return handleApiError(error);
  }
}
