import { NextResponse } from "next/server";
import { handleApiError, requireSubmissionAccess } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { memberScoresSchema } from "@/lib/validators";
import { setMemberScoreOverrides } from "@/server/classGroupService";

/** Teacher adjusts the score credited to individual members of a group submission. */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { isTeacher } = await requireSubmissionAccess(id);
    if (!isTeacher) throw new AppError("Bạn không có quyền truy cập bài làm này.", 403, "FORBIDDEN");
    const { overrides } = memberScoresSchema.parse(await req.json());
    return NextResponse.json(await setMemberScoreOverrides(id, overrides));
  } catch (error) {
    return handleApiError(error);
  }
}
