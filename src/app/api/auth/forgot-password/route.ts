import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/permissions";
import { getClientIp } from "@/lib/rate-limit";
import { forgotPasswordSchema } from "@/lib/validators";
import { requestPasswordReset } from "@/server/passwordResetService";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email } = forgotPasswordSchema.parse(body);
    const ip = getClientIp(req.headers);
    const origin = new URL(req.url).origin;
    const result = await requestPasswordReset(email, ip, { appOrigin: origin });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
