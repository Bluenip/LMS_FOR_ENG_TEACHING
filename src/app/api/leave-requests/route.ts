import { NextResponse } from "next/server";
import type { LeaveRequestStatus } from "@prisma/client";
import { handleApiError, requireAuth, requireRole, requireTeacherOfClass } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { leaveRequestSchema } from "@/lib/validators";
import { createLeaveRequest, listLeaveRequestsForClass, listUpcomingSessionsForChild } from "@/server/leaveRequestService";

/** Parent: ?studentId= → upcoming sessions + own requests. Teacher: ?classId= → requests of the class. */
export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const sp = new URL(req.url).searchParams;
    if (user.role === "PARENT") {
      const studentId = sp.get("studentId");
      if (!studentId) throw new AppError("Không tìm thấy học sinh.", 404, "NOT_FOUND");
      return NextResponse.json({ sessions: await listUpcomingSessionsForChild(user.id, studentId) });
    }
    const classId = sp.get("classId");
    if (!classId) throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
    await requireTeacherOfClass(classId, "ASSISTANT");
    const status = sp.get("status");
    return NextResponse.json({
      requests: await listLeaveRequestsForClass(classId, status === "PENDING" || status === "APPROVED" || status === "REJECTED" ? (status as LeaveRequestStatus) : null),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["PARENT"]);
    const data = leaveRequestSchema.parse(await req.json());
    return NextResponse.json(await createLeaveRequest(user.id, data), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
