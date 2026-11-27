import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/permissions";
import { resetPasswordSchema } from "@/lib/validators";
import { completePasswordReset } from "@/server/passwordResetService";

export async function POST(req: Request) {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(await req.json());
    const result = await completePasswordReset(token, newPassword);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
