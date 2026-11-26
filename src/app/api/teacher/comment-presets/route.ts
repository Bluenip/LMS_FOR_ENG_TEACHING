import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { createCommentPresetSchema } from "@/lib/validators";
import { createCommentPreset, listCommentPresets } from "@/server/commentPresetService";

export async function GET() {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const presets = await listCommentPresets(user.id);
    return NextResponse.json({ presets });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const data = createCommentPresetSchema.parse(await req.json());
    const preset = await createCommentPreset(user.id, data);
    return NextResponse.json({ preset }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
