import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfAssignment } from "@/lib/permissions";
import { getAssignmentReport } from "@/server/reportService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfAssignment(id);
    const report = await getAssignmentReport(id);
    return NextResponse.json(report);
  } catch (error) {
    return handleApiError(error);
  }
}
