import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveUserClassRole } from "@/lib/permissions";
import { getClassDetail } from "@/server/classService";
import { ClassDetailView, type ClassDetailData } from "@/components/classes/ClassDetailView";

export default async function TeacherClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  try {
    const cls = await getClassDetail(id, { viewerId: session.user.id });
    const classRole = await resolveUserClassRole(
      cls.id,
      session.user.id,
      session.user.role,
      cls.teacherId
    );
    if (!classRole) {
      redirect("/teacher");
    }

    const serialized: ClassDetailData = {
      id: cls.id,
      name: cls.name,
      description: cls.description,
      joinCode: cls.joinCode,
      archived: cls.archived,
      requireApproval: cls.requireApproval,
      teacher: cls.teacher,
      classTeachers: cls.classTeachers.map((ct) => ({
        id: ct.id,
        userId: ct.userId,
        role: ct.role,
        user: ct.user,
      })),
      enrollments: cls.enrollments.map((e) => ({
        id: e.id,
        status: e.status,
        joinedAt: e.joinedAt.toISOString(),
        student: {
          id: e.student.id,
          name: e.student.name,
          email: e.student.email,
          avatarUrl: e.student.avatarUrl,
          parentLinksAsChild: e.student.parentLinksAsChild,
        },
      })),
      posts: cls.posts,
      workbooks: cls.workbooks,
      lessonActiveStudentCount: cls.lessonActiveStudentCount,
      lessons: cls.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        order: l.order,
        ownerId: l.ownerId,
        owner: l.owner,
        items: l.items.map((it) => ({
          id: it.id,
          title: it.title,
          type: it.type,
          fileKey: it.fileKey,
          url: it.url,
          order: it.order,
          completedCount: it.completedCount,
          completedByMe: it.completedByMe,
        })),
      })),
      assignments: cls.assignments.map((a) => ({
        id: a.id,
        title: a.title,
        dueAt: a.dueAt?.toISOString() ?? null,
        timeLimitMin: a.timeLimitMin,
        proctorMode: a.proctorMode,
        requireCamera: a.requireCamera,
        requireMicMonitor: a.requireMicMonitor,
        violationAction: a.violationAction,
        maxViolations: a.maxViolations,
        workbookId: a.workbookId,
        workbookOrder: a.workbookOrder,
        unlockAfterAssignmentId: a.unlockAfterAssignmentId,
        workbook: a.workbook,
        isLockedByPrerequisite: a.isLockedByPrerequisite,
        worksheet: a.worksheet,
        _count: a._count,
      })),
    };

    return (
      <ClassDetailView
        initialClass={serialized}
        isTeacher={true}
        currentUserId={session.user.id}
        isAdmin={session.user.role === "ADMIN"}
        classRole={classRole}
      />
    );
  } catch {
    notFound();
  }
}
