import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { assignWorkbookSchema } from "@/lib/validators";
import { assignWorkbookToClass } from "@/server/workbookService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = assignWorkbookSchema.parse(await req.json());
    const assignments = await assignWorkbookToClass(
      id,
      { id: user.id, role: user.role },
      data
    );
    return NextResponse.json({ assignments }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
