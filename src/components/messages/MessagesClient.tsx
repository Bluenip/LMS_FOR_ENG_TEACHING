"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import {
  ArrowLeft,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  UserCheck,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { cn, formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ThreadSummaryDTO {
  id: string;
  classId: string;
  className: string;
  teacherId: string;
  teacherName: string;
  parentId: string;
  parentName: string;
  studentId: string;
  studentName: string;
  lastMessageAt: string;
  lastMessage: {
    content: string;
    createdAt: string;
    senderId: string;
  } | null;
  unreadCount: number;
}

interface AvailableContactDTO {
  classId: string;
  className: string;
  studentId: string;
  studentName: string;
  parentId: string;
  parentName: string;
  teacherName: string;
}

interface ThreadMessagesDTO {
  thread: {
    id: string;
    classId: string;
    className: string;
    teacherName: string;
    parentId: string;
    parentName: string;
    studentId: string;
    studentName: string;
  };
  messages: Array<{
    id: string;
    senderId: string;
    senderName: string;
    senderRole: Role;
    content: string;
    readAt: string | null;
    createdAt: string;
  }>;
}

export function MessagesClient({
  currentUserId,
  currentUserRole,
}: {
  currentUserId: string;
  currentUserRole: Role;
}) {
  const { tr } = useI18n();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(() =>
    searchParams.get("thread")
  );
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const [newChatOpen, setNewChatOpen] = useState(false);
  const [selectedContactIdx, setSelectedContactIdx] = useState("0");
  const [creatingThread, setCreatingThread] = useState(false);

  const { data: threadsData, isLoading: threadsLoading } = useQuery<{
    threads: ThreadSummaryDTO[];
    totalUnread: number;
    availableContacts: AvailableContactDTO[];
  }>({
    queryKey: ["message-threads"],
    queryFn: () =>
      apiFetchJson(
        "/api/messages/threads",
        undefined,
        tr("Không tải được hộp thư", "Could not load inbox")
      ),
    refetchInterval: 15_000,
  });

  const threads = useMemo(() => threadsData?.threads ?? [], [threadsData]);
  const contacts = threadsData?.availableContacts ?? [];

  useEffect(() => {
    if (!selectedThreadId && threads.length > 0 && typeof window !== "undefined" && window.innerWidth >= 768) {
      setSelectedThreadId(threads[0]!.id);
    }
  }, [selectedThreadId, threads]);

  const { data: activeThreadData, isLoading: messagesLoading } = useQuery<ThreadMessagesDTO>({
    queryKey: ["message-thread", selectedThreadId],
    enabled: Boolean(selectedThreadId),
    queryFn: () =>
      apiFetchJson(
        `/api/messages/threads/${selectedThreadId}`,
        undefined,
        tr("Không tải được tin nhắn", "Could not load messages")
      ),
    refetchInterval: 10_000,
  });

  useEffect(() => {
    if (activeThreadData) {
      void queryClient.invalidateQueries({ queryKey: ["messages-unread"] });
      void queryClient.invalidateQueries({ queryKey: ["message-threads"] });
    }
  }, [activeThreadData, queryClient]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThreadId || !content.trim()) return;
    setSending(true);
    try {
      await apiFetchJson(`/api/messages/threads/${selectedThreadId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim() }),
      });
      setContent("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["message-thread", selectedThreadId] }),
        queryClient.invalidateQueries({ queryKey: ["message-threads"] }),
        queryClient.invalidateQueries({ queryKey: ["messages-unread"] }),
      ]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Gửi tin nhắn thất bại", "Failed"));
    } finally {
      setSending(false);
    }
  };

  const handleOpenThread = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = contacts[Number(selectedContactIdx)];
    if (!c) return;
    setCreatingThread(true);
    try {
      const res = await apiFetchJson<{ thread: { id: string } }>("/api/messages/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId: c.classId,
          studentId: c.studentId,
          parentId: c.parentId,
        }),
      });
      setNewChatOpen(false);
      setSelectedThreadId(res.thread.id);
      await queryClient.invalidateQueries({ queryKey: ["message-threads"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Không mở được hội thoại", "Failed"));
    } finally {
      setCreatingThread(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#0B1C30] dark:text-slate-100">
            {tr("Tin nhắn Giáo viên – Phụ huynh", "Teacher–Parent Messages")}
          </h1>
          <p className="text-sm text-[#464555] dark:text-slate-400">
            {tr(
              "Trao đổi trực tiếp 1-1 gắn theo từng học sinh và lớp học.",
              "Direct 1-to-1 communication scoped by student and class."
            )}
          </p>
        </div>

        {contacts.length > 0 && (
          <Button
            type="button"
            variant="accent"
            className="min-h-10"
            data-testid="new-thread-btn"
            onClick={() => {
              setSelectedContactIdx("0");
              setNewChatOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {tr("Cuộc hội thoại mới", "New conversation")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        {/* Thread List */}
        <div
          className={cn(
            "stitch-card overflow-hidden md:col-span-4",
            selectedThreadId ? "hidden md:block" : "block"
          )}
          data-testid="threads-sidebar"
        >
          <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">
            {tr("Hội thoại", "Threads")} ({threads.length})
          </div>
          {threadsLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tr("Đang tải…", "Loading…")}
            </div>
          ) : threads.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              {tr("Chưa có tin nhắn nào.", "No conversations yet.")}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {threads.map((t) => {
                const active = t.id === selectedThreadId;
                const peerName =
                  currentUserRole === "PARENT"
                    ? `${t.teacherName} (${tr("GV", "Teacher")})`
                    : `${t.parentName} (${tr("PH", "Parent")})`;
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`thread-item-${t.id}`}
                    onClick={() => setSelectedThreadId(t.id)}
                    className={cn(
                      "w-full px-4 py-3.5 text-left transition space-y-1",
                      active
                        ? "bg-[#EEF2FF] dark:bg-indigo-950/40"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[#0B1C30] dark:text-slate-100 truncate">
                        {peerName}
                      </span>
                      {t.unreadCount > 0 && (
                        <Badge variant="orange">{t.unreadCount}</Badge>
                      )}
                    </div>
                    <p className="text-[11px] font-semibold text-[#3525CD] dark:text-indigo-300">
                      HS: {t.studentName} · {t.className}
                    </p>
                    {t.lastMessage && (
                      <p className="truncate text-xs text-slate-500">{t.lastMessage.content}</p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Message Thread Pane */}
        <div
          className={cn(
            "stitch-card flex min-h-[460px] flex-col md:col-span-8",
            selectedThreadId ? "flex" : "hidden md:flex"
          )}
          data-testid="messages-pane"
        >
          {!selectedThreadId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-sm text-slate-400">
              <MessageSquare className="h-10 w-10 text-slate-300" />
              {tr("Chọn một hội thoại bên trái để bắt đầu trao đổi.", "Select a conversation to view messages.")}
            </div>
          ) : messagesLoading || !activeThreadData ? (
            <div className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tr("Đang tải tin nhắn…", "Loading messages…")}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="md:hidden min-h-9 px-2"
                    onClick={() => setSelectedThreadId(null)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#0B1C30] dark:text-slate-100 truncate">
                      {currentUserRole === "PARENT"
                        ? activeThreadData.thread.teacherName
                        : activeThreadData.thread.parentName}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      <UserCheck className="h-3.5 w-3.5 text-[#4F46E5]" />
                      HS {activeThreadData.thread.studentName} · {activeThreadData.thread.className}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4 max-h-[420px]" data-testid="messages-list">
                {activeThreadData.messages.length === 0 ? (
                  <p className="py-10 text-center text-xs text-slate-400">
                    {tr("Hãy gửi tin nhắn đầu tiên!", "Send the first message!")}
                  </p>
                ) : (
                  activeThreadData.messages.map((m) => {
                    const isMine = m.senderId === currentUserId;
                    return (
                      <div
                        key={m.id}
                        className={cn("flex flex-col", isMine ? "items-end" : "items-start")}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                            isMine
                              ? "bg-[#4F46E5] text-white"
                              : "bg-[#F1F5F9] dark:bg-slate-800 text-[#0B1C30] dark:text-slate-100"
                          )}
                        >
                          {!isMine && (
                            <p className="mb-0.5 text-[10px] font-bold opacity-75">{m.senderName}</p>
                          )}
                          <p className="whitespace-pre-wrap break-words">{m.content}</p>
                        </div>
                        <span className="mt-1 text-[10px] text-slate-400">
                          {formatDateTime(m.createdAt)}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <form
                onSubmit={handleSend}
                className="flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 p-3"
              >
                <Input
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  data-testid="message-input"
                  placeholder={tr("Nhập tin nhắn…", "Type a message…")}
                  className="h-10 flex-1"
                />
                <Button
                  type="submit"
                  variant="accent"
                  className="min-h-10"
                  disabled={sending || !content.trim()}
                  data-testid="send-message-btn"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {tr("Gửi", "Send")}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Start New Conversation Dialog */}
      <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Bắt đầu cuộc hội thoại mới", "Start New Conversation")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleOpenThread} className="space-y-4">
            <div className="space-y-1.5">
              <Label>{tr("Chọn học sinh & lớp", "Select student & class")}</Label>
              <select
                value={selectedContactIdx}
                onChange={(e) => setSelectedContactIdx(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
              >
                {contacts.map((c, idx) => (
                  <option key={`${c.classId}-${c.studentId}-${c.parentId}`} value={idx}>
                    {currentUserRole === "PARENT"
                      ? `${c.className} — GV ${c.teacherName} (HS ${c.studentName})`
                      : `${c.parentName} — PH của ${c.studentName} (${c.className})`}
                  </option>
                ))}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-10" onClick={() => setNewChatOpen(false)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" variant="accent" className="min-h-10" disabled={creatingThread}>
                {creatingThread ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {tr("Mở hội thoại", "Open thread")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
