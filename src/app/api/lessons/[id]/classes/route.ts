import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { lessonClassesSchema } from "@/lib/validators";
import { setLessonClasses } from "@/server/lessonService";

/** Sets which of the teacher's classes show this lesson (adds new, removes unchecked). */
export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { id } = await context.params;
    const { classIds } = lessonClassesSchema.parse(await req.json());
    const result = await setLessonClasses(user, id, classIds);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
