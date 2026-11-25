import { NextResponse } from "next/server";
import {
  handleApiError,
  requireMemberOfClass,
  requireTeacherOfClass,
} from "@/lib/permissions";
import { addLessonsToClassSchema, createLessonSchema } from "@/lib/validators";
import { addLessonsToClass, createLesson, listClassLessons } from "@/server/lessonService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireMemberOfClass(id);
    const lessons = await listClassLessons(id);
    return NextResponse.json({ lessons });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Body `{ title, description }`: creates a new lesson in the teacher's library and shows it here.
 * Body `{ lessonIds }`: shows existing library lessons in this class.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user } = await requireTeacherOfClass(id);
    const body = (await req.json()) as Record<string, unknown>;
    if (Array.isArray(body.lessonIds)) {
      const { lessonIds } = addLessonsToClassSchema.parse(body);
      const result = await addLessonsToClass(user, id, lessonIds);
      return NextResponse.json(result, { status: 201 });
    }
    const data = createLessonSchema.parse(body);
    const lesson = await createLesson(user.id, data, { classId: id });
    return NextResponse.json({ lesson }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
