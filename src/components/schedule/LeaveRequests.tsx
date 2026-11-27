"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarX2, Check, Loader2, X } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const statusBadge = (s: string, tr: (vi: string, en: string) => string) =>
  s === "APPROVED" ? (
    <Badge variant="mint">{tr("Đã duyệt", "Approved")}</Badge>
  ) : s === "REJECTED" ? (
    <Badge variant="danger">{tr("Từ chối", "Rejected")}</Badge>
  ) : (
    <Badge variant="orange">{tr("Chờ duyệt", "Pending")}</Badge>
  );

/** Parent portal: request leave for an upcoming class session of the selected child. */
export function ParentLeaveRequestCard({ studentId }: { studentId: string }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const key = ["leave-sessions", studentId];
  const { data } = useQuery<{
    sessions: Array<{ id: string; title: string; startsAt: string; className: string; request: { status: string; reviewNote: string | null } | null }>;
  }>({ queryKey: key, queryFn: () => apiFetchJson(`/api/leave-requests?studentId=${encodeURIComponent(studentId)}`) });
  const [target, setTarget] = useState<{ id: string; title: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await apiFetchJson("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, sessionId: target.id, reason }),
      });
      toast.success(tr("Đã gửi đơn xin nghỉ", "Leave request sent"));
      setTarget(null);
      setReason("");
      await qc.invalidateQueries({ queryKey: key });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Gửi thất bại", "Could not send"));
    } finally {
      setBusy(false);
    }
  };

  if (!data || data.sessions.length === 0) return null;
  return (
    <div className="stitch-card overflow-hidden" data-testid="parent-leave-card">
      <h3 className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-base font-bold dark:border-slate-800">
        <CalendarX2 className="h-5 w-5 text-[#4F46E5]" /> {tr("Buổi học sắp tới & đơn xin nghỉ", "Upcoming sessions & leave requests")}
      </h3>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.sessions.slice(0, 8).map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="block font-medium">{s.title}</span>
              <span className="text-xs text-slate-500">
                {s.className} · {formatDateTime(s.startsAt)}
              </span>
            </span>
            {s.request ? (
              statusBadge(s.request.status, tr)
            ) : (
              <Button size="sm" variant="outline" onClick={() => setTarget({ id: s.id, title: s.title })} data-testid={`leave-open-${s.id}`}>
                {tr("Gửi đơn xin nghỉ", "Request leave")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(target)} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Đơn xin nghỉ", "Leave request")}</DialogTitle>
            <DialogDescription>{target?.title}</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr("Lý do (ví dụ: con bị sốt)…", "Reason (e.g. my child has a fever)…")} data-testid="leave-reason" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button onClick={() => void send()} disabled={busy || reason.trim().length < 3} data-testid="leave-send">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {tr("Gửi đơn", "Send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Teacher: leave requests of the class, approve / reject in one tap. */
export function ClassLeaveRequestsPanel({ classId }: { classId: string }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const key = ["leave-requests", classId];
  const { data } = useQuery<{
    requests: Array<{ id: string; reason: string; status: string; student: { name: string }; parent: { name: string }; session: { title: string; startsAt: string } }>;
  }>({ queryKey: key, queryFn: () => apiFetchJson(`/api/leave-requests?classId=${encodeURIComponent(classId)}`) });
  const [busy, setBusy] = useState<string | null>(null);

  const review = async (id: string, status: "APPROVED" | "REJECTED") => {
    setBusy(id);
    try {
      await apiFetchJson(`/api/leave-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId, status }),
      });
      await qc.invalidateQueries({ queryKey: key });
      await qc.invalidateQueries({ queryKey: ["session-attendance"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setBusy(null);
    }
  };

  if (!data || data.requests.length === 0) return null;
  return (
    <div className="stitch-card overflow-hidden" data-testid="class-leave-requests">
      <h3 className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-sm font-bold dark:border-slate-800">
        <CalendarX2 className="h-4 w-4 text-[#4F46E5]" /> {tr("Đơn xin nghỉ của phụ huynh", "Parent leave requests")}
      </h3>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {data.requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm" data-testid={`leave-row-${r.id}`}>
            <span className="min-w-0">
              <span className="block font-medium">
                {r.student.name} · {r.session.title}
              </span>
              <span className="text-xs text-slate-500">
                {formatDateTime(r.session.startsAt)} · {r.parent.name}: “{r.reason}”
              </span>
            </span>
            {r.status === "PENDING" ? (
              <span className="flex gap-1.5">
                <Button size="sm" onClick={() => void review(r.id, "APPROVED")} disabled={busy === r.id} data-testid={`leave-approve-${r.id}`}>
                  <Check className="h-3.5 w-3.5" /> {tr("Duyệt", "Approve")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => void review(r.id, "REJECTED")} disabled={busy === r.id}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </span>
            ) : (
              statusBadge(r.status, tr)
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
