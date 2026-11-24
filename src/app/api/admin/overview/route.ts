import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { handleApiError, requireRole } from "@/lib/permissions";
import { listTrash, purgeExpiredTrash } from "@/server/accountService";
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

    // accounts past the 90-day trash window are purged whenever an admin opens the dashboard
    await purgeExpiredTrash();
    const [stats, users, parentLinks, trash] = await Promise.all([
      getAdminSystemStats(),
      listAllUsers(q, role),
      listAllParentLinks(),
      listTrash(),
    ]);
    return NextResponse.json({ stats, users, parentLinks, trash });
  } catch (error) {
    return handleApiError(error);
  }
}
