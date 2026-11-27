import type { ClassRole, Role } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Resolves the effective ClassRole of a user inside a class (ADMIN & class.teacherId resolve to OWNER). */
export async function resolveUserClassRole(
  classId: string,
  userId: string,
  userRole: Role,
  classTeacherId: string
): Promise<ClassRole | null> {
  if (userRole === "ADMIN" || classTeacherId === userId) {
    return "OWNER";
  }
  if (userRole !== "TEACHER") {
    return null;
  }
  const entry = await prisma.classTeacher.findUnique({
    where: { classId_userId: { classId, userId } },
    select: { role: true },
  });
  return entry?.role ?? null;
}
