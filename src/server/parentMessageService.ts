import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hasMinClassRole } from "@/lib/class-roles";
import { resolveUserClassRole } from "./classRoleHelper";
import { createNotificationsBulk } from "./notificationService";

interface ThreadActor {
  id: string;
  role: Role;
}

async function assertClassMemberParticipant(
  actor: ThreadActor,
  classId: string,
  studentId: string,
  parentId?: string
) {
  const cls = await prisma.class.findUnique({
    where: { id: classId },
    select: {
      id: true,
      name: true,
      teacherId: true,
      deletedAt: true,
      classTeachers: {
        where: { role: { in: ["OWNER", "CO_TEACHER"] } },
        select: { userId: true },
      },
    },
  });
  if (!cls || cls.deletedAt) {
    throw new AppError("Không tìm thấy lớp học.", 404, "NOT_FOUND");
  }

  // Student must be ACTIVE in classId
  const enrollment = await prisma.enrollment.findUnique({
    where: { classId_studentId: { classId, studentId } },
    select: { status: true, student: { select: { id: true, name: true, deletedAt: true } } },
  });
  if (!enrollment || enrollment.status !== "ACTIVE" || enrollment.student.deletedAt) {
    throw new AppError("Học sinh không thuộc lớp của bạn.", 403, "FORBIDDEN");
  }

  let resolvedParentId = parentId;
  if (actor.role === "PARENT") {
    resolvedParentId = actor.id;
  } else if (!resolvedParentId) {
    // Pick the first verified parent of the student
    const firstLink = await prisma.parentLink.findFirst({
      where: { studentId, verifiedAt: { not: null }, parent: { deletedAt: null } },
      select: { parentId: true },
      orderBy: { createdAt: "asc" },
    });
    if (!firstLink) {
      throw new AppError(
        "Không tìm thấy phụ huynh đã liên kết với học sinh này.",
        404,
        "NOT_FOUND"
      );
    }
    resolvedParentId = firstLink.parentId;
  }

  // Verify verified ParentLink between resolvedParentId and studentId
  const link = await prisma.parentLink.findUnique({
    where: { parentId_studentId: { parentId: resolvedParentId, studentId } },
    select: {
      verifiedAt: true,
      parent: { select: { id: true, name: true, deletedAt: true } },
    },
  });
  if (!link || !link.verifiedAt || link.parent.deletedAt) {
    throw new AppError(
      "Không tìm thấy phụ huynh đã liên kết với học sinh này.",
      403,
      "FORBIDDEN"
    );
  }

  if (actor.role === "PARENT") {
    if (actor.id !== resolvedParentId) {
      throw new AppError("Bạn không có quyền tham gia cuộc hội thoại này.", 403, "FORBIDDEN");
    }
  } else if (actor.role === "ADMIN") {
    // Allowed
  } else if (actor.role === "TEACHER") {
    const cr = await resolveUserClassRole(cls.id, actor.id, actor.role, cls.teacherId);
    if (!hasMinClassRole(cr, "ASSISTANT")) {
      throw new AppError("Bạn không có quyền tham gia cuộc hội thoại này.", 403, "FORBIDDEN");
    }
  } else {
    throw new AppError("Bạn không có quyền tham gia cuộc hội thoại này.", 403, "FORBIDDEN");
  }

  const teacherRecipientIds = Array.from(
    new Set([cls.teacherId, ...cls.classTeachers.map((ct) => ct.userId)])
  );

  return {
    cls,
    student: enrollment.student,
    parent: link.parent,
    teacherRecipientIds,
  };
}

