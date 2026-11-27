import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

/** Phase 32: a locked gradebook refuses every grade change until an admin unlocks it. */
export async function assertGradebookUnlocked(classId: string) {
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { gradebookLockedAt: true } });
  if (cls?.gradebookLockedAt) {
    throw new AppError("Sổ điểm của lớp đã khoá cuối kỳ. Liên hệ quản trị viên để mở khoá.", 423, "GRADEBOOK_LOCKED");
  }
}
