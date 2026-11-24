import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TeacherDashboardClient } from "./TeacherDashboardClient";

export default async function TeacherDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const classes = await prisma.class.findMany({
    where: { teacherId: session.user.id },
    include: {
      _count: {
        select: {
          enrollments: { where: { status: "ACTIVE" } },
          assignments: true,
        },
      },
    },
    orderBy: [{ archived: "asc" }, { createdAt: "desc" }],
  });

  const assignments = await prisma.assignment.findMany({
    where: { class: { teacherId: session.user.id } },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
      },
      submissions: {
        select: { id: true, studentId: true, status: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const activeClasses = classes.filter((c) => !c.archived);
  const totalStudents = activeClasses.reduce((sum, c) => sum + c._count.enrollments, 0);
  const pendingManual = assignments.reduce(
    (sum, a) => sum + a.submissions.filter((s) => s.status === "SUBMITTED").length,
    0
  );

  let totalExpected = 0;
  let totalSubmitted = 0;
  for (const a of assignments) {
    const classSize = a.class._count.enrollments;
    const uniqueSubmitted = new Set(
      a.submissions
        .filter((s) => s.status === "SUBMITTED" || s.status === "GRADED")
        .map((s) => s.studentId)
    ).size;
    totalExpected += classSize;
    totalSubmitted += Math.min(classSize, uniqueSubmitted);
  }
  const submissionRate =
    totalExpected > 0 ? Math.round((totalSubmitted / totalExpected) * 1000) / 10 : 0;

  return (
    <TeacherDashboardClient
      teacherName={session.user.name ?? "Giáo viên"}
      stats={{
        totalStudents,
        activeClassCount: activeClasses.length,
        pendingManual,
        submissionRate,
      }}
      classes={classes.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        joinCode: c.joinCode,
        archived: c.archived,
        studentCount: c._count.enrollments,
        assignmentCount: c._count.assignments,
      }))}
      assignments={assignments.map((a) => {
        const uniqueSubmitted = new Set(
          a.submissions
            .filter((s) => s.status === "SUBMITTED" || s.status === "GRADED")
            .map((s) => s.studentId)
        ).size;
        const pendingCount = a.submissions.filter((s) => s.status === "SUBMITTED").length;
        return {
          id: a.id,
          title: a.title,
          className: a.class.name,
          classId: a.class.id,
          dueAt: a.dueAt?.toISOString() ?? null,
          proctorMode: a.proctorMode,
          submittedCount: uniqueSubmitted,
          totalStudents: a.class._count.enrollments,
          pendingCount,
        };
      })}
    />
  );
}
