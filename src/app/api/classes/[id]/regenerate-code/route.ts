import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { regenerateClassJoinCode } from "@/server/classService";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id);
    const cls = await regenerateClassJoinCode(id);
    return NextResponse.json({ joinCode: cls.joinCode });
  } catch (error) {
    return handleApiError(error);
  }
}
