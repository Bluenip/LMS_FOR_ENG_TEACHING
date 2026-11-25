import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { updateLessonSchema } from "@/lib/validators";
import { updateLesson } from "@/server/lessonService";
import { trashLesson } from "@/server/trashService";

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

/** Moves the lesson to the trash (hidden from every class; restorable for 30 days). */
export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { id } = await context.params;
    await trashLesson(user, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
