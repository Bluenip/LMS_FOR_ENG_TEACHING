import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { createLessonSchema } from "@/lib/validators";
import { createLesson, listLibraryLessons } from "@/server/lessonService";

/** Lesson library of the signed-in teacher (admins: every teacher's lessons). */
export async function GET() {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const lessons = await listLibraryLessons(user);
    return NextResponse.json({ lessons });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = createLessonSchema.parse(await req.json());
    const lesson = await createLesson(user.id, data);
    return NextResponse.json({ lesson }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
