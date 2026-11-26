import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfAssignment } from "@/lib/permissions";
import { getAssignmentQuestionGradingData } from "@/server/reportService";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfAssignment(id);
    const url = new URL(req.url);
    const fieldId = url.searchParams.get("fieldId") ?? undefined;
    const data = await getAssignmentQuestionGradingData(id, fieldId);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
