import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
  callbacks: {
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
