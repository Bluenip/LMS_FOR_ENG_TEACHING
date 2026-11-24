import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { getDriveStatusForUser } from "@/server/driveService";

export async function GET(req: Request) {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const includeQuota = url.searchParams.get("quota") === "1";
    const status = await getDriveStatusForUser(user, { includeQuota });
    return NextResponse.json(status, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
