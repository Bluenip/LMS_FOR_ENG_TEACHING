import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfAssignment } from "@/lib/permissions";
import { listPreChecksForAssignment } from "@/server/preCheckService";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await requireTeacherOfAssignment(id);
    return NextResponse.json({ students: await listPreChecksForAssignment(id) });
  } catch (error) {
    return handleApiError(error);
  }
}
