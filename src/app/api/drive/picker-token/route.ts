import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { getPickerTokenForUser } from "@/server/driveService";

export async function GET() {
  try {
    const user = await requireRole(["TEACHER", "ADMIN"]);
    const token = await getPickerTokenForUser(user);
    return NextResponse.json(token, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
