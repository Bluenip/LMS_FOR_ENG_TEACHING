import { NextResponse } from "next/server";
import { assertDriveOrigin } from "@/lib/drive/google-drive";
import { handleApiError, requireRole } from "@/lib/permissions";
import { completeDirectDriveUpload } from "@/server/driveService";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertDriveOrigin(req);
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const result = await completeDirectDriveUpload(user, id, body);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
