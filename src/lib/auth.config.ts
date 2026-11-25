import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

function resolvePublicOrigin(baseUrl: string): string {
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
  return baseUrl;
}

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
  callbacks: {
    redirect({ url, baseUrl }) {
      const origin = baseUrl.includes("0.0.0.0") ? resolvePublicOrigin(baseUrl) : baseUrl;
      if (url.startsWith("/")) return `${origin}${url}`;
      try {
        const parsed = new URL(url);
        if (parsed.hostname === "0.0.0.0") {
          return `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
        }
        if (parsed.origin === origin || parsed.origin === baseUrl) return url;
      } catch {
        // invalid url -> fall back to origin
      }
      return origin;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: Role }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        // when this JWT was issued (seconds): compared with User.passwordChangedAt on the server
        session.user.issuedAt = typeof token.iat === "number" ? token.iat : undefined;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
