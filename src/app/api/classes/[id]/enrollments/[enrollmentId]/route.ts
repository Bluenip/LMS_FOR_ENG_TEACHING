import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { approveEnrollment, removeEnrollment } from "@/server/classService";

export async function PATCH(
  _req: Request,
  context: { params: Promise<{ id: string; enrollmentId: string }> }
) {
  try {
    const { id, enrollmentId } = await context.params;
    await requireTeacherOfClass(id);
    const enrollment = await approveEnrollment(id, enrollmentId);
    return NextResponse.json({ enrollment });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; enrollmentId: string }> }
) {
  try {
    const { id, enrollmentId } = await context.params;
    await requireTeacherOfClass(id);
    await removeEnrollment(id, enrollmentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
