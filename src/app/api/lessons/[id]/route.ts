import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { updateLessonSchema } from "@/lib/validators";
import { deleteLessonEverywhere, updateLesson } from "@/server/lessonService";

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { id } = await context.params;
    const data = updateLessonSchema.parse(await req.json());
    const lesson = await updateLesson(user, id, data);
    return NextResponse.json({ lesson });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Deletes the lesson from the library and from every class that shows it. */
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { id } = await context.params;
    await deleteLessonEverywhere(user, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
