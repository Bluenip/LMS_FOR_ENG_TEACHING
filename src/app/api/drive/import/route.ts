import { NextResponse } from "next/server";
import { z } from "zod";
import { assertDriveOrigin } from "@/lib/drive/google-drive";
import { handleApiError, requireRole } from "@/lib/permissions";
import { importWorksheetFromDrive } from "@/server/driveService";

const importSchema = z.object({
  driveFileId: z.string().trim().min(1).max(200),
  fileName: z.string().trim().max(260).optional(),
  mimeType: z.string().trim().max(200).optional(),
});

export async function POST(req: Request) {
  try {
    assertDriveOrigin(req);
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const body = await req.json();
    const parsed = importSchema.parse(body);
    const result = await importWorksheetFromDrive(user, parsed);
    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
