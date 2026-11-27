import { NextResponse } from "next/server";
import { handleApiError, requireTeacherOfClass } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { behaviorPresetSchema } from "@/lib/validators";
import {
  createBehaviorPreset,
  deleteBehaviorPreset,
  listBehaviorPresets,
} from "@/server/behaviorPointService";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "ASSISTANT");
    return NextResponse.json({ presets: await listBehaviorPresets(id) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "CO_TEACHER");
    const data = behaviorPresetSchema.parse(await req.json());
    return NextResponse.json({ preset: await createBehaviorPreset(id, data) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request, context: Ctx) {
  try {
    const { id } = await context.params;
    await requireTeacherOfClass(id, "CO_TEACHER");
    const presetId = new URL(req.url).searchParams.get("presetId");
    if (!presetId) throw new AppError("Không tìm thấy mẫu điểm cộng.", 404, "NOT_FOUND");
    return NextResponse.json(await deleteBehaviorPreset(id, presetId));
  } catch (error) {
    return handleApiError(error);
  }
}
