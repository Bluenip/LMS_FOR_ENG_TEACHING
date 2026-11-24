import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { proctorEventSchema } from "@/lib/validators";
import { recordProctorEvent } from "@/server/proctorService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["STUDENT"]);
    const { id } = await context.params;
    const body = await req.json();
    const data = proctorEventSchema.parse(body);
    const result = await recordProctorEvent(id, user.id, data);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
