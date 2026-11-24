import NextAuth, { CredentialsSignin, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { authConfig } from "@/lib/auth.config";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyAdminTotpOrBackupCode } from "@/server/totpService";

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
    async authorize(credentials) {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const { email, password, totpCode } = parsed.data;

      const limit = checkRateLimit(`login:${email}`, 50, 15 * 60 * 1000);
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

      // Admin 2FA (TOTP) enforcement
      if (user.role === "ADMIN" && user.totpEnabled) {
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

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
});
