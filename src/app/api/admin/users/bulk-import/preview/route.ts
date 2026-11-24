import { NextResponse } from "next/server";
import { AppError, handleApiError, requireRole } from "@/lib/permissions";
import { BULK_IMPORT_MAX_BYTES, previewBulkUserImport } from "@/server/bulkImportService";

export async function POST(req: Request) {
  try {
    await requireRole(["ADMIN"]);
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("Vui lòng chọn file Excel (.xlsx).", 400, "EMPTY_FILE");
    }
    if (file.size > BULK_IMPORT_MAX_BYTES) {
      throw new AppError("File Excel không được vượt quá 5MB.", 400, "FILE_TOO_LARGE");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const preview = await previewBulkUserImport(buffer);
    return NextResponse.json(preview);
  } catch (error) {
    return handleApiError(error);
  }
}
