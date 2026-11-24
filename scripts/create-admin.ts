/**
 * Create (or reset) the administrator account on a fresh production database,
 * without loading any demo data.
 *
 *   ADMIN_EMAIL=admin@example.com ADMIN_NAME="Quản trị viên" tsx scripts/create-admin.ts [--reset]
 *
 * ADMIN_PASSWORD is optional: when empty a strong random password is generated and printed ONCE.
 * --reset: update the password of an existing admin with that email.
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/db";
import { generateTemporaryPassword } from "../src/server/accountService";

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const name = (process.env.ADMIN_NAME ?? "Quản trị viên").trim();
  const reset = process.argv.includes("--reset");
  if (!email || !email.includes("@")) {
    throw new Error("Set ADMIN_EMAIL, e.g. ADMIN_EMAIL=admin@example.com");
  }
  const password = process.env.ADMIN_PASSWORD?.trim() || generateTemporaryPassword(16);
  if (password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters");
  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
  if (existing && !reset) {
    throw new Error(`User ${email} already exists. Re-run with --reset to set a new password.`);
  }
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: "ADMIN",
        isLocked: false,
        mustChangePassword: !process.env.ADMIN_PASSWORD,
        passwordChangedAt: new Date(),
      },
    });
  } else {
    await prisma.user.create({
      data: { email, name, passwordHash, role: "ADMIN", mustChangePassword: !process.env.ADMIN_PASSWORD },
    });
  }
  console.log(`Admin ready: ${email}`);
  if (!process.env.ADMIN_PASSWORD) console.log(`Generated password (shown once): ${password}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
