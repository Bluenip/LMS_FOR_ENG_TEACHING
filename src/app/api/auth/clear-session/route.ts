import { NextRequest, NextResponse } from "next/server";

const ALLOWED_REASONS = new Set(["session", "locked", "role"]);

const SESSION_COOKIE_PREFIXES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

function getPublicOrigin(req: NextRequest): string {
  const fwdHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const fwdProto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (fwdHost && !fwdHost.startsWith("0.0.0.0")) {
    return `${fwdProto || "https"}://${fwdHost}`;
  }
  const host = req.headers.get("host")?.trim();
  if (host && !host.startsWith("0.0.0.0")) {
    const proto = fwdProto || (req.nextUrl.protocol.replace(":", "") || "http");
    return `${proto}://${host}`;
  }
  const configured =
    process.env.AUTH_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through
    }
  }
  return req.nextUrl.origin;
}

/**
 * Clears stale or revoked NextAuth session cookies and redirects to /login.
 * Used by Server Component layouts when the JWT user no longer exists or has been locked in DB.
 */
export async function GET(req: NextRequest) {
  const reasonParam = req.nextUrl.searchParams.get("reason");
  const target = new URL("/login", getPublicOrigin(req));
  if (reasonParam && ALLOWED_REASONS.has(reasonParam)) {
    target.searchParams.set("reason", reasonParam);
  }

  const res = NextResponse.redirect(target);

  const namesToClear = new Set<string>(SESSION_COOKIE_PREFIXES);
  for (const cookie of req.cookies.getAll()) {
    if (SESSION_COOKIE_PREFIXES.some((prefix) => cookie.name.startsWith(prefix))) {
      namesToClear.add(cookie.name);
    }
  }

  for (const name of namesToClear) {
    res.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-"),
    });
  }

  return res;
}
