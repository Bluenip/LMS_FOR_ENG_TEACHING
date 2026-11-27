import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { liveQuizControlSchema } from "@/lib/validators";
import { advanceLiveQuiz } from "@/server/liveQuizService";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { action } = liveQuizControlSchema.parse(await req.json());
    return NextResponse.json(await advanceLiveQuiz(id, user, action));
  } catch (error) {
    return handleApiError(error);
  }
}
