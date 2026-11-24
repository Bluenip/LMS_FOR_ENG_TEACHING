import { NextResponse } from "next/server";
import { AppError, handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { importStudentsFromExcel } from "@/server/classService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id);
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("Vui lòng chọn file Excel (.xlsx).", 400, "MISSING_FILE");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new AppError("File Excel không được vượt quá 5MB.", 400, "FILE_TOO_LARGE");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importStudentsFromExcel(id, buffer);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
