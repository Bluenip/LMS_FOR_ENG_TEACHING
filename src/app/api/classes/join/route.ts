import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { joinClassSchema } from "@/lib/validators";
import { joinClassByCode } from "@/server/classService";

export async function POST(req: Request) {
  try {
    const user = await requireRole(["STUDENT"]);
    const body = await req.json();
    const data = joinClassSchema.parse(body);
    const result = await joinClassByCode(user.id, data.joinCode);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
