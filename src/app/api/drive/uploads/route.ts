import { NextResponse } from "next/server";
import { appOrigin, assertDriveOrigin } from "@/lib/drive/google-drive";
import { handleApiError, requireRole } from "@/lib/permissions";
import { initDirectDriveUpload } from "@/server/driveService";

export async function POST(req: Request) {
  try {
    assertDriveOrigin(req);
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const body = await req.json();
    const result = await initDirectDriveUpload(user, appOrigin(req), body);
    return NextResponse.json(result, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
