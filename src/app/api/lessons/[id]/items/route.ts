import { NextResponse } from "next/server";
import { AppError, handleApiError, requireRole } from "@/lib/permissions";
import { createLessonItemSchema } from "@/lib/validators";
import { createLessonItem, readLessonItemRequest, requireEditableLesson } from "@/server/lessonService";

/** Adds a material (uploaded file or link) to a library lesson. */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { id } = await context.params;
    await requireEditableLesson(user, id);
    const data = createLessonItemSchema.parse(await readLessonItemRequest(req, user, id));
    if (!data.fileKey && !data.url) {
      throw new AppError("Vui lòng tải file lên hoặc nhập đường dẫn URL.", 400, "MISSING_CONTENT");
    }
    const item = await createLessonItem(user, id, data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
