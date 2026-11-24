import { NextResponse } from "next/server";
import {
  handleApiError,
  requireMemberOfClass,
  requireTeacherOfClass,
} from "@/lib/permissions";
import { createLessonSchema } from "@/lib/validators";
import { createLesson, listClassLessons } from "@/server/lessonService";

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

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id);
    const body = await req.json();
    const data = createLessonSchema.parse(body);
    const lesson = await createLesson(id, data);
    return NextResponse.json({ lesson }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