async function assertThreadAccess(actor: ThreadActor, threadId: string) {
  const thread = await prisma.parentThread.findUnique({
    where: { id: threadId },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          teacherId: true,
          deletedAt: true,
          teacher: { select: { id: true, name: true } },
          classTeachers: {
            where: { role: { in: ["OWNER", "CO_TEACHER"] } },
            select: { userId: true },
          },
        },
      },
      parent: { select: { id: true, name: true, role: true } },
      student: { select: { id: true, name: true } },
    },
  });

  if (!thread || thread.class.deletedAt) {
    throw new AppError("Không tìm thấy cuộc hội thoại.", 404, "NOT_FOUND");
  }

  if (actor.role === "PARENT") {
    if (actor.id !== thread.parentId) {
      throw new AppError("Bạn không có quyền tham gia cuộc hội thoại này.", 403, "FORBIDDEN");
    }
    const link = await prisma.parentLink.findUnique({
      where: {
        parentId_studentId: { parentId: actor.id, studentId: thread.studentId },
      },
      select: { verifiedAt: true },
    });
    if (!link?.verifiedAt) {
      throw new AppError("Bạn không có quyền tham gia cuộc hội thoại này.", 403, "FORBIDDEN");
    }
  } else if (actor.role === "TEACHER") {
    const cr = await resolveUserClassRole(
      thread.classId,
      actor.id,
      actor.role,
      thread.class.teacherId
    );
    if (!hasMinClassRole(cr, "ASSISTANT")) {
      throw new AppError("Bạn không có quyền tham gia cuộc hội thoại này.", 403, "FORBIDDEN");
    }
  } else if (actor.role !== "ADMIN") {
    throw new AppError("Bạn không có quyền tham gia cuộc hội thoại này.", 403, "FORBIDDEN");
  }

  const teacherRecipientIds = Array.from(
    new Set([
      thread.class.teacherId,
      ...thread.class.classTeachers.map((ct) => ct.userId),
    ])
  );

  return { thread, teacherRecipientIds };
}

