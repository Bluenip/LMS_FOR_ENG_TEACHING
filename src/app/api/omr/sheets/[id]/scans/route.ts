import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { OMR_SCAN_MAX_BYTES, getOmrSheetDetail, saveOmrScanResult } from "@/server/omrService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const detail = await getOmrSheetDetail(id, user);
    return NextResponse.json({ scans: detail.scans });
  } catch (error) {
    return handleApiError(error);
  }
}

/** multipart/form-data: `image` (flattened JPG/PNG sheet) + `readings` (JSON of bubble readings). */
export async function POST(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const form = await req.formData();
    const image = form.get("image");
    const readingsRaw = form.get("readings");
    if (!(image instanceof File) || typeof readingsRaw !== "string") {
      throw new AppError("Thiếu ảnh phiếu hoặc dữ liệu ô tô.", 400, "VALIDATION_ERROR");
    }
    if (image.size > OMR_SCAN_MAX_BYTES) throw new AppError("Ảnh phiếu tối đa 8MB.", 400, "OMR_IMAGE_TOO_LARGE");
    if (readingsRaw.length > 200_000) throw new AppError("Câu trả lời không hợp lệ.", 400, "VALIDATION_ERROR");
    let readings: unknown;
    try {
      readings = JSON.parse(readingsRaw);
    } catch {
      throw new AppError("Câu trả lời không hợp lệ.", 400, "VALIDATION_ERROR");
    }
    const buffer = Buffer.from(await image.arrayBuffer());
    const result = await saveOmrScanResult(id, user, { scanImageBuffer: buffer, rawBubbles: readings });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
