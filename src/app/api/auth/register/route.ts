import { NextResponse } from "next/server";

/**
 * Public self-registration is disabled: accounts are created by an admin (any role)
 * or by a teacher (students and parents of their classes).
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "Đăng ký tự do đã tắt. Vui lòng liên hệ giáo viên hoặc quản trị viên để được cấp tài khoản.",
      code: "REGISTRATION_DISABLED",
    },
    { status: 403 }
  );
}
