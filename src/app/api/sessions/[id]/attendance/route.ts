import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { saveAttendanceSchema } from "@/lib/validators";
import { getSessionAttendance, saveSessionAttendance } from "@/server/attendanceService";

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
    await requireTeacherOfClass(classId, "ASSISTANT");
    const data = await getSessionAttendance(id);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const classId = await lookupSessionClassId(id);
    const { user } = await requireTeacherOfClass(classId, "ASSISTANT");
    const body = await req.json();
    const parsed = saveAttendanceSchema.parse(body);
    const data = await saveSessionAttendance(id, parsed.records, user.id);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
