import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { createWorksheetSchema } from "@/lib/validators";
import {
  createWorksheet,
  listTeacherWorksheets,
} from "@/server/worksheetService";

export async function GET() {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const worksheets = await listTeacherWorksheets(user.id);
    return NextResponse.json({ worksheets });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const body = await req.json();
    const data = createWorksheetSchema.parse(body);
    const worksheet = await createWorksheet(user.id, data);
    return NextResponse.json({ worksheet }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
