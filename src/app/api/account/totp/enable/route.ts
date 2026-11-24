import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { totpEnableSchema } from "@/lib/validators";
import { confirmEnableAdminTotp } from "@/server/totpService";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["ADMIN"]);
    const { code } = totpEnableSchema.parse(await req.json());
    const result = await confirmEnableAdminTotp(user.id, code);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
