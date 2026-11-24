import { NextResponse } from "next/server";
import { handleApiError, requireMemberOfClass } from "@/lib/permissions";
import { createPostSchema } from "@/lib/validators";
import { createPost } from "@/server/classService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user } = await requireMemberOfClass(id);
    const body = await req.json();
    const data = createPostSchema.parse(body);
    const post = await createPost(id, user.id, data.content);
    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
