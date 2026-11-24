import { NextResponse } from "next/server";
import { handleApiError, requireParentOf } from "@/lib/permissions";
import { getChildOverviewForParent } from "@/server/parentService";

export async function GET(
  req: Request,
  context: { params: Promise<{ studentId: string }> }
) {
  try {
    const { studentId } = await context.params;
    await requireParentOf(studentId);
    const url = new URL(req.url);
    const classId = url.searchParams.get("classId") ?? undefined;
    const overview = await getChildOverviewForParent(studentId, classId);
    return NextResponse.json(overview);
  } catch (error) {
    return handleApiError(error);
  }
}
