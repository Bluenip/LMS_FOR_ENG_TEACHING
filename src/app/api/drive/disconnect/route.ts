import { NextResponse } from "next/server";
import { z } from "zod";
import { assertDriveOrigin } from "@/lib/drive/google-drive";
import { handleApiError, requireRole } from "@/lib/permissions";
import { disconnectDriveConnection } from "@/server/driveService";

const disconnectSchema = z.object({
  scope: z.enum(["shared", "personal"]).optional(),
});

export async function POST(req: Request) {
  try {
    assertDriveOrigin(req);
    const user = await requireRole(["ADMIN", "TEACHER"]);
    const body = await req.json().catch(() => ({}));
    const parsed = disconnectSchema.parse(body);
    const scope: "shared" | "personal" =
      parsed.scope ?? (user.role === "ADMIN" ? "shared" : "personal");

    const result = await disconnectDriveConnection(user, scope);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
