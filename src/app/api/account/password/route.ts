import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { checkRateLimit } from "@/lib/rate-limit";
import { AppError } from "@/lib/errors";
import { changePasswordSchema } from "@/lib/validators";
import { changeOwnPassword } from "@/server/accountService";

export async function POST(req: Request) {
  try {
    const me = await requireAuth();
    const limit = checkRateLimit(`change-password:${me.id}`, 10, 15 * 60 * 1000);
    if (!limit.allowed) throw new AppError("Bạn thử quá nhiều lần. Vui lòng thử lại sau.", 429, "RATE_LIMITED");
    const { currentPassword, newPassword } = changePasswordSchema.parse(await req.json());
    return NextResponse.json(await changeOwnPassword(me.id, currentPassword, newPassword));
  } catch (error) {
    return handleApiError(error);
  }
}
