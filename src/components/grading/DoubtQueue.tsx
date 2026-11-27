"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MessageCircleQuestion, UsersRound } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface DoubtDTO {
  id: string;
  fieldLabel: string;
  question: string;
  teacherReply: string | null;
  isPublicToClass: boolean;
  studentName: string | null;
  createdAt: string;
}

/** Teacher queue of students' questions about graded items (unanswered first) + peer-review launcher. */
export function DoubtQueue({ assignmentId }: { assignmentId: string }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const key = ["doubts", assignmentId];
  const { data, isLoading } = useQuery<{ doubts: DoubtDTO[] }>({ queryKey: key, queryFn: () => apiFetchJson(`/api/assignments/${assignmentId}/doubts`) });
  const { data: peer } = useQuery<{ enabled: boolean }>({
    queryKey: ["peer-reviews-enabled", assignmentId],
    queryFn: () => apiFetchJson(`/api/assignments/${assignmentId}/peer-reviews`),
  });
  const peerReviewEnabled = Boolean(peer?.enabled);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [publicFlags, setPublicFlags] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const reply = async (id: string) => {
    setBusy(id);
    try {
      await apiFetchJson(`/api/doubts/${id}/reply`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: replies[id] ?? "", isPublicToClass: publicFlags[id] ?? true }),
      });
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setBusy(null);
    }
  };

  const startPeerReview = async () => {
    setBusy("peer");
    try {
      const res = await apiFetchJson<{ created: number }>(`/api/assignments/${assignmentId}/peer-reviews/assign`, { method: "POST" });
      toast.success(tr(`Đã ghép ${res.created} lượt chấm chéo`, `Created ${res.created} peer reviews`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="doubt-queue">
      {peerReviewEnabled && (
        <div className="stitch-card flex flex-wrap items-center justify-between gap-2 p-4">
          <p className="text-sm">{tr("Ghép bài ẩn danh để học sinh chấm chéo (không ai chấm bài của mình).", "Pair submissions anonymously for peer review (nobody reviews their own).")}</p>
          <Button size="sm" onClick={() => void startPeerReview()} disabled={busy === "peer"} data-testid="peer-assign">
            <UsersRound className="h-4 w-4" /> {tr("Bắt đầu chấm chéo", "Start peer review")}
          </Button>
        </div>
      )}
      <div className="stitch-card overflow-hidden">
        <h3 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-bold dark:border-slate-800">
          <MessageCircleQuestion className="h-4 w-4 text-[#4F46E5]" /> {tr("Hỏi đáp câu hỏi", "Question Q&A")}
        </h3>
        {isLoading ? (
          <Loader2 className="mx-auto my-4 h-5 w-5 animate-spin text-slate-400" />
        ) : !data || data.doubts.length === 0 ? (
          <p className="px-4 py-5 text-sm text-slate-500">{tr("Chưa có câu hỏi nào.", "No questions yet.")}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.doubts.map((d) => (
              <li key={d.id} className="space-y-2 px-4 py-3 text-sm" data-testid={`teacher-doubt-${d.id}`}>
                <p className="text-xs text-slate-500">
                  {d.studentName} · {tr("Câu", "Q")} {d.fieldLabel} · {formatDateTime(d.createdAt)}
                </p>
                <p className="font-medium">{d.question}</p>
                {d.teacherReply ? (
                  <p className="text-emerald-700 dark:text-emerald-300">
                    ↳ {d.teacherReply} {d.isPublicToClass && <span className="text-xs text-slate-400">({tr("cả lớp xem", "public")})</span>}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Textarea rows={2} value={replies[d.id] ?? ""} onChange={(e) => setReplies((p) => ({ ...p, [d.id]: e.target.value }))} data-testid={`doubt-reply-${d.id}`} />
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs">
                        <input type="checkbox" className="h-4 w-4" checked={publicFlags[d.id] ?? true} onChange={(e) => setPublicFlags((p) => ({ ...p, [d.id]: e.target.checked }))} />
                        {tr("Cho cả lớp xem lời giải thích", "Share the answer with the class")}
                      </label>
                      <Button size="sm" onClick={() => void reply(d.id)} disabled={busy === d.id || !(replies[d.id] ?? "").trim()} data-testid={`doubt-reply-send-${d.id}`}>
                        {tr("Trả lời", "Reply")}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
