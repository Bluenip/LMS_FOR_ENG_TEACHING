import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveUserClassRole } from "@/lib/permissions";
import { LeaderboardView } from "@/components/leaderboard/LeaderboardView";

export default async function TeacherClassLeaderboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ assignmentId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const { assignmentId } = await searchParams;

  const cls = await prisma.class.findUnique({ where: { id } });
  if (!cls || cls.deletedAt) notFound();
  const classRole = await resolveUserClassRole(cls.id, session.user.id, session.user.role, cls.teacherId);
  if (!classRole) {
    redirect("/teacher");
  }

  return (
    <LeaderboardView
      classId={cls.id}
      className={cls.name}
      isTeacher={true}
      initialAssignmentId={assignmentId}
    />
  );
}
