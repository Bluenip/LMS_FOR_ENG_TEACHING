import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { totpConfirmWithPasswordSchema } from "@/lib/validators";
import { regenerateAdminBackupCodes } from "@/server/totpService";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { password, code } = totpConfirmWithPasswordSchema.parse(await req.json());
    const result = await regenerateAdminBackupCodes(user.id, password, code);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