export async function listThreadsForUser(actor: ThreadActor) {
  let where;
  if (actor.role === "PARENT") {
    where = { parentId: actor.id, class: { deletedAt: null } };
  } else if (actor.role === "ADMIN") {
    where = { class: { deletedAt: null } };
  } else if (actor.role === "TEACHER") {
    where = {
      class: {
        deletedAt: null,
        OR: [
          { teacherId: actor.id },
          { classTeachers: { some: { userId: actor.id } } },
        ],
      },
    };
  } else {
    throw new AppError("Bạn không có quyền truy cập chức năng này.", 403, "FORBIDDEN");
  }

  const threads = await prisma.parentThread.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    include: {
      class: {
        select: { id: true, name: true, teacher: { select: { id: true, name: true } } },
      },
      parent: { select: { id: true, name: true, email: true } },
      student: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, senderId: true, content: true, readAt: true, createdAt: true },
      },
    },
  });

  // Unread counts per thread (messages sent by the other side with readAt === null)
  const unreadCountsRaw = await prisma.parentMessage.groupBy({
    by: ["threadId"],
    where: {
      threadId: { in: threads.map((t) => t.id) },
      readAt: null,
      senderId: { not: actor.id },
    },
    _count: { _all: true },
  });
  const unreadByThread = new Map(unreadCountsRaw.map((u) => [u.threadId, u._count._all]));

  // Available verified contacts to initiate a new conversation
  const availableContacts: Array<{
    classId: string;
    className: string;
    studentId: string;
    studentName: string;
    parentId: string;
    parentName: string;
    teacherName: string;
  }> = [];

  if (actor.role === "PARENT") {
    const links = await prisma.parentLink.findMany({
      where: { parentId: actor.id, verifiedAt: { not: null }, student: { deletedAt: null } },
      select: {
        parent: { select: { id: true, name: true } },
        student: {
          select: {
            id: true,
            name: true,
            enrollments: {
              where: { status: "ACTIVE", class: { deletedAt: null } },
              select: {
                class: {
                  select: {
                    id: true,
                    name: true,
                    teacher: { select: { name: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    for (const l of links) {
      for (const enr of l.student.enrollments) {
        availableContacts.push({
          classId: enr.class.id,
          className: enr.class.name,
          studentId: l.student.id,
          studentName: l.student.name,
          parentId: l.parent.id,
          parentName: l.parent.name,
          teacherName: enr.class.teacher.name,
        });
      }
    }
  } else if (actor.role === "TEACHER" || actor.role === "ADMIN") {
    const classes = await prisma.class.findMany({
      where: {
        deletedAt: null,
        archived: false,
        ...(actor.role === "ADMIN"
          ? {}
          : {
              OR: [
                { teacherId: actor.id },
                { classTeachers: { some: { userId: actor.id } } },
              ],
            }),
      },
      select: {
        id: true,
        name: true,
        teacher: { select: { name: true } },
        enrollments: {
          where: { status: "ACTIVE", student: { deletedAt: null } },
          select: {
            student: {
              select: {
                id: true,
                name: true,
                parentLinksAsChild: {
                  where: { verifiedAt: { not: null }, parent: { deletedAt: null } },
                  select: { parent: { select: { id: true, name: true } } },
                },
              },
            },
          },
        },
      },
    });
    for (const c of classes) {
      for (const enr of c.enrollments) {
        for (const pl of enr.student.parentLinksAsChild) {
          availableContacts.push({
            classId: c.id,
            className: c.name,
            studentId: enr.student.id,
            studentName: enr.student.name,
            parentId: pl.parent.id,
            parentName: pl.parent.name,
            teacherName: c.teacher.name,
          });
        }
      }
    }
  }

  return {
    threads: threads.map((t) => ({
      id: t.id,
      classId: t.class.id,
      className: t.class.name,
      teacherId: t.class.teacher.id,
      teacherName: t.class.teacher.name,
      parentId: t.parent.id,
      parentName: t.parent.name,
      studentId: t.student.id,
      studentName: t.student.name,
      lastMessageAt: t.lastMessageAt.toISOString(),
      lastMessage: t.messages[0]
        ? {
            content: t.messages[0].content,
            createdAt: t.messages[0].createdAt.toISOString(),
            senderId: t.messages[0].senderId,
          }
        : null,
      unreadCount: unreadByThread.get(t.id) ?? 0,
    })),
    totalUnread: Array.from(unreadByThread.values()).reduce((a, b) => a + b, 0),
    availableContacts,
  };
}

export async function openOrCreateParentThread(
  actor: ThreadActor,
  input: { classId: string; studentId: string; parentId?: string }
) {
  const { cls, student, parent } = await assertClassMemberParticipant(
    actor,
    input.classId,
    input.studentId,
    input.parentId
  );

  const thread = await prisma.parentThread.upsert({
    where: {
      classId_parentId_studentId: {
        classId: cls.id,
        parentId: parent.id,
        studentId: student.id,
      },
    },
    create: {
      classId: cls.id,
      parentId: parent.id,
      studentId: student.id,
    },
    update: {},
  });

  return thread;
}

export async function getParentThreadMessages(
  actor: ThreadActor,
  threadId: string,
  opts?: { markRead?: boolean }
) {
  const { thread } = await assertThreadAccess(actor, threadId);

  if (opts?.markRead !== false) {
    await prisma.parentMessage.updateMany({
      where: { threadId, senderId: { not: actor.id }, readAt: null },
      data: { readAt: new Date() },
    });
  }

  const messages = await prisma.parentMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: { id: true, name: true, role: true } },
    },
  });

  return {
    thread: {
      id: thread.id,
      classId: thread.class.id,
      className: thread.class.name,
      teacherName: thread.class.teacher.name,
      parentId: thread.parent.id,
      parentName: thread.parent.name,
      studentId: thread.student.id,
      studentName: thread.student.name,
    },
    messages: messages.map((m) => ({
      id: m.id,
      senderId: m.senderId,
      senderName: m.sender.name,
      senderRole: m.sender.role,
      content: m.content,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function markParentThreadRead(actor: ThreadActor, threadId: string) {
  await assertThreadAccess(actor, threadId);
  const res = await prisma.parentMessage.updateMany({
    where: { threadId, senderId: { not: actor.id }, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: res.count };
}

export async function sendParentThreadMessage(
  actor: ThreadActor,
  threadId: string,
  content: string
) {
  const { thread, teacherRecipientIds } = await assertThreadAccess(actor, threadId);
  const sender = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { name: true },
  });
  const senderName = sender?.name ?? "Pivora";

  const now = new Date();
  const [msg] = await prisma.$transaction([
    prisma.parentMessage.create({
      data: {
        threadId,
        senderId: actor.id,
        content: content.trim(),
      },
      include: { sender: { select: { id: true, name: true, role: true } } },
    }),
    prisma.parentThread.update({
      where: { id: threadId },
      data: { lastMessageAt: now },
    }),
  ]);

  const recipientIds =
    actor.role === "PARENT"
      ? teacherRecipientIds.filter((id) => id !== actor.id)
      : [thread.parentId];

  if (recipientIds.length > 0) {
    await createNotificationsBulk(
      recipientIds.map((userId) => ({
        userId,
        type: "PARENT_MESSAGE",
        title: `Tin nhắn mới từ ${senderName}`,
        body: `[${thread.class.name} • HS ${thread.student.name}] ${content.trim().slice(0, 140)}`,
        link: `/messages?thread=${thread.id}`,
      }))
    );
  }

  return {
    id: msg.id,
    senderId: msg.senderId,
    senderName: msg.sender.name,
    senderRole: msg.sender.role,
    content: msg.content,
    readAt: msg.readAt?.toISOString() ?? null,
    createdAt: msg.createdAt.toISOString(),
  };
}
