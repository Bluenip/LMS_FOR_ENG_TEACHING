import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { autosaveAnswersSchema } from "@/lib/validators";
import { autosaveSubmissionAnswers } from "@/server/submissionService";

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["STUDENT"]);
    const { id } = await context.params;
    const body = await req.json();
    const data = autosaveAnswersSchema.parse(body);
    const result = await autosaveSubmissionAnswers(id, user.id, data, req.headers);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
