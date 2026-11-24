import { NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError, requireAuth } from "@/lib/permissions";
import {
  listUserNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/notificationService";

const patchNotifSchema = z.object({
  id: z.string().optional(),
  all: z.boolean().optional(),
});

export async function GET() {
  try {
    const user = await requireAuth();
    const data = await listUserNotifications(user.id);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const data = patchNotifSchema.parse(body);
    if (data.all) {
      await markAllNotificationsRead(user.id);
    } else if (data.id) {
      await markNotificationRead(user.id, data.id);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
