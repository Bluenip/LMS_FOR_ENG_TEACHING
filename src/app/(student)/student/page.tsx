import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listStudentClasses } from "@/server/classService";
import {
  describeProctorRuleSummary,
  listStudentAssignments,
} from "@/server/assignmentService";
import { StudentDashboardClient } from "./StudentDashboardClient";
import { getI18n } from "@/lib/i18n/server";

export default async function StudentDashboardPage() {
  const { tr } = await getI18n();
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [classes, assignments] = await Promise.all([
    listStudentClasses(session.user.id),
    listStudentAssignments(session.user.id),
  ]);

  const serializedClasses = classes.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    teacherName: c.teacher.name,
    studentCount: c._count.enrollments,
    assignmentCount: c._count.assignments,
  }));

  const serializedAssignments = assignments.map((a) => {
    const latestSub = a.submissions[0] ?? null;
    return {
      id: a.id,
      title: a.title,
      classId: a.class.id,
      className: a.class.name,
      teacherName: a.class.teacher.name,
      dueAt: a.dueAt?.toISOString() ?? null,
      timeLimitMin: a.timeLimitMin,
      maxAttempts: a.maxAttempts,
      questionCount: a.worksheet._count.fields,
      proctorMode: a.proctorMode,
      requireCamera: a.requireCamera,
      proctorSummary: describeProctorRuleSummary(a, tr),
      scoreScale: a.scoreScale,
      weight: a.weight,
      hasOverride: a.hasOverride,
      attemptsUsed: a.submissions.length,
      latestSubmission: latestSub
        ? {
            id: latestSub.id,
            status: latestSub.status,
            totalScore: latestSub.totalScore,
            maxScore: latestSub.maxScore,
            isLate: latestSub.isLate,
            lockedAt: latestSub.lockedAt?.toISOString() ?? null,
            submittedAt: latestSub.submittedAt?.toISOString() ?? null,
          }
        : null,
    };
  });

  return (
    <StudentDashboardClient
      studentName={session.user.name ?? tr("Học sinh", "Student")}
      classes={serializedClasses}
      assignments={serializedAssignments}
    />
  );
}
