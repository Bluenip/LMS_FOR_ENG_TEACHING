"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  FileText,
  Lock,
  MessageSquare,
  Pin,
  PinOff,
  Send,
  Trash2,
  Unlock,
} from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { formatDateTime, getInitials } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface RichPostDTO {
  id: string;
  content: string;
  pinned?: boolean;
  commentsLocked?: boolean;
  attachments?: Array<{
    key: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  createdAt: string;
  author: { id: string; name: string; role: string };
  comments: Array<{
    id: string;
    content: string;
    createdAt: string;
    author: { id: string; name: string; role: string };
  }>;
  poll?: {
    id: string;
    question: string;
    allowMultiple: boolean;
    closesAt: string | null;
    totalVotes: number;
    options: Array<{
      id: string;
      text: string;
      order: number;
      voteCount: number;
      votedByMe: boolean;
    }>;
  } | null;
  reactions?: Array<{
    emoji: string;
    count: number;
    reactedByMe: boolean;
  }>;
}

const QUICK_EMOJIS = ["👍", "❤️", "🎉", "💡", "👏", "😮"] as const;

export function PostCard({
  classId,
  post,
  isTeacher,
  canModerate,
  currentUserId,
  onPostUpdated,
  onPostDeleted,
  onCommentAdded,
}: {
  classId: string;
  post: RichPostDTO;
  isTeacher: boolean;
  canModerate: boolean;
  currentUserId: string;
  onPostUpdated: (updated: RichPostDTO) => void;
  onPostDeleted: (postId: string) => void;
  onCommentAdded: (postId: string, comment: RichPostDTO["comments"][number]) => void;
}) {
  const { tr, locale } = useI18n();
  const [commentText, setCommentText] = useState("");
  const [commenting, setCommenting] = useState(false);

  const handleTogglePin = async () => {
    try {
      const res = await apiFetchJson<{ post: RichPostDTO }>(
        `/api/classes/${classId}/posts/${post.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned: !post.pinned }),
        }
      );
      onPostUpdated(res.post);
      toast.success(
        res.post.pinned ? tr("Đã ghim bài đăng.", "Post pinned.") : tr("Đã bỏ ghim.", "Post unpinned.")
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Thao tác thất bại", "Action failed"));
    }
  };

  const handleToggleLock = async () => {
    try {
      const res = await apiFetchJson<{ post: RichPostDTO }>(
        `/api/classes/${classId}/posts/${post.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ commentsLocked: !post.commentsLocked }),
        }
      );
      onPostUpdated(res.post);
      toast.success(
        res.post.commentsLocked
          ? tr("Đã khoá bình luận.", "Comments locked.")
          : tr("Đã mở bình luận.", "Comments unlocked.")
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Thao tác thất bại", "Action failed"));
    }
  };

  const handleDelete = async () => {
    try {
      await apiFetchJson(`/api/classes/${classId}/posts/${post.id}`, {
        method: "DELETE",
      });
      onPostDeleted(post.id);
      toast.success(tr("Đã xoá bài đăng.", "Post deleted."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Xoá thất bại", "Delete failed"));
    }
  };

  const handleVote = async (optionId: string) => {
    if (!post.poll) return;
    let nextIds: string[];
    if (post.poll.allowMultiple) {
      const current = post.poll.options.filter((o) => o.votedByMe).map((o) => o.id);
      nextIds = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      if (nextIds.length === 0) return;
    } else {
      nextIds = [optionId];
    }
    try {
      const res = await apiFetchJson<{ post: RichPostDTO }>(
        `/api/classes/${classId}/posts/${post.id}/vote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionIds: nextIds }),
        }
      );
      onPostUpdated(res.post);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Bình chọn thất bại", "Vote failed"));
    }
  };

  const handleReact = async (emoji: string) => {
    try {
      const res = await apiFetchJson<{ post: RichPostDTO }>(
        `/api/classes/${classId}/posts/${post.id}/react`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji }),
        }
      );
      onPostUpdated(res.post);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Thao tác thất bại", "Action failed"));
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || commenting) return;
    setCommenting(true);
    try {
      const res = await apiFetchJson<{ comment: RichPostDTO["comments"][number] }>(
        `/api/classes/${classId}/posts/${post.id}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: commentText.trim() }),
        }
      );
      onCommentAdded(post.id, res.comment);
      setCommentText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Gửi bình luận thất bại", "Comment failed"));
    } finally {
      setCommenting(false);
    }
  };

  const reactionMap = new Map((post.reactions ?? []).map((r) => [r.emoji, r]));

  return (
    <article
      className={`stitch-card p-5 space-y-4 ${
        post.pinned ? "border-indigo-300 dark:border-indigo-700 bg-indigo-50/20 dark:bg-indigo-950/15" : ""
      }`}
      data-testid={`post-card-${post.id}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950 text-xs font-bold text-[#3525CD] dark:text-indigo-300">
            {getInitials(post.author.name)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-sm font-bold text-[#0B1C30] dark:text-slate-100">
                {post.author.name}
              </p>
              {post.author.role !== "STUDENT" && (
                <Badge variant="indigo">{tr("Giáo viên", "Teacher")}</Badge>
              )}
              {post.pinned && (
                <Badge variant="orange" data-testid={`pinned-badge-${post.id}`}>
                  <Pin className="mr-1 h-3 w-3" />
                  {tr("Đã ghim", "Pinned")}
                </Badge>
              )}
              {post.commentsLocked && (
                <Badge variant="sky">
                  <Lock className="mr-1 h-3 w-3" />
                  {tr("Khoá bình luận", "Comments locked")}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {formatDateTime(post.createdAt, locale)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {canModerate && (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleTogglePin}
                data-testid={`pin-post-btn-${post.id}`}
                title={post.pinned ? tr("Bỏ ghim", "Unpin") : tr("Ghim lên đầu", "Pin to top")}
                className="min-h-10 min-w-10 p-2"
              >
                {post.pinned ? (
                  <PinOff className="h-4 w-4 text-amber-600" />
                ) : (
                  <Pin className="h-4 w-4 text-slate-500" />
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleToggleLock}
                data-testid={`lock-post-btn-${post.id}`}
                title={
                  post.commentsLocked
                    ? tr("Mở bình luận", "Unlock comments")
                    : tr("Khoá bình luận", "Lock comments")
                }
                className="min-h-10 min-w-10 p-2"
              >
                {post.commentsLocked ? (
                  <Unlock className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Lock className="h-4 w-4 text-slate-500" />
                )}
              </Button>
            </>
          )}
          {(isTeacher || post.author.id === currentUserId) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleDelete}
              title={tr("Xoá bài đăng", "Delete post")}
              className="min-h-10 min-w-10 p-2 text-red-500 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#0B1C30] dark:text-slate-200">
        {post.content}
      </p>

      {/* Attachments */}
      {post.attachments && post.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {post.attachments.map((att) =>
            att.mimeType.startsWith("image/") ? (
              <a
                key={att.key}
                href={`/api/files/${att.key}`}
                target="_blank"
                rel="noreferrer"
                className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/files/${att.key}`}
                  alt={att.name}
                  className="max-h-56 max-w-full object-contain"
                />
              </a>
            ) : (
              <a
                key={att.key}
                href={`/api/files/${att.key}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-[#3525CD] dark:text-indigo-300 hover:bg-indigo-50"
              >
                <FileText className="h-4 w-4" />
                {att.name}
              </a>
            )
          )}
        </div>
      )}

      {/* Poll */}
      {post.poll && (
        <div
          className="space-y-2 rounded-2xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/25 p-4"
          data-testid={`post-poll-${post.id}`}
        >
          <p className="text-sm font-bold text-[#0B1C30] dark:text-slate-100">
            {post.poll.question}
          </p>
          <div className="space-y-2">
            {post.poll.options.map((opt) => {
              const totalOptionVotes = post.poll!.options.reduce(
                (acc, o) => acc + o.voteCount,
                0
              );
              const pct =
                totalOptionVotes > 0
                  ? Math.round((opt.voteCount / totalOptionVotes) * 100)
                  : 0;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleVote(opt.id)}
                  data-testid={`poll-option-${opt.id}`}
                  className={`relative w-full min-h-10 overflow-hidden rounded-xl border px-3 py-2 text-left text-xs transition ${
                    opt.votedByMe
                      ? "border-[#4F46E5] bg-white dark:bg-slate-900 font-bold text-[#3525CD] dark:text-indigo-300"
                      : "border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/70 text-[#0B1C30] dark:text-slate-200 hover:border-indigo-300"
                  }`}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-indigo-100/70 dark:bg-indigo-800/35 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex items-center justify-between gap-2">
                    <span>{opt.text}</span>
                    <span className="tabular-nums text-[11px] font-semibold">
                      {opt.voteCount} ({pct}%)
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400">
            {post.poll.totalVotes} {tr("người đã bình chọn", "voters")}
            {post.poll.allowMultiple
              ? ` • ${tr("Chọn nhiều phương án", "Multiple choices allowed")}`
              : ""}
          </p>
        </div>
      )}

      {/* Reactions */}
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK_EMOJIS.map((emoji) => {
          const info = reactionMap.get(emoji);
          return (
            <button
              key={emoji}
              type="button"
              onClick={() => handleReact(emoji)}
              data-testid={`react-btn-${post.id}-${emoji}`}
              className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
                info?.reactedByMe
                  ? "border-[#4F46E5] bg-indigo-50 dark:bg-indigo-950/60 font-bold text-[#3525CD] dark:text-indigo-300"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50"
              }`}
            >
              <span>{emoji}</span>
              {info && info.count > 0 && <span className="tabular-nums">{info.count}</span>}
            </button>
          );
        })}
      </div>

      {/* Comments */}
      <div className="space-y-2.5 border-t border-slate-100 dark:border-slate-800 pt-3">
        {post.comments.length > 0 && (
          <div className="space-y-2">
            {post.comments.map((c) => (
              <div
                key={c.id}
                className="rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-[#0B1C30] dark:text-slate-100">
                    {c.author.name}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {formatDateTime(c.createdAt, locale)}
                  </span>
                </div>
                <p className="mt-0.5 text-[#464555] dark:text-slate-300">{c.content}</p>
              </div>
            ))}
          </div>
        )}

        {post.commentsLocked && !isTeacher ? (
          <p className="flex items-center gap-1.5 text-xs italic text-slate-400">
            <MessageSquare className="h-3.5 w-3.5" />
            {tr("Giáo viên đã khoá bình luận bài đăng này.", "Comments have been locked by the teacher.")}
          </p>
        ) : (
          <form onSubmit={handleAddComment} className="flex items-center gap-2">
            <Input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={tr("Viết bình luận…", "Write a comment…")}
              className="h-10 text-xs"
            />
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={commenting || !commentText.trim()}
              className="min-h-10 px-3"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        )}
      </div>
    </article>
  );
}
