import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { logAudit } from "./auditService";

export interface BannerDTO {
  message: string;
  level: string;
  maintenanceMode: boolean;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  updatedAt: string | null;
}

const MAINTENANCE_TTL_MS = 5_000;
const globalCache = globalThis as unknown as { __pivoraBanner?: { at: number; value: BannerDTO | null } };

function inWindow(b: { startsAt: Date | null; endsAt: Date | null }, now = new Date()) {
  return (!b.startsAt || b.startsAt <= now) && (!b.endsAt || b.endsAt > now);
}

/** The currently visible banner (active and inside its time window), cached 5 s for request guards. */
export async function getActiveBanner(force = false): Promise<BannerDTO | null> {
  const hit = globalCache.__pivoraBanner;
  if (!force && hit && Date.now() - hit.at < MAINTENANCE_TTL_MS) return hit.value;
  const b = await prisma.systemBanner.findFirst({ orderBy: { updatedAt: "desc" } });
  const value =
    b && b.active && inWindow(b)
      ? {
          message: b.message,
          level: b.level,
          maintenanceMode: b.maintenanceMode,
          startsAt: b.startsAt?.toISOString() ?? null,
          endsAt: b.endsAt?.toISOString() ?? null,
          active: b.active,
          updatedAt: b.updatedAt.toISOString(),
        }
      : null;
  globalCache.__pivoraBanner = { at: Date.now(), value };
  return value;
}

export async function isMaintenanceMode(): Promise<boolean> {
  try {
    return Boolean((await getActiveBanner())?.maintenanceMode);
  } catch {
    return false; // never lock everybody out because of a banner lookup failure
  }
}

export async function getBannerForAdmin() {
  const b = await prisma.systemBanner.findFirst({ orderBy: { updatedAt: "desc" } });
  return b
    ? { message: b.message, level: b.level, maintenanceMode: b.maintenanceMode, startsAt: b.startsAt?.toISOString() ?? null, endsAt: b.endsAt?.toISOString() ?? null, active: b.active, updatedAt: b.updatedAt.toISOString() }
    : null;
}

export async function saveBanner(
  actorId: string,
  input: { message: string; level: "INFO" | "WARNING" | "CRITICAL"; maintenanceMode: boolean; active: boolean; startsAt?: string | null; endsAt?: string | null }
) {
  if (input.active && !input.message.trim()) throw new AppError("Vui lòng nhập nội dung thông báo.", 400, "VALIDATION_ERROR");
  const data = {
    message: input.message.trim().slice(0, 500),
    level: input.level,
    maintenanceMode: input.maintenanceMode,
    active: input.active,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
    updatedById: actorId,
  };
  const existing = await prisma.systemBanner.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true } });
  if (existing) await prisma.systemBanner.update({ where: { id: existing.id }, data });
  else await prisma.systemBanner.create({ data });
  globalCache.__pivoraBanner = undefined;
  await logAudit({
    actorId,
    action: "SYSTEM_BANNER_UPDATED",
    targetType: "SYSTEM",
    summary: `${input.active ? "Bật" : "Tắt"} thông báo hệ thống${input.maintenanceMode ? " (bảo trì)" : ""}`,
    summaryEn: `${input.active ? "Enabled" : "Disabled"} system banner${input.maintenanceMode ? " (maintenance)" : ""}`,
  });
  return getBannerForAdmin();
}

/** Disk, database and backup indicators for /admin/system (read-only). */
export async function getSystemHealth() {
  const uploadDir = path.resolve(process.env.LOCAL_UPLOAD_DIR ?? "./uploads");
  let disk: { totalBytes: number; freeBytes: number; usedPct: number } | null = null;
  try {
    const st = await fs.statfs(uploadDir).catch(() => fs.statfs(process.cwd()));
    const total = st.blocks * st.bsize;
    const free = st.bavail * st.bsize;
    disk = { totalBytes: total, freeBytes: free, usedPct: total > 0 ? Math.round(((total - free) / total) * 1000) / 10 : 0 };
  } catch {
    disk = null;
  }
  let dbBytes: number | null = null;
  let tables: Array<{ table: string; bytes: number }> = [];
  try {
    const size = await prisma.$queryRaw<Array<{ size: bigint }>>`SELECT pg_database_size(current_database()) AS size`;
    dbBytes = Number(size[0]?.size ?? 0);
    const rows = await prisma.$queryRaw<Array<{ table: string; bytes: bigint }>>`
      SELECT relname AS table, pg_total_relation_size(relid) AS bytes
      FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 8`;
    tables = rows.map((r) => ({ table: r.table, bytes: Number(r.bytes) }));
  } catch {
    // non-Postgres / restricted role: leave empty
  }
  const lastBackup = await prisma.driveFile.findFirst({ where: { kind: "BACKUP" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }).catch(() => null);
  const [users, classes, submissions] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.class.count({ where: { deletedAt: null } }),
    prisma.submission.count(),
  ]);
  return {
    disk,
    database: { bytes: dbBytes, largestTables: tables },
    lastBackupAt: lastBackup?.createdAt.toISOString() ?? null,
    counts: { users, classes, submissions },
    node: { version: process.version, uptimeSec: Math.round(process.uptime()), rssBytes: process.memoryUsage().rss },
    checkedAt: new Date().toISOString(),
  };
}
