import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfAssignment } from "@/lib/permissions";
import { proctorTeacherActionSchema } from "@/lib/validators";
import { performTeacherProctorAction } from "@/server/proctorService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; submissionId: string }> }
) {
  try {
    const { id: assignmentId, submissionId } = await context.params;
    const { user } = await requireTeacherOfAssignment(assignmentId);
    const body = await req.json();
    const data = proctorTeacherActionSchema.parse(body);
    const submission = await performTeacherProctorAction(
      assignmentId,
      submissionId,
      user.id,
      data
    );
    return NextResponse.json({ submission });
  } catch (error) {
    return handleApiError(error);
  }
}
