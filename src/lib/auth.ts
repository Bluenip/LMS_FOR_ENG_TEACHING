import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { checkRateLimitAsync, getClientIp } from "@/lib/rate-limit";
import { verifyAdminTotpOrBackupCode } from "@/server/totpService";
import { evaluateGoogleSignIn, recordLoginSession } from "@/server/authSecurityService";

class AccountLockedError extends CredentialsSignin {
  code = "ACCOUNT_LOCKED";
}

class RateLimitedError extends CredentialsSignin {
  code = "RATE_LIMITED";
}

class TotpRequiredError extends CredentialsSignin {
  code = "TOTP_REQUIRED";
}

class TotpInvalidError extends CredentialsSignin {
  code = "TOTP_INVALID";
}

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  totpCode: z.string().trim().max(32).optional(),
});

const providers: NextAuthConfig["providers"] = [
  Credentials({
    name: "Email & Password",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Mật khẩu", type: "password" },
      totpCode: { label: "Mã xác thực 2 bước", type: "text" },
    },
    async authorize(credentials, request) {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const { email, password, totpCode } = parsed.data;

      const limit = await checkRateLimitAsync(`login:${email}`, 50, 15 * 60 * 1000);
      if (!limit.allowed) {
        throw new RateLimitedError();
      }

      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          passwordHash: true,
          avatarUrl: true,
          isLocked: true,
          deletedAt: true,
          totpEnabled: true,
        },
      });

      // accounts in the trash behave as if they no longer exist
      if (!user || user.deletedAt) return null;
      if (user.isLocked) {
        throw new AccountLockedError();
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return null;

      // Admin & Teacher 2FA (TOTP) enforcement
      if ((user.role === "ADMIN" || user.role === "TEACHER") && user.totpEnabled) {
        const cleanedCode = (totpCode ?? "").trim();
        if (!cleanedCode) {
          throw new TotpRequiredError();
        }
        const totpResult = await verifyAdminTotpOrBackupCode(user.id, cleanedCode);
        if (totpResult.rateLimited) {
          throw new RateLimitedError();
        }
        if (!totpResult.valid) {
          throw new TotpInvalidError();
        }
      }

      const ip = request?.headers ? getClientIp(request.headers) : null;
      const userAgent = request?.headers?.get("user-agent") ?? null;
      await recordLoginSession({
        userId: user.id,
        provider: "credentials",
        ip,
        userAgent,
      });

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        image: user.avatarUrl,
      };
    },
  }),
];

if (process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim()) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID.trim(),
      clientSecret: process.env.AUTH_GOOGLE_SECRET.trim(),
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        const emailVerified = Boolean(
          (profile as { email_verified?: boolean } | undefined)?.email_verified
        );
        const res = await evaluateGoogleSignIn({
          email: profile?.email ?? user.email,
          emailVerified,
        });
        if (!res.ok) {
          return `/login?error=${res.errorCode}`;
        }
        user.id = res.user.id;
        user.name = res.user.name;
        user.email = res.user.email;
        user.image = res.user.avatarUrl;
        (user as { role?: Role }).role = res.user.role;
      }
      return true;
    },
  },
  providers,
});
