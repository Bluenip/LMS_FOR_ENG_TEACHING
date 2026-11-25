import { NextResponse } from "next/server";
import { AppError, handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { createLessonItemSchema } from "@/lib/validators";
import { createLessonItem, readLessonItemRequest, requireEditableLesson } from "@/server/lessonService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; lessonId: string }> }
) {
  try {
    const { id, lessonId } = await context.params;
    const { user } = await requireTeacherOfClass(id);
    await requireEditableLesson(user, lessonId);
    const data = createLessonItemSchema.parse(
      await readLessonItemRequest(req, user, lessonId, { classId: id })
    );
    if (!data.fileKey && !data.url) {
      throw new AppError("Vui lòng tải file lên hoặc nhập đường dẫn URL.", 400, "MISSING_CONTENT");
    }
    const item = await createLessonItem(user, lessonId, data, { classId: id });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
