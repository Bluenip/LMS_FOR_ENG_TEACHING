import { NextResponse } from "next/server";
import { z } from "zod";
import { assertDriveOrigin } from "@/lib/drive/google-drive";
import { handleApiError, requireRole } from "@/lib/permissions";
import {
  backupAllWorksheetsToDrive,
  backupWorksheetToDrive,
} from "@/server/driveService";

const backupSchema = z.object({
  worksheetId: z.string().min(1).optional(),
  all: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    assertDriveOrigin(req);
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const body = await req.json();
    const parsed = backupSchema.parse(body);

    const result = parsed.all
      ? await backupAllWorksheetsToDrive(user)
      : parsed.worksheetId
        ? await backupWorksheetToDrive(user, parsed.worksheetId)
        : null;

    if (!result) {
      return NextResponse.json(
        { error: "Missing worksheetId or all=true", code: "BAD_REQUEST" },
        { status: 400 }
      );
    }

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
