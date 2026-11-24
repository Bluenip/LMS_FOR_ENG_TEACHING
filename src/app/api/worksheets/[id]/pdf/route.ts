import { NextResponse } from "next/server";
import { AppError, handleApiError, requireTeacherOfWorksheet } from "@/lib/permissions";
import { uploadWorksheetPdf } from "@/server/worksheetService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfWorksheet(id);
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("Vui lòng chọn file PDF để tải lên.", 400, "MISSING_FILE");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const worksheet = await uploadWorksheetPdf(id, buffer, file.type);
    return NextResponse.json({ worksheet });
  } catch (error) {
    return handleApiError(error);
  }
}
