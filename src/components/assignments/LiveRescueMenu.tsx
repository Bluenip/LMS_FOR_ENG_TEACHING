"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2, MessageSquare, MonitorSmartphone, XCircle } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Live exam rescue actions for one student: private message, +5/+10 min, unlock to switch device. */
export function LiveRescueMenu({ assignmentId, studentId, studentName }: { assignmentId: string; studentId: string; studentName: string }) {
  const { tr } = useI18n();
  const [msgOpen, setMsgOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const call = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true);
    try {
      await apiFetchJson(`/api/assignments/${assignmentId}/live/rescue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, ...body }),
      });
      toast.success(ok);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-1.5" data-testid={`rescue-${studentId}`}>
        <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setMsgOpen(true)} data-testid={`rescue-msg-${studentId}`}>
          <MessageSquare className="h-3 w-3" /> {tr("Nhắn riêng", "Message")}
        </Button>
        {[5, 10].map((m) => (
          <Button
            key={m}
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={busy}
            onClick={() => void call({ action: "EXTEND_TIME", extraMin: m }, tr(`Đã cộng ${m} phút cho ${studentName}`, `Added ${m} min for ${studentName}`))}
            data-testid={`rescue-time-${m}-${studentId}`}
          >
            <Clock className="h-3 w-3" /> +{m}′
          </Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          disabled={busy}
          onClick={() => void call({ action: "UNLOCK_DEVICE" }, tr("Đã mở khoá để đổi máy", "Unlocked for a device switch"))}
        >
          <MonitorSmartphone className="h-3 w-3" /> {tr("Đổi máy", "Switch device")}
        </Button>
      </div>
      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tr("Nhắn riêng cho", "Message to")} {studentName}
            </DialogTitle>
            <DialogDescription>{tr("Tin nhắn hiện ngay trên màn hình làm bài của học sinh.", "Pops up immediately on the student's exam screen.")}</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} data-testid="rescue-msg-input" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setMsgOpen(false)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button
              disabled={busy || !message.trim()}
              onClick={async () => {
                if (await call({ action: "MESSAGE", message }, tr("Đã gửi tin nhắn", "Message sent"))) {
                  setMsgOpen(false);
                  setMessage("");
                }
              }}
              data-testid="rescue-msg-send"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} {tr("Gửi", "Send")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Device readiness (pre-check) of each student before the exam. */
export function PreCheckPanel({ assignmentId }: { assignmentId: string }) {
  const { tr } = useI18n();
  const { data } = useQuery<{
    students: Array<{ student: { id: string; name: string }; check: { passed: boolean; pingMs: number | null; batteryPct: number | null; checkedAt: string } | null }>;
  }>({ queryKey: ["precheck", assignmentId], queryFn: () => apiFetchJson(`/api/assignments/${assignmentId}/precheck`), refetchInterval: 30_000 });
  if (!data) return null;
  const ready = data.students.filter((s) => s.check?.passed).length;
  return (
    <div className="stitch-card space-y-2 p-4" data-testid="precheck-panel">
      <p className="text-sm font-bold">
        {tr("Kiểm tra thiết bị", "Device checks")}: {ready}/{data.students.length} {tr("sẵn sàng", "ready")}
      </p>
      <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
        {data.students.map(({ student, check }) => (
          <li key={student.id} className="flex items-center justify-between gap-2">
            <span className="truncate">{student.name}</span>
            {check ? (
              check.passed ? (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {check.pingMs ?? "?"}ms
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rose-600">
                  <XCircle className="h-3.5 w-3.5" /> {tr("Chưa đạt", "Not ready")}
                </span>
              )
            ) : (
              <span className="text-slate-400">{tr("Chưa kiểm tra", "Not checked")}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
