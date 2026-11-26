import { NextResponse } from "next/server";
import { AppError, handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { uploadQuickAssignmentAttachment } from "@/server/assignmentService";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const classId = formData.get("classId");
    const file = formData.get("file");
    if (typeof classId !== "string" || !classId.trim()) {
      throw new AppError("Vui lòng chọn lớp học.", 400, "MISSING_CLASS");
    }
    await requireTeacherOfClass(classId.trim(), "CO_TEACHER");
    if (!(file instanceof File)) {
      throw new AppError("Vui lòng chọn file để tải lên.", 400, "NO_FILE");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await uploadQuickAssignmentAttachment(classId.trim(), {
      buffer,
      originalName: file.name || "attachment",
      mimeType: file.type || "application/octet-stream",
    });
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
