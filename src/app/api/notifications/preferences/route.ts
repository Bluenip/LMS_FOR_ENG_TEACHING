import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { updateNotificationPreferenceSchema } from "@/lib/validators";
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
} from "@/server/externalNotifyService";

export async function GET() {
  try {
    const user = await requireAuth();
    const preferences = await getUserNotificationPreferences(user.id);
    return NextResponse.json({ preferences });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = updateNotificationPreferenceSchema.parse(body);
    const preferences = await updateUserNotificationPreferences(user.id, parsed);
    return NextResponse.json({ preferences });
  } catch (error) {
    return handleApiError(error);
  }
}
