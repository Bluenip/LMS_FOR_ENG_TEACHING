import webpush from "web-push";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { decryptAppSecret, encryptAppSecret } from "@/lib/crypto-secrets";

export interface PushSender {
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string
  ) => Promise<{ statusCode?: number } | void>;
}

export interface EmailSender {
  sendMail: (mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }) => Promise<unknown>;
}

let testHooks: {
  pushSender?: PushSender;
  emailSender?: EmailSender;
} = {};

export function setExternalNotifyTestHooks(hooks: typeof testHooks) {
  testHooks = hooks;
}

export function getVapidConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@pivora.local";
  return {
    configured: Boolean(publicKey && privateKey),
    publicKey: publicKey || null,
    privateKey: privateKey || null,
    subject,
  };
}

export function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim()
  );
}

export async function getUserNotificationPreferences(userId: string) {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId } });
  const pushCount = await prisma.pushSubscription.count({ where: { userId } });
  const vapid = getVapidConfig();

  return {
    emailEnabled: pref?.emailEnabled ?? true,
    emailAssignmentNew: pref?.emailAssignmentNew ?? true,
    emailDueReminder: pref?.emailDueReminder ?? true,
    emailWeeklyReport: pref?.emailWeeklyReport ?? true,
    pushEnabled: pref?.pushEnabled ?? false,
    pushSubscriptionCount: pushCount,
    vapidConfigured: vapid.configured,
    smtpConfigured: isSmtpConfigured(),
  };
}

export async function updateUserNotificationPreferences(
  userId: string,
  input: {
    emailEnabled?: boolean;
    emailAssignmentNew?: boolean;
    emailDueReminder?: boolean;
    emailWeeklyReport?: boolean;
    pushEnabled?: boolean;
  }
) {
  await prisma.notificationPreference.upsert({
    where: { userId },
    create: {
      userId,
      emailEnabled: input.emailEnabled ?? true,
      emailAssignmentNew: input.emailAssignmentNew ?? true,
      emailDueReminder: input.emailDueReminder ?? true,
      emailWeeklyReport: input.emailWeeklyReport ?? true,
      pushEnabled: input.pushEnabled ?? false,
    },
    update: {
      ...(input.emailEnabled !== undefined ? { emailEnabled: input.emailEnabled } : {}),
      ...(input.emailAssignmentNew !== undefined
        ? { emailAssignmentNew: input.emailAssignmentNew }
        : {}),
      ...(input.emailDueReminder !== undefined
        ? { emailDueReminder: input.emailDueReminder }
        : {}),
      ...(input.emailWeeklyReport !== undefined
        ? { emailWeeklyReport: input.emailWeeklyReport }
        : {}),
      ...(input.pushEnabled !== undefined ? { pushEnabled: input.pushEnabled } : {}),
    },
  });
  return getUserNotificationPreferences(userId);
}

export async function subscribeUserPush(
  userId: string,
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  userAgent?: string | null
) {
  const vapid = getVapidConfig();
  if (!vapid.configured && !testHooks.pushSender) {
    throw new AppError("Máy chủ chưa cấu hình VAPID Web Push.", 503, "SERVICE_UNAVAILABLE");
  }

  const p256dhEncrypted = encryptAppSecret(sub.keys.p256dh, "push");
  const authEncrypted = encryptAppSecret(sub.keys.auth, "push");

  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: {
      userId,
      endpoint: sub.endpoint,
      p256dhEncrypted,
      authEncrypted,
      userAgent: userAgent?.slice(0, 250) ?? null,
    },
    update: {
      userId,
      p256dhEncrypted,
      authEncrypted,
      userAgent: userAgent?.slice(0, 250) ?? null,
    },
  });

  await prisma.notificationPreference.upsert({
    where: { userId },
    create: { userId, pushEnabled: true },
    update: { pushEnabled: true },
  });

  return { ok: true };
}

export async function unsubscribeUserPush(userId: string, endpoint?: string | null) {
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  } else {
    await prisma.pushSubscription.deleteMany({ where: { userId } });
  }
  const remaining = await prisma.pushSubscription.count({ where: { userId } });
  if (remaining === 0) {
    await prisma.notificationPreference
      .update({
        where: { userId },
        data: { pushEnabled: false },
      })
      .catch(() => undefined);
  }
  return { ok: true };
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
) {
  const vapid = getVapidConfig();
  if (!testHooks.pushSender && (!vapid.configured || !vapid.publicKey || !vapid.privateKey)) {
    return { sent: 0, skipped: true };
  }

  const pref = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (pref && !pref.pushEnabled) {
    return { sent: 0, skipped: true };
  }

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return { sent: 0, skipped: false };

  let sender: PushSender;
  if (testHooks.pushSender) {
    sender = testHooks.pushSender;
  } else {
    webpush.setVapidDetails(vapid.subject, vapid.publicKey!, vapid.privateKey!);
    sender = {
      sendNotification: (s, msg) => webpush.sendNotification(s, msg),
    };
  }

  let sent = 0;
  for (const sub of subs) {
    try {
      const p256dh = decryptAppSecret(sub.p256dhEncrypted, "push");
      const auth = decryptAppSecret(sub.authEncrypted, "push");
      await sender.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh, auth },
        },
        JSON.stringify(payload)
      );
      sent++;
    } catch (err) {
      const statusCode =
        typeof err === "object" && err && "statusCode" in err
          ? Number((err as { statusCode?: number }).statusCode)
          : 0;
      if (statusCode === 410 || statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
      }
    }
  }
  return { sent, skipped: false };
}

export async function sendEmailNotification(opts: {
  userId?: string;
  toEmail: string;
  category?: "assignmentNew" | "dueReminder" | "weeklyReport";
  subject: string;
  text: string;
  html?: string;
}) {
  if (!testHooks.emailSender && !isSmtpConfigured()) {
    return { sent: false, reason: "smtp_not_configured" };
  }

  if (opts.userId) {
    const pref = await prisma.notificationPreference.findUnique({
      where: { userId: opts.userId },
    });
    if (pref) {
      if (!pref.emailEnabled) return { sent: false, reason: "opted_out" };
      if (opts.category === "assignmentNew" && !pref.emailAssignmentNew) {
        return { sent: false, reason: "opted_out_category" };
      }
      if (opts.category === "dueReminder" && !pref.emailDueReminder) {
        return { sent: false, reason: "opted_out_category" };
      }
      if (opts.category === "weeklyReport" && !pref.emailWeeklyReport) {
        return { sent: false, reason: "opted_out_category" };
      }
    }
  }

  const from = process.env.SMTP_FROM?.trim() || "Pivora LMS <no-reply@pivora.local>";
  let transport: EmailSender;
  if (testHooks.emailSender) {
    transport = testHooks.emailSender;
  } else {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    transport = transporter;
  }

  await transport.sendMail({
    from,
    to: opts.toEmail,
    subject: opts.subject,
    text: opts.text,
    ...(opts.html ? { html: opts.html } : {}),
  });
  return { sent: true };
}

export async function sendWebhookAlert(message: string) {
  const tgToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const tgChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  if (tgToken && tgChatId) {
    await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: tgChatId, text: message.slice(0, 3500) }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  }

  const webhookUrl = process.env.ALERT_WEBHOOK_URL?.trim();
  if (webhookUrl && /^https?:\/\//i.test(webhookUrl)) {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message.slice(0, 3500), sentAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => undefined);
  }
}
