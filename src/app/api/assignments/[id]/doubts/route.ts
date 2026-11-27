import { NextResponse } from "next/server";
import { handleApiError, requireAuth, requireStudentForAssignment } from "@/lib/permissions";
import { questionDoubtSchema } from "@/lib/validators";
import { createQuestionDoubt, listQuestionDoubts } from "@/server/questionDoubtService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const user = await requireAuth();
    return NextResponse.json({ doubts: await listQuestionDoubts(id, user) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const { user } = await requireStudentForAssignment(id);
    const data = questionDoubtSchema.parse(await req.json());
    return NextResponse.json(await createQuestionDoubt(id, user.id, data), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
