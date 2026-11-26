import { NextResponse } from "next/server";
import { AppError, handleApiError, requireRole } from "@/lib/permissions";
import { parseWordExamText } from "@/lib/worksheet/word-exam-parser";
import { parseWordExamFile } from "@/server/worksheetTransferService";

export async function POST(req: Request) {
  try {
    await requireRole(["TEACHER", "ADMIN"]);
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      const defaultPoints = Number(formData.get("defaultPoints") ?? "1") || 1;
      const startNumber = Number(formData.get("startNumber") ?? "1") || 1;

      if (!(file instanceof File)) {
        throw new AppError("Vui lòng chọn file Word (.docx) hoặc .txt.", 400, "MISSING_FILE");
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const { parsed } = await parseWordExamFile(buffer, file.name, {
        defaultPoints,
        startNumber,
      });
      return NextResponse.json({
        filename: file.name,
        suggestedTitle: file.name.replace(/\.(docx|txt|md)$/i, "").trim(),
        ...parsed,
      });
    }

    const body = (await req.json()) as {
      text?: string;
      defaultPoints?: number;
      startNumber?: number;
    };
    if (!body.text || typeof body.text !== "string") {
      throw new AppError("Vui lòng nhập nội dung câu hỏi.", 400, "MISSING_TEXT");
    }
    const parsed = parseWordExamText(body.text, {
      defaultPoints: body.defaultPoints,
      startNumber: body.startNumber,
    });
    return NextResponse.json(parsed);
  } catch (error) {
    return handleApiError(error);
  }
}
