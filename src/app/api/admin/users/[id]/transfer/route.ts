import { NextResponse } from "next/server";
import { handleApiError, requireRole } from "@/lib/permissions";
import { transferOwnershipSchema } from "@/lib/validators";
import { transferOwnership } from "@/server/adminService";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireRole(["ADMIN"]);
    const { id } = await context.params;
    const data = transferOwnershipSchema.parse(await req.json());
    const result = await transferOwnership(actor.id, id, data);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
