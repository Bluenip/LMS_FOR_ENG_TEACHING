import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { replyDoubtSchema } from "@/lib/validators";
import { replyQuestionDoubt } from "@/server/questionDoubtService";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = replyDoubtSchema.parse(await req.json());
    return NextResponse.json(await replyQuestionDoubt(id, user, data));
  } catch (error) {
    return handleApiError(error);
  }
}
