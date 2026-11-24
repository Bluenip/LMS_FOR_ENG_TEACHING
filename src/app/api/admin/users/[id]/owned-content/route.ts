import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { getUserOwnedContent } from "@/server/adminService";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["ADMIN"]);
    const { id } = await context.params;
    const data = await getUserOwnedContent(id);
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
