import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { listParentChildren } from "@/server/parentService";

export async function GET() {
  try {
    const user = await requireRole(["PARENT"]);
    const children = await listParentChildren(user.id);
    return NextResponse.json({ children });
  } catch (error) {
    return handleApiError(error);
  }
}
