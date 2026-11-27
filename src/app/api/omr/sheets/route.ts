import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { createOmrSheetSchema } from "@/lib/validators";
import { createOmrExamSheet, listOmrSheets } from "@/server/omrService";

export async function GET(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const classId = new URL(req.url).searchParams.get("classId");
    if (!classId) throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
    return NextResponse.json({ sheets: await listOmrSheets(user, classId) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = createOmrSheetSchema.parse(await req.json());
    return NextResponse.json(await createOmrExamSheet(user, data), { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
