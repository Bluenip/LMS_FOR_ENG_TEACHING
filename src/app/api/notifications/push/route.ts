import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { pushSubscribeSchema } from "@/lib/validators";
import {
  getVapidConfig,
  subscribeUserPush,
  unsubscribeUserPush,
} from "@/server/externalNotifyService";

export async function GET() {
  try {
    await requireAuth();
    const vapid = getVapidConfig();
    return NextResponse.json({
      configured: vapid.configured,
      publicKey: vapid.publicKey,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const body = await req.json();
    const parsed = pushSubscribeSchema.parse(body);
    const ua = req.headers.get("user-agent");
    const res = await subscribeUserPush(user.id, parsed, ua);
    return NextResponse.json(res, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const endpoint = url.searchParams.get("endpoint");
    const res = await unsubscribeUserPush(user.id, endpoint);
    return NextResponse.json(res);
  } catch (error) {
    return handleApiError(error);
  }
}
