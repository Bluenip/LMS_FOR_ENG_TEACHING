import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { deleteLesson } from "@/server/lessonService";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; lessonId: string }> }
) {
  try {
    const { id, lessonId } = await context.params;
    await requireTeacherOfClass(id);
    await deleteLesson(id, lessonId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
