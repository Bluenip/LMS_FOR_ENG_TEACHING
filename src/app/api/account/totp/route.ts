import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { getAdminTotpStatus } from "@/server/totpService";

export async function GET() {
  try {
    const user = await requireRole(["ADMIN"]);
    const status = await getAdminTotpStatus(user.id);
    return NextResponse.json(status);
  } catch (error) {
    return handleApiError(error);
  }
}
