/**
 * Runs once when the Next.js Node.js server starts.
 * 1. Schedules Google Drive cleanup (`pruneDrive`) every DRIVE_PRUNE_INTERVAL_MINUTES (default 60; 0 disables).
 * 2. Schedules daily incremental teacher auto-backup (`runDailyAutoBackup`) at DRIVE_AUTO_BACKUP_HOUR (default 02:00).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (!process.env.GOOGLE_CLIENT_ID?.trim()) return;

    const pruneMinutes = Number(process.env.DRIVE_PRUNE_INTERVAL_MINUTES ?? 60);
    if (Number.isFinite(pruneMinutes) && pruneMinutes > 0) {
      const runPrune = async () => {
        try {
          const { pruneDrive } = await import("./server/driveService");
          await pruneDrive();
        } catch (err) {
          console.error(
            "[Drive Instrumentation] Scheduled prune failed:",
            err instanceof Error ? err.message : "unknown"
          );
        }
      };
      setTimeout(runPrune, 2 * 60 * 1000).unref();
      setInterval(runPrune, pruneMinutes * 60 * 1000).unref();
    }

    const backupHour = Number(process.env.DRIVE_AUTO_BACKUP_HOUR ?? 2);
    if (Number.isFinite(backupHour) && backupHour >= 0 && backupHour <= 23) {
      let lastRanDay = "";
      const checkAutoBackup = async () => {
        const now = new Date();
        const dayKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
        if (now.getHours() !== backupHour || lastRanDay === dayKey) return;
        lastRanDay = dayKey;
        try {
          const { runDailyAutoBackup } = await import("./server/driveService");
          await runDailyAutoBackup();
        } catch (err) {
          console.error(
            "[Drive Instrumentation] Scheduled auto-backup failed:",
            err instanceof Error ? err.message : "unknown"
          );
        }
      };
      setInterval(checkAutoBackup, 30 * 60 * 1000).unref();
    }
  }
}
