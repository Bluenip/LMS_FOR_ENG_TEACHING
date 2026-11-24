import { prisma } from "../src/lib/db";
import { pruneDrive } from "../src/server/driveService";

try {
  // Node 20.12+ / 22+ built-in .env loader (no external dotenv needed)
  (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env");
} catch {
  // .env may not exist when env vars are already injected by shell/cron
}

/**
 * Usage: pnpm drive:prune [graceHours]
 * Defaults to 24 hours. Safe to run repeatedly or via system cron.
 */
async function main() {
  const grace = Number(process.argv[2] ?? 24);
  if (!Number.isFinite(grace) || grace < 0) {
    throw new Error("graceHours must be a number >= 0");
  }
  const result = await pruneDrive(grace);
  console.log(JSON.stringify(result, null, 2));
  if (result.skippedNoConnection) {
    console.log("Google Drive is not connected: queued Drive items were left for later retry.");
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
