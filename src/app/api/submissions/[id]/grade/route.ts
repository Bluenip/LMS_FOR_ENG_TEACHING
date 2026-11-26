import { NextResponse } from "next/server";
import { AppError, handleApiError, requireSubmissionAccess } from "@/lib/permissions";
import { manualGradeSchema, singleFieldGradeSchema } from "@/lib/validators";
import {
  getSubmissionForTeacherReview,
  saveSingleFieldGrade,
  saveTeacherManualGrading,
} from "@/server/submissionService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { isTeacher } = await requireSubmissionAccess(id);
    if (!isTeacher) {
      throw new AppError("Chỉ giáo viên mới được xem trang chấm bài chi tiết.", 403, "FORBIDDEN");
    }
    const submission = await getSubmissionForTeacherReview(id);
    return NextResponse.json({ submission });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { isTeacher } = await requireSubmissionAccess(id);
    if (!isTeacher) {
      throw new AppError("Chỉ giáo viên mới có quyền chấm điểm.", 403, "FORBIDDEN");
    }
    const body = await req.json();
    const data = manualGradeSchema.parse(body);
    const submission = await saveTeacherManualGrading(id, data);
    return NextResponse.json({ submission });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { isTeacher } = await requireSubmissionAccess(id);
    if (!isTeacher) {
      throw new AppError("Chỉ giáo viên mới có quyền chấm điểm.", 403, "FORBIDDEN");
    }
    const body = await req.json();
    const data = singleFieldGradeSchema.parse(body);
    const result = await saveSingleFieldGrade(id, data);
    return NextResponse.json({ submission: result.updatedSub, answer: result.savedAnswer });
  } catch (error) {
    return handleApiError(error);
  }
}
