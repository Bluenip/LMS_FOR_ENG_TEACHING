import crypto from "node:crypto";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { detectImageMeta } from "@/lib/image-meta";
import { getStorageProvider } from "@/lib/storage";

export const ALLOWED_POST_EMOJIS = ["👍", "❤️", "🎉", "💡", "👏", "😮"] as const;
const MAX_POST_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export interface PostAttachmentMeta {
  key: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export const POST_RICH_INCLUDE = {
  author: { select: { id: true, name: true, role: true } },
  comments: {
    include: { author: { select: { id: true, name: true, role: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  poll: {
    include: {
      options: {
        orderBy: { order: "asc" as const },
        include: {
          votes: { select: { userId: true } },
        },
      },
    },
  },
  reactions: {
    select: { emoji: true, userId: true },
  },
} satisfies Prisma.PostInclude;

export type RawRichPost = Prisma.PostGetPayload<{ include: typeof POST_RICH_INCLUDE }>;

export function serializePostForViewer(post: RawRichPost, viewerId?: string) {
  const attachments: PostAttachmentMeta[] = Array.isArray(post.attachments)
    ? (post.attachments as unknown as PostAttachmentMeta[]).filter(
        (a) => a && typeof a.key === "string" && typeof a.name === "string"
      )
    : [];

  let poll: {
    id: string;
    question: string;
    allowMultiple: boolean;
    closesAt: string | null;
    totalVotes: number;
    options: Array<{ id: string; text: string; order: number; voteCount: number; votedByMe: boolean }>;
  } | null = null;

  if (post.poll) {
    const voters = new Set<string>();
    const options = post.poll.options.map((o) => {
      for (const v of o.votes) voters.add(v.userId);
      return {
        id: o.id,
        text: o.text,
        order: o.order,
        voteCount: o.votes.length,
        votedByMe: viewerId ? o.votes.some((v) => v.userId === viewerId) : false,
      };
    });
    poll = {
      id: post.poll.id,
      question: post.poll.question,
      allowMultiple: post.poll.allowMultiple,
      closesAt: post.poll.closesAt ? post.poll.closesAt.toISOString() : null,
      totalVotes: voters.size,
      options,
    };
  }

  const reactionMap = new Map<string, { count: number; reactedByMe: boolean }>();
  for (const r of post.reactions) {
    const cur = reactionMap.get(r.emoji) ?? { count: 0, reactedByMe: false };
    cur.count += 1;
    if (viewerId && r.userId === viewerId) cur.reactedByMe = true;
    reactionMap.set(r.emoji, cur);
  }
  const reactions = Array.from(reactionMap.entries()).map(([emoji, info]) => ({
    emoji,
    count: info.count,
    reactedByMe: info.reactedByMe,
  }));

  return {
    id: post.id,
    content: post.content,
    pinned: post.pinned,
    commentsLocked: post.commentsLocked,
    attachments,
    createdAt: post.createdAt.toISOString(),
    author: post.author,
    comments: post.comments.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.createdAt.toISOString(),
      author: c.author,
    })),
    poll,
    reactions,
  };
}

function detectPostAttachmentType(
  buffer: Buffer,
  originalName: string
): { ext: string; mime: string } | null {
  const img = detectImageMeta(buffer);
  if (img) return { ext: img.ext, mime: img.mime };

  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { ext: ".pdf", mime: "application/pdf" };
  }

  // DOCX = ZIP local file header PK\x03\x04 + .docx extension
  const origExt = path.extname(originalName).toLowerCase();
  if (
    origExt === ".docx" &&
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return {
      ext: ".docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }

  return null;
}

export async function uploadPostAttachment(
  classId: string,
  file: { buffer: Buffer; originalName: string; mimeType: string }
): Promise<PostAttachmentMeta> {
  if (file.buffer.byteLength <= 0 || file.buffer.byteLength > MAX_POST_ATTACHMENT_BYTES) {
    throw new AppError("Kích thước file không hợp lệ hoặc vượt quá giới hạn.", 400, "FILE_TOO_LARGE");
  }
  const detected = detectPostAttachmentType(file.buffer, file.originalName);
  if (!detected) {
    throw new AppError(
      "Chỉ hỗ trợ ảnh (PNG, JPG, WebP), PDF hoặc file Word (.docx).",
      400,
      "INVALID_FILE"
    );
  }
  const key = `classes/${classId}/posts/${crypto.randomUUID()}${detected.ext}`;
  const storage = getStorageProvider();
  await storage.put(key, file.buffer, detected.mime, {
    fileName: file.originalName,
  });
  return {
    key,
    name: file.originalName.slice(0, 180) || `file${detected.ext}`,
    mimeType: detected.mime,
    sizeBytes: file.buffer.byteLength,
  };
}

export async function createPost(
  classId: string,
  authorId: string,
  input:
    | string
    | {
        content: string;
        attachments?: PostAttachmentMeta[];
        poll?: {
          question: string;
          allowMultiple?: boolean;
          closesAt?: string | null;
          options: string[];
        } | null;
      }
) {
  const payload = typeof input === "string" ? { content: input } : input;
  const prefix = `classes/${classId}/posts/`;
  const safeAttachments = (payload.attachments ?? []).filter(
    (a) => a.key.startsWith(prefix) && !a.key.includes("..")
  );

  const created = await prisma.post.create({
    data: {
      classId,
      authorId,
      content: payload.content,
      ...(safeAttachments.length > 0
        ? { attachments: safeAttachments as unknown as Prisma.InputJsonValue }
        : {}),
      ...(payload.poll
        ? {
            poll: {
              create: {
                question: payload.poll.question,
                allowMultiple: Boolean(payload.poll.allowMultiple),
                closesAt: payload.poll.closesAt ? new Date(payload.poll.closesAt) : null,
                options: {
                  create: payload.poll.options.map((text, idx) => ({
                    text,
                    order: idx,
                  })),
                },
              },
            },
          }
        : {}),
    },
    include: POST_RICH_INCLUDE,
  });

  return serializePostForViewer(created, authorId);
}

export async function updatePostModeration(
  classId: string,
  postId: string,
  input: { pinned?: boolean; commentsLocked?: boolean },
  viewerId?: string
) {
  const existing = await prisma.post.findFirst({ where: { id: postId, classId } });
  if (!existing) {
    throw new AppError("Không tìm thấy bài đăng.", 404, "NOT_FOUND");
  }
  const updated = await prisma.post.update({
    where: { id: postId },
    data: {
      ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
      ...(input.commentsLocked !== undefined ? { commentsLocked: input.commentsLocked } : {}),
    },
    include: POST_RICH_INCLUDE,
  });
  return serializePostForViewer(updated, viewerId);
}

export async function deletePost(
  classId: string,
  postId: string,
  actorId: string,
  isTeacher: boolean
) {
  const post = await prisma.post.findFirst({ where: { id: postId, classId } });
  if (!post) {
    throw new AppError("Không tìm thấy bài đăng.", 404, "NOT_FOUND");
  }
  if (!isTeacher && post.authorId !== actorId) {
    throw new AppError("Bạn không có quyền xoá bài đăng này.", 403, "FORBIDDEN");
  }
  return prisma.post.delete({ where: { id: post.id } });
}

export async function createComment(
  classId: string,
  postId: string,
  authorId: string,
  content: string,
  isTeacher = false
) {
  const post = await prisma.post.findFirst({ where: { id: postId, classId } });
  if (!post) {
    throw new AppError("Không tìm thấy bài đăng.", 404, "NOT_FOUND");
  }
  if (post.commentsLocked && !isTeacher) {
    throw new AppError("Bài đăng này đã khoá bình luận.", 403, "COMMENTS_LOCKED");
  }
  return prisma.comment.create({
    data: { postId, authorId, content },
    include: { author: { select: { id: true, name: true, role: true } } },
  });
}

export async function voteOnPostPoll(
  classId: string,
  postId: string,
  userId: string,
  optionIds: string[]
) {
  const post = await prisma.post.findFirst({
    where: { id: postId, classId },
    include: { poll: { include: { options: { select: { id: true } } } } },
  });
  if (!post) {
    throw new AppError("Không tìm thấy bài đăng.", 404, "NOT_FOUND");
  }
  if (!post.poll) {
    throw new AppError("Bài đăng này không có bình chọn.", 404, "NOT_FOUND");
  }
  if (post.poll.closesAt && new Date() >= post.poll.closesAt) {
    throw new AppError("Cuộc bình chọn đã đóng.", 400, "POLL_CLOSED");
  }

  const uniqueIds = Array.from(new Set(optionIds));
  if (uniqueIds.length === 0) {
    throw new AppError("Vui lòng chọn ít nhất 1 phương án bình chọn.", 400, "VALIDATION_ERROR");
  }
  if (!post.poll.allowMultiple && uniqueIds.length > 1) {
    throw new AppError("Bình chọn này chỉ cho phép chọn 1 phương án.", 400, "SINGLE_CHOICE_POLL");
  }

  const validOptionSet = new Set(post.poll.options.map((o) => o.id));
  if (uniqueIds.some((id) => !validOptionSet.has(id))) {
    throw new AppError("Lựa chọn bình chọn không hợp lệ.", 400, "INVALID_OPTION");
  }

  const pollOptionIds = post.poll.options.map((o) => o.id);
  await prisma.$transaction(async (tx) => {
    await tx.postPollVote.deleteMany({
      where: { userId, optionId: { in: pollOptionIds } },
    });
    await tx.postPollVote.createMany({
      data: uniqueIds.map((optionId) => ({ optionId, userId })),
    });
  });

  const refreshed = await prisma.post.findUniqueOrThrow({
    where: { id: postId },
    include: POST_RICH_INCLUDE,
  });
  return serializePostForViewer(refreshed, userId);
}

export async function togglePostReaction(
  classId: string,
  postId: string,
  userId: string,
  emoji: string
) {
  if (!ALLOWED_POST_EMOJIS.includes(emoji as (typeof ALLOWED_POST_EMOJIS)[number])) {
    throw new AppError("Biểu tượng cảm xúc không hợp lệ.", 400, "INVALID_EMOJI");
  }
  const post = await prisma.post.findFirst({ where: { id: postId, classId }, select: { id: true } });
  if (!post) {
    throw new AppError("Không tìm thấy bài đăng.", 404, "NOT_FOUND");
  }

  const existing = await prisma.postReaction.findUnique({
    where: { postId_userId_emoji: { postId, userId, emoji } },
    select: { id: true },
  });
  if (existing) {
    await prisma.postReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.postReaction.create({ data: { postId, userId, emoji } });
  }

  const refreshed = await prisma.post.findUniqueOrThrow({
    where: { id: postId },
    include: POST_RICH_INCLUDE,
  });
  return serializePostForViewer(refreshed, userId);
}
