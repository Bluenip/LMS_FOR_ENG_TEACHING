import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db";

export async function createNotification(data: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}) {
  return prisma.notification.create({
    data: {
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      link: data.link ?? null,
    },
  });
}

export async function createNotificationsBulk(
  items: Array<{
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    link?: string | null;
  }>
) {
  if (items.length === 0) return { count: 0 };
  return prisma.notification.createMany({
    data: items.map((item) => ({
      userId: item.userId,
      type: item.type,
      title: item.title,
      body: item.body,
      link: item.link ?? null,
    })),
  });
}

export async function listUserNotifications(userId: string, limit = 30) {
  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({
      where: { userId, read: false },
    }),
  ]);
  return { items, unreadCount };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  return prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { read: true },
  });
}

export async function markAllNotificationsRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}
