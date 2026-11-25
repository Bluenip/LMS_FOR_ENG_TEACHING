import type { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";

export const { POST } = handlers;

export async function GET(req: NextRequest) {
  const res = await handlers.GET(req);
  const path = req.nextUrl.pathname;
  // Background <SessionProvider> polls (/session, /providers) must not mint a competing
  // csrf-token cookie that overwrites the one just issued by GET /api/auth/csrf during signIn/signOut.
  if (path.endsWith("/session") || path.endsWith("/providers")) {
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.some((c) => c.includes("csrf-token="))) {
      const headers = new Headers(res.headers);
      headers.delete("set-cookie");
      for (const c of setCookies) {
        if (!c.includes("csrf-token=")) {
          headers.append("set-cookie", c);
        }
      }
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
    }
  }
  return res;
}
