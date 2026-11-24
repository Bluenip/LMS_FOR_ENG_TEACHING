import { NextResponse } from "next/server";
import { handleApiError, requireStudentForAssignment } from "@/lib/permissions";
import { startSubmissionSchema } from "@/lib/validators";
import { startOrResumeSubmission } from "@/server/submissionService";
import { verifySebHeaderIfNeeded } from "@/server/assignmentService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, assignment } = await requireStudentForAssignment(id);
    verifySebHeaderIfNeeded(assignment, req.headers);

    const rawBody = await req.json().catch(() => ({}));
    const data = startSubmissionSchema.parse(rawBody);
    const result = await startOrResumeSubmission(id, user.id, data);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return handleApiError(error);
  }
}
