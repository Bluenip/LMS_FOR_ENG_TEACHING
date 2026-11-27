import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { totpConfirmWithPasswordSchema } from "@/lib/validators";
import { disableAdminTotp } from "@/server/totpService";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["ADMIN", "TEACHER"]);
    const { password, code } = totpConfirmWithPasswordSchema.parse(await req.json());
    const result = await disableAdminTotp(user.id, password, code);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
