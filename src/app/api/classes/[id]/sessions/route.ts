import { NextResponse } from "next/server";
import { handleApiError, requireMemberOfClass, requireTeacherOfClass } from "@/lib/permissions";
import { createMakeupSessionSchema } from "@/lib/validators";
import { createMakeupSession, listClassSessions } from "@/server/scheduleService";
import { AppError } from "@/lib/errors";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const { user, isTeacher } = await requireMemberOfClass(id);
    const url = new URL(req.url);
    const fromStr = url.searchParams.get("from");
    const toStr = url.searchParams.get("to");
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      throw new AppError("Khoảng ngày không hợp lệ.", 400, "VALIDATION_ERROR");
    }

    const sessions = await listClassSessions(id, {
      from,
      to,
      viewerStudentId: isTeacher ? undefined : user.id,
    });
    return NextResponse.json({ sessions });
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
    const { user } = await requireTeacherOfClass(id, "CO_TEACHER");
    const body = await req.json();
    const parsed = createMakeupSessionSchema.parse(body);
    const session = await createMakeupSession(id, parsed, user.id);
    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
