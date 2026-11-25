import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { deleteLessonItem } from "@/server/lessonService";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; lessonId: string; itemId: string }> }
) {
  try {
    const { id, lessonId, itemId } = await context.params;
    const { user } = await requireTeacherOfClass(id);
    await deleteLessonItem(user, lessonId, itemId, { classId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
