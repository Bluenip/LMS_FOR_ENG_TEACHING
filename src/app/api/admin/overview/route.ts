import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { handleApiError, requireRole } from "@/lib/permissions";
import {
  getAdminSystemStats,
  listAllParentLinks,
  listAllUsers,
} from "@/server/adminService";

export async function GET(req: Request) {
  try {
    await requireRole(["ADMIN"]);
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? undefined;
    const roleParam = url.searchParams.get("role");
    const role =
      roleParam && ["ADMIN", "TEACHER", "STUDENT", "PARENT"].includes(roleParam)
        ? (roleParam as Role)
        : undefined;

    const [stats, users, parentLinks] = await Promise.all([
      getAdminSystemStats(),
      listAllUsers(q, role),
      listAllParentLinks(),
    ]);
    return NextResponse.json({ stats, users, parentLinks });
  } catch (error) {
    return handleApiError(error);
  }
}
