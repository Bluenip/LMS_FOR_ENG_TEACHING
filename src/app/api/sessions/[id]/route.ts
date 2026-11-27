import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { handleApiError, requireMemberOfClass, requireTeacherOfClass } from "@/lib/permissions";
import { updateClassSessionSchema } from "@/lib/validators";
import {
  deleteClassSession,
  getClassSessionDetail,
  updateClassSession,
} from "@/server/scheduleService";

async function lookupSessionClassId(sessionId: string): Promise<string> {
  const s = await prisma.classSession.findUnique({
    where: { id: sessionId },
    select: { classId: true },
  });
  if (!s) throw new AppError("Không tìm thấy buổi học.", 404, "NOT_FOUND");
  return s.classId;
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const classId = await lookupSessionClassId(id);
    const { user, isTeacher } = await requireMemberOfClass(classId);
    const session = await getClassSessionDetail(id, {
      isTeacher,
      viewerStudentId: isTeacher ? undefined : user.id,
    });
    return NextResponse.json({ session });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const classId = await lookupSessionClassId(id);
    const { user } = await requireTeacherOfClass(classId, "CO_TEACHER");
    const body = await req.json();
    const parsed = updateClassSessionSchema.parse(body);
    const updated = await updateClassSession(id, parsed, user.id);
    return NextResponse.json({ session: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const classId = await lookupSessionClassId(id);
    const { user } = await requireTeacherOfClass(classId, "CO_TEACHER");
    const res = await deleteClassSession(id, user.id);
    return NextResponse.json(res);
  } catch (error) {
    return handleApiError(error);
  }
}
