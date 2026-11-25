import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { removeLessonFromClass } from "@/server/lessonService";

/** Removes the lesson from this class only; it stays in the library (delete it there). */
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; lessonId: string }> }
) {
  try {
    const { id, lessonId } = await context.params;
    await requireTeacherOfClass(id);
    await removeLessonFromClass(id, lessonId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
