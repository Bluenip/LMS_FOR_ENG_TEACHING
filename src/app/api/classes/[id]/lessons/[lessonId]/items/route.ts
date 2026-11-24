import { NextResponse } from "next/server";
import { AppError, handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { createLessonItemSchema } from "@/lib/validators";
import { createLessonItem, uploadLessonAttachment } from "@/server/lessonService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string; lessonId: string }> }
) {
  try {
    const { id, lessonId } = await context.params;
    await requireTeacherOfClass(id);

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const title = String(formData.get("title") ?? "").trim();
      const type = String(formData.get("type") ?? "PDF").trim();
      const url = String(formData.get("url") ?? "").trim();
      const file = formData.get("file");

      let fileKey: string | null = null;
      if (file instanceof File && file.size > 0) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const uploaded = await uploadLessonAttachment(id, lessonId, buffer, file.type);
        fileKey = uploaded.fileKey;
      }

      const data = createLessonItemSchema.parse({
        title,
        type,
        url: url || null,
        fileKey,
      });

      if (!data.fileKey && !data.url) {
        throw new AppError("Vui lòng tải file lên hoặc nhập đường dẫn URL.", 400, "MISSING_CONTENT");
      }

      const item = await createLessonItem(id, lessonId, data);
      return NextResponse.json({ item }, { status: 201 });
    }

    const body = await req.json();
    const data = createLessonItemSchema.parse(body);
    const item = await createLessonItem(id, lessonId, data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
