import { NextResponse } from "next/server";
import { AppError, handleApiError, requireTeacherOfWorksheet } from "@/lib/permissions";
import { uploadWorksheetPdf } from "@/server/worksheetService";
import { getStorageLocationsForKeys } from "@/server/driveService";

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
    const locations = worksheet.pdfFileKey
      ? await getStorageLocationsForKeys([worksheet.pdfFileKey])
      : {};
    return NextResponse.json({
      worksheet,
      storageLocation: worksheet.pdfFileKey ? (locations[worksheet.pdfFileKey] ?? "local") : "local",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
