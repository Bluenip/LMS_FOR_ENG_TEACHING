import { NextResponse } from "next/server";
import type { DriveFileKind } from "@prisma/client";
import { handleApiError, requireRole } from "@/lib/permissions";
import { listDriveFilesForUser } from "@/server/driveService";

const VALID_KINDS = new Set<DriveFileKind>([
  "WORKSHEET_PDF",
  "WORKSHEET_AUDIO",
  "WORD_SOURCE",
  "BACKUP",
  "LESSON_FILE",
  "SUBMISSION_FILE",
]);

export async function GET(req: Request) {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const url = new URL(req.url);
    const kindParam = url.searchParams.get("kind") as DriveFileKind | null;
    const kind = kindParam && VALID_KINDS.has(kindParam) ? kindParam : undefined;
    const query = url.searchParams.get("q") ?? undefined;
    const remote = url.searchParams.get("remote") === "1";

    const result = await listDriveFilesForUser(user, { kind, query, remote });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
