import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { createWorkbookSchema } from "@/lib/validators";
import { createWorkbook, listWorkbooks } from "@/server/workbookService";

export async function GET() {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const workbooks = await listWorkbooks(user.id, user.role === "ADMIN");
    return NextResponse.json({ workbooks });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = createWorkbookSchema.parse(await req.json());
    const workbook = await createWorkbook(user.id, user.role === "ADMIN", data);
    return NextResponse.json({ workbook }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
