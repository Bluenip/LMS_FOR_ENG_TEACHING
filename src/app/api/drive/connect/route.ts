import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { beginDriveOAuth, OAUTH_COOKIE_NAME } from "@/server/driveService";

export async function GET(req: Request) {
  try {
    const user = await requireRole(["ADMIN", "TEACHER"]);
    const url = new URL(req.url);
    const scopeParam = url.searchParams.get("scope");
    const scope: "shared" | "personal" =
      scopeParam === "personal" || user.role === "TEACHER" ? "personal" : "shared";

    const { authUrl, cookieValue, secure } = beginDriveOAuth(req, user, scope);

    const res = NextResponse.redirect(authUrl, 302);
    res.headers.set("Cache-Control", "private, no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    res.cookies.set(OAUTH_COOKIE_NAME, cookieValue, {
      path: "/api/drive",
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: 600,
    });
    return res;
  } catch (error) {
    return handleApiError(error);
  }
}
