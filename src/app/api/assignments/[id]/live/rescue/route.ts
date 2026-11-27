import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfAssignment } from "@/lib/permissions";
import { liveRescueSchema } from "@/lib/validators";
import { grantEmergencyExtraTime, sendDirectExamMessage, unlockForDeviceSwitch } from "@/server/liveRescueService";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user } = await requireTeacherOfAssignment(id);
    const data = liveRescueSchema.parse(await req.json());
    if (data.action === "MESSAGE") return NextResponse.json(await sendDirectExamMessage(id, data.studentId, data.message, user.id));
    if (data.action === "EXTEND_TIME") return NextResponse.json(await grantEmergencyExtraTime(id, data.studentId, data.extraMin, user.id));
    return NextResponse.json(await unlockForDeviceSwitch(id, data.studentId, user.id));
  } catch (error) {
    return handleApiError(error);
  }
}
