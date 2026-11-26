import { NextResponse } from "next/server";
import { AppError, handleApiError, requireSubmissionAccess } from "@/lib/permissions";
import { returnSubmissionSchema } from "@/lib/validators";
import { returnSubmissionForRevision } from "@/server/submissionService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, isTeacher } = await requireSubmissionAccess(id);
    if (!isTeacher) {
      throw new AppError("Chỉ giáo viên mới có quyền trả bài làm lại.", 403, "FORBIDDEN");
    }
    const raw = await req.json().catch(() => ({}));
    const data = returnSubmissionSchema.parse(raw);
    const submission = await returnSubmissionForRevision(
      id,
      user.id,
      data.teacherComment
    );
    return NextResponse.json({ submission });
  } catch (error) {
    return handleApiError(error);
  }
}
