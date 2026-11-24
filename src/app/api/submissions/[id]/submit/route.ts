import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { submitSubmissionSchema } from "@/lib/validators";
import { submitByStudent } from "@/server/submissionService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["STUDENT"]);
    const { id } = await context.params;
    const rawBody = await req.json().catch(() => ({}));
    const data = submitSubmissionSchema.parse(rawBody);
    const submission = await submitByStudent(id, user.id, data, req.headers);
    return NextResponse.json({
      submission: {
        id: submission.id,
        status: submission.status,
        submittedAt: submission.submittedAt,
        isLate: submission.isLate,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
