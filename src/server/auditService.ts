import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const AUDIT_ACTIONS = [
  "USER_CREATED",
  "USERS_BULK_IMPORTED",
  "USER_TRASHED",
  "USER_RESTORED",
  "USER_PURGED",
  "USER_ROLE_CHANGED",
  "USER_LOCKED",
  "USER_UNLOCKED",
  "USER_PASSWORD_RESET",
  "OWNERSHIP_TRANSFERRED",
  "ASSIGNMENT_UPDATED",
  "ASSIGNMENT_OVERRIDE_SAVED",
  "ASSIGNMENT_OVERRIDE_REMOVED",
  "CLASS_ARCHIVED",
  "CLASS_UNARCHIVED",
  "CLASS_DELETED",
  "CLASS_CLONED",
  "SCHEDULE_RULE_CREATED",
  "SCHEDULE_RULE_DELETED",
  "CLASS_SESSION_CREATED",
  "CLASS_SESSION_UPDATED",
  "CLASS_SESSION_DELETED",
  "ATTENDANCE_SAVED",
  "WORKSHEET_DELETED",
  "WORKSHEET_VERSION_RESTORED",
  "CONTENT_REPORT_MODERATED",
  "CONTENT_TRASHED",
  "CONTENT_RESTORED",
  "TOTP_ENABLED",
  "TOTP_DISABLED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

const SENSITIVE_KEY_RE =
  /(password|secret|token|hash|backupcode|backup_code|totp|authorization|cookie|privatekey)/i;

/**
 * Recursively removes any key that could hold a password, token, or secret before writing AuditLog.meta.
 */
export function sanitizeAuditMeta(value: unknown, depth = 0): Prisma.InputJsonValue {
  if (depth > 6) return "[truncated]";
  if (value === null || value === undefined) return null as unknown as Prisma.InputJsonValue;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => sanitizeAuditMeta(item, depth + 1));
  }
  if (typeof value === "object") {
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k)) continue;
      if (v === undefined) continue;
      out[k] = sanitizeAuditMeta(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export interface LogAuditInput {
  actorId?: string | null;
  action: AuditAction;
  targetType: "USER" | "CLASS" | "WORKSHEET" | "ASSIGNMENT" | "SYSTEM";
  targetId?: string | null;
  /** Vietnamese summary (stored in the `summary` column). */
  summary: string;
  /** English summary, kept in `meta.summaryEn` so /admin/audit can show it in EN. */
  summaryEn?: string;
  meta?: Record<string, unknown>;
}

/**
 * Writes one AuditLog row.
 * - With the default client the action it describes has already been saved, so a logging failure
 *   is reported to ErrorLog/console instead of turning a successful request into a 500.
 * - Inside a transaction (`db` = tx) it throws, so the change and its log stay atomic.
 */
export async function logAudit(
  input: LogAuditInput,
  db: Prisma.TransactionClient | typeof prisma = prisma
) {
  const meta = {
    ...(input.meta ?? {}),
    ...(input.summaryEn ? { summaryEn: input.summaryEn } : {}),
  };
  const data = {
    actorId: input.actorId ?? null,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    summary: input.summary.slice(0, 500),
    meta: sanitizeAuditMeta(meta),
  };
  if (db !== prisma) {
    return db.auditLog.create({ data });
  }
  try {
    return await prisma.auditLog.create({ data });
  } catch (error) {
    console.error("[AuditLog] failed to record", input.action, error);
    const { recordError } = await import("@/server/errorLogService");
    void recordError({
      source: "SERVER",
      level: "WARN",
      message: `AuditLog write failed for ${input.action}: ${error instanceof Error ? error.message : String(error)}`,
      meta: { handler: "logAudit", action: input.action, targetId: input.targetId ?? null },
    });
    return null;
  }
}

export interface ListAuditLogsQuery {
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

function parseDateBoundary(input: string | undefined, endOfDay: boolean): Date | undefined {
  if (!input?.trim()) return undefined;
  const trimmed = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  }
  const dt = new Date(trimmed);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

function readSummaryEn(meta: Prisma.JsonValue): string | null {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const v = (meta as Record<string, unknown>).summaryEn;
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function stripSummaryEn(meta: Prisma.JsonValue): Prisma.JsonValue {
  if (meta && typeof meta === "object" && !Array.isArray(meta) && "summaryEn" in meta) {
    const { summaryEn: _omit, ...rest } = meta as Record<string, Prisma.JsonValue>;
    void _omit;
    return rest;
  }
  return meta;
}

export async function listAuditLogs(query: ListAuditLogsQuery = {}) {
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(query.pageSize ?? 25)));

  const fromDate = parseDateBoundary(query.from, false);
  const toDate = parseDateBoundary(query.to, true);
  const createdAtFilter: Prisma.DateTimeFilter | undefined =
    fromDate || toDate
      ? {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        }
      : undefined;

  const trimmedQ = query.q?.trim();
  const where: Prisma.AuditLogWhereInput = {
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.action ? { action: query.action } : {}),
    ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    ...(trimmedQ
      ? {
          OR: [
            { summary: { contains: trimmedQ, mode: "insensitive" } },
            { meta: { path: ["summaryEn"], string_contains: trimmedQ } },
            { targetId: { contains: trimmedQ, mode: "insensitive" } },
            { actor: { name: { contains: trimmedQ, mode: "insensitive" } } },
            { actor: { email: { contains: trimmedQ, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [items, total, actorGroups] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where: { actorId: { not: null } },
      distinct: ["actorId"],
      select: {
        actor: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    }),
  ]);

  const actors = actorGroups
    .map((g) => g.actor)
    .filter((a): a is NonNullable<typeof a> => Boolean(a))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    items: items.map((item) => ({
      id: item.id,
      actorId: item.actorId,
      actor: item.actor,
      action: item.action,
      targetType: item.targetType,
      targetId: item.targetId,
      summary: item.summary,
      summaryEn: readSummaryEn(item.meta),
      meta: stripSummaryEn(item.meta),
      createdAt: item.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    actors,
    availableActions: AUDIT_ACTIONS,
  };
}
