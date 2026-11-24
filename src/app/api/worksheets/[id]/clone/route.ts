import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { cloneWorksheetForTeacher } from "@/server/worksheetTransferService";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { id } = await context.params;
    const worksheet = await cloneWorksheetForTeacher(id, user.id);
    return NextResponse.json({ worksheet }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
