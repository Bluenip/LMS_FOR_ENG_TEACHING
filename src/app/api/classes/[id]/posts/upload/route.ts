import { NextResponse } from "next/server";
import { AppError, handleApiError, requireMemberOfClass } from "@/lib/permissions";
import { uploadPostAttachment } from "@/server/postService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireMemberOfClass(id);
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError("Vui lòng chọn file để tải lên.", 400, "NO_FILE");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await uploadPostAttachment(id, {
      buffer,
      originalName: file.name || "file",
      mimeType: file.type || "application/octet-stream",
    });
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
