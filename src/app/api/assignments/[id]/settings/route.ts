import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfAssignment } from "@/lib/permissions";
import { getAssignmentSettings } from "@/server/assignmentService";

/** Current settings of an assignment, for the teacher's edit form. */
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireTeacherOfAssignment(id);
    return NextResponse.json({ assignment: await getAssignmentSettings(id) });
  } catch (error) {
    return handleApiError(error);
  }
}
