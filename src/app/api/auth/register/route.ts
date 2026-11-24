import { NextResponse } from "next/server";
import { handleApiError, AppError } from "@/lib/permissions";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { registerSchema } from "@/lib/validators";
import { registerUser } from "@/server/authService";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req.headers);
    const limit = checkRateLimit(`register:${ip}`, 20, 15 * 60 * 1000);
    if (!limit.allowed) {
      throw new AppError(
        `Bạn đã đăng ký quá nhiều lần. Vui lòng thử lại sau ${limit.retryAfterSec} giây.`,
        429,
        "RATE_LIMITED"
      );
    }

    const body = await req.json();
    const data = registerSchema.parse(body);
    const user = await registerUser(data);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
