import { NextResponse } from "next/server";
import { assertDriveOrigin } from "@/lib/drive/google-drive";
import { handleApiError, requireRole } from "@/lib/permissions";
import { pruneDrive, trashDriveOrphans } from "@/server/driveService";
import { syncTrashWithDrive } from "@/server/trashService";

/**
 * Admin "run cleanup now": the same jobs that run every hour, plus the orphan scan.
 * Nothing is deleted forever: files only move to Google Drive's trash (restorable for 30 days).
 */
export async function POST(req: Request) {
  try {
    assertDriveOrigin(req);
    await requireRole(["ADMIN"]);
    const prune = await pruneDrive();
    const orphans = await trashDriveOrphans();
    const trashSync = await syncTrashWithDrive();
    return NextResponse.json(
      { ...prune, orphans, trashSync },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
