import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/permissions";
import { completeDriveOAuthCallback, OAUTH_COOKIE_NAME } from "@/server/driveService";

export async function GET(req: NextRequest) {
  let user = null;
  try {
    user = await requireAuth();
  } catch {
    user = null;
  }

  const rawCookie = req.cookies.get(OAUTH_COOKIE_NAME)?.value;
  const { redirectTo } = await completeDriveOAuthCallback(req, user, rawCookie);

  const res = NextResponse.redirect(redirectTo, 302);
  res.headers.set("Cache-Control", "private, no-store");
  res.cookies.set(OAUTH_COOKIE_NAME, "", {
    path: "/api/drive",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
  });
  return res;
}
