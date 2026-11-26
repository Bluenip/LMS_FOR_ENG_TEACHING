import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getClassDetail } from "@/server/classService";
import { ClassDetailView, type ClassDetailData } from "@/components/classes/ClassDetailView";

export default async function StudentClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const enrollment = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId: id, studentId: session.user.id } },
  });
  if (!enrollment || enrollment.status !== "ACTIVE") {
    redirect("/student");
  }

  try {
    const cls = await getClassDetail(id, { studentId: session.user.id });
    const serialized: ClassDetailData = {
      id: cls.id,
      name: cls.name,
      description: cls.description,
      joinCode: cls.joinCode,
      archived: cls.archived,
      requireApproval: cls.requireApproval,
      teacher: cls.teacher,
      enrollments: cls.enrollments
        .filter((e) => e.status === "ACTIVE")
        .map((e) => ({
          id: e.id,
          status: e.status,
          joinedAt: e.joinedAt.toISOString(),
          student: { id: e.student.id, name: e.student.name },
        })),
      posts: cls.posts.map((p) => ({
        id: p.id,
        content: p.content,
        createdAt: p.createdAt.toISOString(),
        author: p.author,
        comments: p.comments.map((c) => ({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt.toISOString(),
          author: c.author,
        })),
      })),
      lessons: cls.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        order: l.order,
        items: l.items.map((it) => ({
          id: it.id,
          title: it.title,
          type: it.type,
          fileKey: it.fileKey,
          url: it.url,
          order: it.order,
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
        worksheet: a.worksheet,
        _count: a._count,
      })),
    };

    return (
      <ClassDetailView
        initialClass={serialized}
        isTeacher={false}
        currentUserId={session.user.id}
      />
    );
  } catch {
    notFound();
  }
}
