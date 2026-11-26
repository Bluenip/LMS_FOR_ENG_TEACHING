import { NextResponse } from "next/server";
import { AppError, handleApiError, requireTeacherOfWorksheet } from "@/lib/permissions";
import { uploadWorksheetBackgroundImages } from "@/server/worksheetService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfWorksheet(id);

    const formData = await req.formData();
    const rawFiles = [...formData.getAll("files"), ...formData.getAll("file")].filter(
      (item): item is File => item instanceof File
    );

    if (rawFiles.length === 0) {
      throw new AppError("Vui lòng chọn từ 1 đến 30 ảnh trang đề.", 400, "MISSING_FILE");
    }

    const files = await Promise.all(
      rawFiles.map(async (f) => ({
        buffer: Buffer.from(await f.arrayBuffer()),
        mimeType: f.type,
      }))
    );

    const worksheet = await uploadWorksheetBackgroundImages(id, files);
    return NextResponse.json({ worksheet });
  } catch (error) {
    return handleApiError(error);
  }
}
