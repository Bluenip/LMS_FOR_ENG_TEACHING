import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { getClassAnalytics } from "@/server/classService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    const analytics = await getClassAnalytics(id);
    return NextResponse.json({ analytics });
  } catch (error) {
    return handleApiError(error);
  }
}
