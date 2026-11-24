import { NextResponse } from "next/server";
import { AppError, handleApiError, requireTeacherOfWorksheet } from "@/lib/permissions";
import { listWorksheetAudios, uploadWorksheetAudio } from "@/server/worksheetAudioService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await requireTeacherOfWorksheet(id);
    const audios = await listWorksheetAudios(id);
    return NextResponse.json({ audios });
  } catch (error) {
    return handleApiError(error);
  }
}

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
      throw new AppError("Vui lòng chọn file âm thanh để tải lên.", 400, "MISSING_FILE");
    }

    const titleRaw = formData.get("title");
    const durationRaw = formData.get("durationSec");
    const durationSec =
      typeof durationRaw === "string" && durationRaw.trim() !== ""
        ? Number(durationRaw)
        : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const audio = await uploadWorksheetAudio(id, {
      buffer,
      mimeType: file.type,
      originalFilename: file.name,
      title: typeof titleRaw === "string" ? titleRaw : undefined,
      durationSec: Number.isFinite(durationSec) ? durationSec : null,
    });
    return NextResponse.json({ audio }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
