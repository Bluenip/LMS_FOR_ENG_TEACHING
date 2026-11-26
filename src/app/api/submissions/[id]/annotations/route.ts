import { NextResponse } from "next/server";
import { AppError, handleApiError, requireSubmissionAccess } from "@/lib/permissions";
import { savePhotoAnnotationsSchema } from "@/lib/validators";
import { savePhotoAnnotations } from "@/server/submissionService";

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const ctx = await requireSubmissionAccess(id);
    if (!ctx.isTeacher) {
      throw new AppError("Chỉ giáo viên mới có quyền chấm điểm.", 403, "FORBIDDEN");
    }

    const body = await req.json();
    const parsed = savePhotoAnnotationsSchema.parse(body);
    const saved = await savePhotoAnnotations(id, parsed.fieldId, parsed.annotations);
    return NextResponse.json({ answer: saved });
  } catch (error) {
    return handleApiError(error);
  }
}
