import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { deleteLessonItem } from "@/server/lessonService";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; lessonId: string; itemId: string }> }
) {
  try {
    const { id, lessonId, itemId } = await context.params;
    await requireTeacherOfClass(id);
    await deleteLessonItem(id, lessonId, itemId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
