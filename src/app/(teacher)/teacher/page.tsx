import { requireLayoutUser } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { TRASH_DAYS } from "@/lib/trash";
import { TeacherDashboardClient } from "./TeacherDashboardClient";
import { getI18n } from "@/lib/i18n/server";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function TeacherDashboardPage() {
  const { tr } = await getI18n();
  const user = await requireLayoutUser(["TEACHER", "ADMIN"]);
  // an admin sees (and manages) every class in the system
  const isAdmin = user.role === "ADMIN";
  // classes in the trash are hidden everywhere until restored
  const classScope = isAdmin ? { deletedAt: null } : { teacherId: user.id, deletedAt: null };
  const trashedScope = isAdmin
    ? { deletedAt: { not: null } }
    : { teacherId: user.id, deletedAt: { not: null } };

  const [classes, trashedClasses] = await Promise.all([
    prisma.class.findMany({
      where: classScope,
      include: {
        teacher: { select: { id: true, name: true } },
        _count: {
          select: {
            enrollments: { where: { status: "ACTIVE" } },
            assignments: true,
          },
        },
      },
      orderBy: [{ archived: "asc" }, { createdAt: "desc" }],
    }),
    prisma.class.findMany({
      where: trashedScope,
      include: {
        teacher: { select: { id: true, name: true } },
        _count: {
          select: {
            enrollments: { where: { status: "ACTIVE" } },
            assignments: true,
          },
        },
      },
      orderBy: { deletedAt: "desc" },
    }),
  ]);

  const assignments = await prisma.assignment.findMany({
    where: { class: classScope },
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
      teacherName={user.name || tr("Giáo viên", "Teacher")}
      isAdmin={isAdmin}
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
        teacherName: c.teacherId !== user.id ? c.teacher.name : null,
      }))}
      trashedClasses={trashedClasses.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        studentCount: c._count.enrollments,
        assignmentCount: c._count.assignments,
        teacherName: c.teacherId !== user.id ? c.teacher.name : null,
        deletedAt: c.deletedAt!.toISOString(),
        daysLeft: Math.max(
          0,
          Math.ceil((c.deletedAt!.getTime() + TRASH_DAYS * DAY_MS - Date.now()) / DAY_MS)
        ),
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
