import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { maskIpAddress } from "@/lib/ip-mask";

export async function recordLoginSession(opts: {
  userId: string;
  provider: string;
  ip?: string | null;
  userAgent?: string | null;
}) {
  try {
    const cleanUa = opts.userAgent?.trim().slice(0, 240) || null;
    await prisma.loginSessionLog.create({
      data: {
        userId: opts.userId,
        provider: opts.provider,
        ipMasked: maskIpAddress(opts.ip),
        userAgent: cleanUa,
      },
    });
  } catch {
    // Never break login if session telemetry fails
  }
}

export async function evaluateGoogleSignIn(opts: {
  email?: string | null;
  emailVerified?: boolean;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<
  | {
      ok: true;
      user: { id: string; email: string; name: string; role: Role; avatarUrl: string | null };
    }
  | { ok: false; errorCode: "AccountNotProvisioned" | "AccountLocked" }
> {
  const email = opts.email?.trim().toLowerCase();
  if (!email || !opts.emailVerified) {
    return { ok: false, errorCode: "AccountNotProvisioned" };
  }

  const dbUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      avatarUrl: true,
      deletedAt: true,
      isLocked: true,
    },
  });

  if (!dbUser || dbUser.deletedAt) {
    return { ok: false, errorCode: "AccountNotProvisioned" };
  }
  if (dbUser.isLocked) {
    return { ok: false, errorCode: "AccountLocked" };
  }

  await recordLoginSession({
    userId: dbUser.id,
    provider: "google",
    ip: opts.ip,
    userAgent: opts.userAgent,
  });

  return {
    ok: true,
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: dbUser.role,
      avatarUrl: dbUser.avatarUrl,
    },
  };
}
