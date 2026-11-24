import { NextResponse } from "next/server";
import { z } from "zod";
import { assertDriveOrigin } from "@/lib/drive/google-drive";
import { handleApiError, requireRole } from "@/lib/permissions";
import { updateDriveConnectionSettings } from "@/server/driveService";

const settingsSchema = z.object({
  scope: z.enum(["shared", "personal"]),
  allowPublicLessonVideos: z.boolean().optional(),
  autoBackupEnabled: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  try {
    assertDriveOrigin(req);
    const user = await requireRole(["ADMIN", "TEACHER"]);
    const body = await req.json();
    const parsed = settingsSchema.parse(body);
    const updated = await updateDriveConnectionSettings(user, parsed);
    return NextResponse.json(updated, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
