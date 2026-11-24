import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { LeaderboardView } from "@/components/leaderboard/LeaderboardView";

export default async function StudentClassLeaderboardPage({
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

  const enrollment = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId: id, studentId: session.user.id } },
    include: { class: true },
  });
  if (!enrollment || enrollment.status !== "ACTIVE") {
    notFound();
  }

  return (
    <LeaderboardView
      classId={enrollment.class.id}
      className={enrollment.class.name}
      isTeacher={false}
      initialAssignmentId={assignmentId}
    />
  );
}
