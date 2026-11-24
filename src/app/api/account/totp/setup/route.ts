import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { beginAdminTotpSetup } from "@/server/totpService";

export async function POST() {
  try {
    const user = await requireRole(["ADMIN"]);
    const setup = await beginAdminTotpSetup(user.id);
    return NextResponse.json(setup, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
