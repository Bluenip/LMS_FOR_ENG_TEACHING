import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { createWorksheetSchema } from "@/lib/validators";
import {
  createWorksheet,
  listSharedWorksheets,
  listTeacherWorksheets,
} from "@/server/worksheetService";

export async function GET() {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const isAdmin = user.role === "ADMIN";
    const [worksheets, sharedWorksheets] = await Promise.all([
      listTeacherWorksheets(user.id),
      // an admin sees every other teacher's worksheet, shared or not
      listSharedWorksheets(user.id, { all: isAdmin }),
    ]);
    return NextResponse.json({ worksheets, sharedWorksheets, isAdmin });
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
