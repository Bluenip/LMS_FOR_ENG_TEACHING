import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { reviewLeaveSchema } from "@/lib/validators";
import { reviewLeaveRequest } from "@/server/leaveRequestService";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = reviewLeaveSchema.parse(await req.json());
    const { user } = await requireTeacherOfClass(data.classId, "ASSISTANT");
    return NextResponse.json(await reviewLeaveRequest(id, data.classId, user, data));
  } catch (error) {
    return handleApiError(error);
  }
}
