import { NextResponse } from "next/server";
import { AppError, handleApiError, requireRole } from "@/lib/permissions";
import { importWorksheetFile } from "@/server/worksheetTransferService";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new AppError(
        "Vui lòng chọn file backup (.zip / .json) hoặc file Word (.docx).",
        400,
        "MISSING_FILE"
      );
    }

    const titleRaw = formData.get("title");
    const pointsRaw = formData.get("defaultPoints");
    const defaultPoints =
      typeof pointsRaw === "string" && pointsRaw.trim() !== ""
        ? Number(pointsRaw)
        : undefined;

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await importWorksheetFile(user.id, buffer, file.name, {
      title: typeof titleRaw === "string" ? titleRaw : undefined,
      defaultPoints: Number.isFinite(defaultPoints) ? defaultPoints : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
