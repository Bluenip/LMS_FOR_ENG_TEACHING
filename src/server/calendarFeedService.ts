import crypto from "crypto";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { buildIcsCalendar, type IcsEvent } from "@/lib/calendar/ics-generator";

export function hashFeedToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function getCalendarTokenStatus(userId: string) {
  const t = await prisma.calendarFeedToken.findUnique({ where: { userId }, select: { createdAt: true, rotatedAt: true } });
  return { hasToken: Boolean(t), rotatedAt: t?.rotatedAt.toISOString() ?? null };
}

/** Creates or rotates the feed token. The raw token is returned ONCE; only its hash is stored. */
export async function rotateCalendarToken(userId: string) {
  const token = crypto.randomBytes(24).toString("base64url");
  await prisma.calendarFeedToken.upsert({
    where: { userId },
    create: { userId, tokenHash: hashFeedToken(token) },
    update: { tokenHash: hashFeedToken(token), rotatedAt: new Date() },
  });
  return { token };
}

export async function revokeCalendarToken(userId: string) {
  await prisma.calendarFeedToken.deleteMany({ where: { userId } });
  return { ok: true };
}

/** Classes whose schedule a user may see in their feed. */
async function scopeForUser(user: { id: string; role: string }): Promise<{ classIds: string[]; studentIds: string[] | null }> {
  if (user.role === "TEACHER" || user.role === "ADMIN") {
    const classes = await prisma.class.findMany({
      where: { deletedAt: null, archived: false, OR: [{ teacherId: user.id }, { classTeachers: { some: { userId: user.id } } }] },
      select: { id: true },
    });
    return { classIds: classes.map((c) => c.id), studentIds: null };
  }
  const studentIds =
    user.role === "STUDENT"
      ? [user.id]
      : (
          await prisma.parentLink.findMany({ where: { parentId: user.id, verifiedAt: { not: null } }, select: { studentId: true } })
        ).map((l) => l.studentId);
  const enr = await prisma.enrollment.findMany({
    where: { studentId: { in: studentIds }, status: "ACTIVE", class: { deletedAt: null, archived: false } },
    select: { classId: true },
  });
  return { classIds: Array.from(new Set(enr.map((e) => e.classId))), studentIds };
}

/**
 * Builds the .ics feed for a secret token. Unknown / revoked tokens and trashed or locked
 * accounts get 401. Window: 30 days back → 120 days ahead.
 */
export async function buildCalendarFeed(token: string, appOrigin: string) {
  if (!token || token.length < 20) throw new AppError("Liên kết lịch không hợp lệ.", 401, "UNAUTHORIZED");
  const row = await prisma.calendarFeedToken.findUnique({
    where: { tokenHash: hashFeedToken(token) },
    select: { user: { select: { id: true, name: true, role: true, isLocked: true, deletedAt: true } } },
  });
  if (!row || row.user.isLocked || row.user.deletedAt) throw new AppError("Liên kết lịch không hợp lệ.", 401, "UNAUTHORIZED");
  const user = row.user;
  const { classIds, studentIds } = await scopeForUser(user);
  const from = new Date(Date.now() - 30 * 86_400_000);
  const to = new Date(Date.now() + 120 * 86_400_000);
  const [sessions, assignments] = await Promise.all([
    prisma.classSession.findMany({
      where: { classId: { in: classIds }, startsAt: { gte: from, lte: to }, status: { not: "CANCELLED" } },
      select: { id: true, title: true, startsAt: true, endsAt: true, meetingUrl: true, updatedAt: true, class: { select: { name: true } } },
    }),
    prisma.assignment.findMany({
      where: {
        classId: { in: classIds },
        dueAt: { gte: from, lte: to },
        ...(studentIds ? { OR: [{ targets: { none: {} } }, { targets: { some: { studentId: { in: studentIds } } } }] } : {}),
      },
      select: { id: true, title: true, dueAt: true, updatedAt: true, class: { select: { name: true } } },
    }),
  ]);
  const events: IcsEvent[] = [
    ...sessions.map((s) => ({
      uid: `session-${s.id}@pivora`,
      start: s.startsAt,
      end: s.endsAt,
      summary: `${s.class.name}: ${s.title}`,
      location: s.meetingUrl,
      url: s.meetingUrl,
      stamp: s.updatedAt,
    })),
    ...assignments.map((a) => ({
      uid: `due-${a.id}@pivora`,
      start: new Date(a.dueAt!.getTime() - 30 * 60_000),
      end: a.dueAt!,
      summary: `⏰ Hạn nộp: ${a.title} (${a.class.name})`,
      url: user.role === "STUDENT" ? `${appOrigin}/student/assignments/${a.id}/do` : null,
      stamp: a.updatedAt,
    })),
  ];
  return buildIcsCalendar(events, { name: `Pivora — ${user.name}` });
}
