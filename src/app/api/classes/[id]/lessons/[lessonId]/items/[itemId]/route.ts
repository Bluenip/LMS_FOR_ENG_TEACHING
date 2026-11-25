import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { trashLessonItem } from "@/server/trashService";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string; lessonId: string; itemId: string }> }
) {
  try {
    const { id, lessonId, itemId } = await context.params;
    const { user } = await requireTeacherOfClass(id);
    // the lesson must be shown in this class
    const link = await prisma.classLesson.findUnique({
      where: { classId_lessonId: { classId: id, lessonId } },
      select: { id: true },
    });
    if (!link) throw new AppError("Không tìm thấy chương bài giảng.", 404, "NOT_FOUND");
    await trashLessonItem(user, lessonId, itemId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
