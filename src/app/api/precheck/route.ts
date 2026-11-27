import { NextResponse } from "next/server";
import { handleApiError, requireAuth } from "@/lib/permissions";
import { preCheckSchema } from "@/lib/validators";
import { savePreCheck } from "@/server/preCheckService";

export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const data = preCheckSchema.parse(await req.json());
    return NextResponse.json(await savePreCheck(user.id, data));
  } catch (error) {
    return handleApiError(error);
  }
}
