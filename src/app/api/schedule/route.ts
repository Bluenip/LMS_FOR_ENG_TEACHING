import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { listScheduleForStudent, listScheduleForStudent as _stu, listScheduleForTeacher } from "@/server/scheduleService";

void _stu;

export async function GET(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN", "STUDENT"]);
    const url = new URL(req.url);
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 14 * 86_400_000);
    const defaultTo = new Date(now.getTime() + 45 * 86_400_000);

    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const classId = url.searchParams.get("classId") || undefined;

    const from = fromParam ? new Date(fromParam) : defaultFrom;
    const to = toParam ? new Date(toParam) : defaultTo;
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new AppError("Khoảng ngày không hợp lệ.", 400, "VALIDATION_ERROR");
    }

    if (user.role === "STUDENT") {
      const data = await listScheduleForStudent(user.id, { from, to }, classId);
      return NextResponse.json({ ...data, role: "STUDENT" as const });
    }

    const data = await listScheduleForTeacher(
      user.id,
      user.role === "ADMIN",
      { from, to },
      classId
    );
    return NextResponse.json({ ...data, role: user.role });
  } catch (error) {
    return handleApiError(error);
  }
}
