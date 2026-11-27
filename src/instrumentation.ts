import type { Instrumentation } from "next";

/**
 * Runs once when the Next.js Node.js server starts.
 * 1. Schedules Google Drive cleanup (`pruneDrive`) every DRIVE_PRUNE_INTERVAL_MINUTES (default 60; 0 disables).
 * 2. Schedules daily incremental teacher auto-backup (`runDailyAutoBackup`) at DRIVE_AUTO_BACKUP_HOUR (default 02:00).
 *    The same daily run moves orphaned Pivora files on Drive to Drive's trash (`trashDriveOrphans`).
 * 3. Hourly: syncs the library trash with Google Drive's trash and deletes items older than 30 days.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // library trash: empty items older than CONTENT_TRASH_DAYS (runs with or without Google Drive)
    const purgeTrash = async () => {
      try {
        const { purgeExpiredContentTrash } = await import("./server/trashService");
        await purgeExpiredContentTrash();
      } catch (err) {
        console.error("[Trash] Scheduled purge failed:", err instanceof Error ? err.message : "unknown");
      }
    };
    setTimeout(purgeTrash, 3 * 60 * 1000).unref();
    setInterval(purgeTrash, 60 * 60 * 1000).unref();

    // Phase 16: hourly due-soon (<= 24h) assignment reminders (runs with or without Google Drive)
    const runDueReminders = async () => {
      try {
        const { sendDueSoonReminders } = await import("./server/reminderService");
        await sendDueSoonReminders();
      } catch (err) {
        console.error(
          "[Reminders] Scheduled due-soon check failed:",
          err instanceof Error ? err.message : "unknown"
        );
      }
    };
    setTimeout(runDueReminders, 5 * 60 * 1000).unref();
    setInterval(runDueReminders, 60 * 60 * 1000).unref();

    // Phase 24: Sunday 19:00 Asia/Ho_Chi_Minh weekly parent reports (checked every 30 min)
    const runWeeklyReports = async () => {
      try {
        const { runWeeklyParentReports } = await import("./server/weeklyReportService");
        await runWeeklyParentReports();
      } catch (err) {
        console.error(
          "[WeeklyReport] Scheduled check failed:",
          err instanceof Error ? err.message : "unknown"
        );
      }
    };
    setTimeout(runWeeklyReports, 6 * 60 * 1000).unref();
    setInterval(runWeeklyReports, 30 * 60 * 1000).unref();

    if (!process.env.GOOGLE_CLIENT_ID?.trim()) return;

    const pruneMinutes = Number(process.env.DRIVE_PRUNE_INTERVAL_MINUTES ?? 60);
    if (Number.isFinite(pruneMinutes) && pruneMinutes > 0) {
      const runPrune = async () => {
        try {
          const { pruneDrive } = await import("./server/driveService");
          await pruneDrive();
          // items trashed / restored directly in Google Drive show up in Pivora's trash
          const { syncTrashWithDrive } = await import("./server/trashService");
          await syncTrashWithDrive();
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
          const { runDailyAutoBackup, trashDriveOrphans } = await import("./server/driveService");
          await runDailyAutoBackup();
          // daily: Pivora files on Drive that no record points to go to Drive's trash
          await trashDriveOrphans();
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

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { recordError } = await import("./server/errorLogService");
      const errObj = err as Error & { digest?: string };
      await recordError({
        source: "SERVER",
        level: "ERROR",
        message: errObj?.message || "Unhandled Next.js server error",
        stack: errObj?.stack ?? null,
        path: request.path,
        method: request.method,
        statusCode: 500,
        meta: {
          digest: errObj?.digest ?? null,
          routerKind: context.routerKind,
          routePath: context.routePath,
          routeType: context.routeType,
        },
      });
    } catch {
      // never throw from instrumentation hook
    }
  }
};
