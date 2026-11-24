import { prisma } from "@/lib/db";
import { sanitizeAuditMeta } from "@/server/auditService";

export type ErrorSource = "SERVER" | "CLIENT";
export type ErrorLevel = "ERROR" | "WARN" | "FATAL";

export interface RecordErrorInput {
  source: ErrorSource;
  level?: ErrorLevel;
  message: string;
  stack?: string | null;
  path?: string | null;
  method?: string | null;
  statusCode?: number | null;
  userId?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}

function truncate(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/**
 * Best-effort lightweight Sentry envelope forwarding when `SENTRY_DSN` is set,
 * without adding heavy native/webpack SDK plugins.
 */
async function forwardToSentryIfConfigured(input: {
  source: ErrorSource;
  level: ErrorLevel;
  message: string;
  stack: string | null;
  path: string | null;
  method: string | null;
  statusCode: number | null;
  userId: string | null;
}): Promise<void> {
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;

  try {
    const parsed = new URL(dsn);
    const publicKey = parsed.username;
    const projectId = parsed.pathname.replace(/^\/+/, "").split("/")[0];
    if (!publicKey || !projectId) return;

    const endpoint = `${parsed.protocol}//${parsed.host}/api/${projectId}/envelope/`;
    const eventId = globalThis.crypto.randomUUID().replace(/-/g, "");
    const sentAt = new Date().toISOString();

    const envelopeHeader = JSON.stringify({
      event_id: eventId,
      sent_at: sentAt,
      dsn,
    });
    const itemHeader = JSON.stringify({ type: "event" });
    const eventPayload = JSON.stringify({
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "javascript",
      level: input.level === "WARN" ? "warning" : input.level === "FATAL" ? "fatal" : "error",
      logger: `engclass.${input.source.toLowerCase()}`,
      message: input.message,
      tags: {
        source: input.source,
        ...(input.method ? { method: input.method } : {}),
        ...(input.statusCode ? { statusCode: String(input.statusCode) } : {}),
      },
      extra: {
        path: input.path,
        stack: input.stack,
      },
      ...(input.userId ? { user: { id: input.userId } } : {}),
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-sentry-envelope",
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=engclass/1.0`,
        },
        body: `${envelopeHeader}\n${itemHeader}\n${eventPayload}\n`,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Never let external error forwarding affect application execution
  }
}

export async function recordError(input: RecordErrorInput) {
  const message = truncate(input.message, 1000) ?? "Unknown error";
  const stack = truncate(input.stack, 8000);
  const path = truncate(input.path, 500);
  const method = truncate(input.method, 16);
  const userAgent = truncate(input.userAgent, 300);
  const level: ErrorLevel = input.level ?? "ERROR";
  const safeMeta = input.meta ? sanitizeAuditMeta(input.meta) : {};

  let created: { id: string } | null = null;
  try {
    created = await prisma.errorLog.create({
      data: {
        source: input.source,
        level,
        message,
        stack,
        path,
        method,
        statusCode: input.statusCode ?? null,
        userId: input.userId ?? null,
        userAgent,
        meta: safeMeta,
      },
      select: { id: true },
    });
  } catch (err) {
    console.error("[ErrorLog] Failed to persist error:", err instanceof Error ? err.message : "unknown");
  }

  void forwardToSentryIfConfigured({
    source: input.source,
    level,
    message,
    stack,
    path,
    method,
    statusCode: input.statusCode ?? null,
    userId: input.userId ?? null,
  });

  return created;
}

export async function listRecentErrors(opts?: { source?: ErrorSource; limit?: number }) {
  const limit = Math.min(100, Math.max(1, Math.floor(opts?.limit ?? 100)));
  const where = opts?.source ? { source: opts.source } : {};

  const [items, total, serverCount, clientCount] = await Promise.all([
    prisma.errorLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.errorLog.count(),
    prisma.errorLog.count({ where: { source: "SERVER" } }),
    prisma.errorLog.count({ where: { source: "CLIENT" } }),
  ]);

  return {
    items: items.map((item) => ({
      id: item.id,
      source: item.source as ErrorSource,
      level: item.level as ErrorLevel,
      message: item.message,
      stack: item.stack,
      path: item.path,
      method: item.method,
      statusCode: item.statusCode,
      userId: item.userId,
      user: item.user,
      userAgent: item.userAgent,
      meta: item.meta,
      createdAt: item.createdAt.toISOString(),
    })),
    counts: { total, server: serverCount, client: clientCount },
    sentryEnabled: Boolean(process.env.SENTRY_DSN?.trim()),
  };
}
