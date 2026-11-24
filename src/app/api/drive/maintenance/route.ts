import { NextResponse } from "next/server";
import { assertDriveOrigin } from "@/lib/drive/google-drive";
import { handleApiError, requireRole } from "@/lib/permissions";
import { pruneDrive } from "@/server/driveService";

export async function POST(req: Request) {
  try {
    assertDriveOrigin(req);
    await requireRole(["ADMIN"]);
    const result = await pruneDrive();
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
