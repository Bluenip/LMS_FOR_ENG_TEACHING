import { NextResponse } from "next/server";
import { AppError, handleApiError, requireTeacherOfWorksheet } from "@/lib/permissions";
import {
  deleteFieldIllustrationImage,
  uploadFieldIllustrationImage,
} from "@/server/worksheetService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfWorksheet(id);

    const formData = await req.formData();
    const file = formData.get("file");
    const fieldIdRaw = formData.get("fieldId");
    const fieldId = typeof fieldIdRaw === "string" && fieldIdRaw.trim() ? fieldIdRaw.trim() : null;

    if (!(file instanceof File)) {
      throw new AppError("Vui lòng chọn file ảnh hợp lệ (PNG, JPG hoặc WebP).", 400, "MISSING_FILE");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFieldIllustrationImage(id, fieldId, buffer, file.type);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfWorksheet(id);

    const url = new URL(req.url);
    const fieldId = url.searchParams.get("fieldId");
    const imageKey = url.searchParams.get("imageKey");

    const result = await deleteFieldIllustrationImage(id, fieldId, imageKey);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
