import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
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
    const cls = await getClassDetail(id);
    if (session.user.role !== "ADMIN" && cls.teacherId !== session.user.id) {
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
        ownerId: l.ownerId,
        owner: l.owner,
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
        violationAction: a.violationAction,
        maxViolations: a.maxViolations,
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
      />
    );
  } catch {
    notFound();
  }
}
