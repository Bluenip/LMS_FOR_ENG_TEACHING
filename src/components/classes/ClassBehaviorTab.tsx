"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, Star, Trash2, Undo2 } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface BehaviorPresetDTO {
  id: string;
  label: string;
  delta: number;
  icon: string | null;
}

interface BehaviorSummaryDTO {
  students: Array<{ student: { id: string; name: string; avatarUrl: string | null }; total: number }>;
  recent: Array<{
    id: string;
    studentId: string;
    studentName: string;
    delta: number;
    reason: string;
    sessionId: string | null;
    awardedByName: string;
    createdAt: string;
  }>;
}

const presetsKey = (classId: string) => ["behavior-presets", classId];
const summaryKey = (classId: string, sessionId?: string) => ["behavior-summary", classId, sessionId ?? "all"];

export function useBehaviorPresets(classId: string, enabled = true) {
  return useQuery<{ presets: BehaviorPresetDTO[] }>({
    queryKey: presetsKey(classId),
    enabled,
    queryFn: () => apiFetchJson(`/api/classes/${classId}/behavior/presets`),
  });
}

async function postAward(
  classId: string,
  body: { studentIds: string[]; presetId?: string; delta?: number; reason?: string; sessionId?: string | null }
) {
  return apiFetchJson<{ awardedCount: number }>(`/api/classes/${classId}/behavior/points`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deltaLabel(delta: number) {
  return delta > 0 ? `+${delta}` : String(delta);
}

export function ClassBehaviorTab({ classId, canManagePresets }: { classId: string; canManagePresets: boolean }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const { data: presetData } = useBehaviorPresets(classId);
  const { data, isLoading } = useQuery<BehaviorSummaryDTO>({
    queryKey: summaryKey(classId),
    queryFn: () => apiFetchJson(`/api/classes/${classId}/behavior/points`),
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [customDelta, setCustomDelta] = useState("1");
  const [customReason, setCustomReason] = useState("");
  const [presetOpen, setPresetOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDelta, setNewDelta] = useState("1");
  const [newIcon, setNewIcon] = useState("");

  const students = useMemo(() => data?.students ?? [], [data]);
  const allSelected = students.length > 0 && selected.length === students.length;
  const presets = presetData?.presets ?? [];

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["behavior-summary", classId] });
    void qc.invalidateQueries({ queryKey: ["class-gradebook", classId] });
  };

  const award = async (body: { presetId?: string; delta?: number; reason?: string }) => {
    if (selected.length === 0) {
      toast.error(tr("Chọn ít nhất 1 học sinh", "Select at least one student"));
      return;
    }
    setBusy(true);
    try {
      const res = await postAward(classId, { studentIds: selected, ...body });
      toast.success(tr(`Đã ghi cho ${res.awardedCount} học sinh`, `Recorded for ${res.awardedCount} students`));
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const undo = async (pointId: string) => {
    try {
      await apiFetchJson(`/api/classes/${classId}/behavior/points?pointId=${encodeURIComponent(pointId)}`, { method: "DELETE" });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    }
  };

  const createPreset = async () => {
    try {
      await apiFetchJson(`/api/classes/${classId}/behavior/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel, delta: Number(newDelta), icon: newIcon || null }),
      });
      setNewLabel("");
      setNewIcon("");
      void qc.invalidateQueries({ queryKey: presetsKey(classId) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    }
  };

  const deletePreset = async (presetId: string) => {
    try {
      await apiFetchJson(`/api/classes/${classId}/behavior/presets?presetId=${encodeURIComponent(presetId)}`, { method: "DELETE" });
      void qc.invalidateQueries({ queryKey: presetsKey(classId) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="class-behavior-tab">
      <div className="stitch-card space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[#0B1C30] dark:text-slate-100">
            {tr("Chọn học sinh rồi bấm một mẫu để cộng/trừ sao", "Select students, then tap a preset")}
            {selected.length > 0 && (
              <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
                {selected.length}
              </span>
            )}
          </p>
          {canManagePresets && (
            <Button size="sm" variant="ghost" onClick={() => setPresetOpen(true)}>
              {tr("Quản lý mẫu", "Manage presets")}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={busy}
              onClick={() => void award({ presetId: p.id })}
              data-testid={`behavior-preset-${p.delta}`}
              className={cn(
                "min-h-10 rounded-xl border px-3 text-sm font-semibold transition disabled:opacity-50",
                p.delta > 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
              )}
            >
              {p.icon} {p.label} {deltaLabel(p.delta)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-20 space-y-1">
            <Label htmlFor="bh-delta" className="text-xs">{tr("Điểm", "Points")}</Label>
            <Input id="bh-delta" type="number" min={-10} max={10} value={customDelta} onChange={(e) => setCustomDelta(e.target.value)} />
          </div>
          <div className="min-w-[160px] flex-1 space-y-1">
            <Label htmlFor="bh-reason" className="text-xs">{tr("Lý do", "Reason")}</Label>
            <Input id="bh-reason" value={customReason} maxLength={200} onChange={(e) => setCustomReason(e.target.value)} />
          </div>
          <Button
            disabled={busy || !customReason.trim() || !Number(customDelta)}
            onClick={() => void award({ delta: Number(customDelta), reason: customReason })}
          >
            <Plus className="h-4 w-4" /> {tr("Ghi", "Record")}
          </Button>
        </div>
      </div>

      <div className="stitch-card overflow-hidden">
        <label className="flex min-h-11 items-center gap-3 border-b border-slate-100 px-4 text-sm font-semibold dark:border-slate-800">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? [] : students.map((s) => s.student.id))}
          />
          {tr("Chọn tất cả", "Select all")}
        </label>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {students.map((s) => {
            const on = selected.includes(s.student.id);
            return (
              <li key={s.student.id}>
                <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 py-2" data-testid={`behavior-row-${s.student.id}`}>
                  <span className="flex min-w-0 items-center gap-3">
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0"
                      checked={on}
                      onChange={() =>
                        setSelected((prev) => (on ? prev.filter((x) => x !== s.student.id) : [...prev, s.student.id]))
                      }
                    />
                    <span className="truncate text-sm">{s.student.name}</span>
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 font-mono text-sm font-bold",
                      s.total > 0 ? "text-emerald-600 dark:text-emerald-400" : s.total < 0 ? "text-rose-600 dark:text-rose-400" : "text-slate-400"
                    )}
                    data-testid={`behavior-total-${s.student.id}`}
                  >
                    <Star className="h-4 w-4" /> {s.total}
                  </span>
                </label>
              </li>
            );
          })}
          {students.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">{tr("Lớp chưa có học sinh.", "No students yet.")}</li>
          )}
        </ul>
      </div>

      {data && data.recent.length > 0 && (
        <div className="stitch-card space-y-2 p-4">
          <h3 className="text-sm font-semibold">{tr("Lịch sử gần đây", "Recent history")}</h3>
          <ul className="space-y-1.5">
            {data.recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className={cn("font-bold", r.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                    {deltaLabel(r.delta)}
                  </span>{" "}
                  {r.studentName} · {r.reason}
                  <span className="ml-1 text-xs text-slate-400">{formatDateTime(r.createdAt)}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void undo(r.id)}
                  className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                  aria-label={tr("Hoàn tác", "Undo")}
                  title={tr("Hoàn tác", "Undo")}
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={presetOpen} onOpenChange={setPresetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Mẫu điểm cộng", "Behavior presets")}</DialogTitle>
            <DialogDescription>{tr("Từ -10 đến +10 điểm, tối đa 30 mẫu.", "From -10 to +10 points, up to 30 presets.")}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1.5">
            {presets.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
                <span>
                  {p.icon} {p.label} <b>{deltaLabel(p.delta)}</b>
                </span>
                <button
                  type="button"
                  onClick={() => void deletePreset(p.id)}
                  className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label={tr("Xoá mẫu", "Delete preset")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-14 space-y-1">
              <Label htmlFor="bp-icon" className="text-xs">Icon</Label>
              <Input id="bp-icon" value={newIcon} maxLength={8} onChange={(e) => setNewIcon(e.target.value)} />
            </div>
            <div className="min-w-[120px] flex-1 space-y-1">
              <Label htmlFor="bp-label" className="text-xs">{tr("Tên", "Label")}</Label>
              <Input id="bp-label" value={newLabel} maxLength={60} onChange={(e) => setNewLabel(e.target.value)} />
            </div>
            <div className="w-20 space-y-1">
              <Label htmlFor="bp-delta" className="text-xs">{tr("Điểm", "Points")}</Label>
              <Input id="bp-delta" type="number" min={-10} max={10} value={newDelta} onChange={(e) => setNewDelta(e.target.value)} />
            </div>
            <Button onClick={() => void createPreset()} disabled={!newLabel.trim() || !Number(newDelta)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPresetOpen(false)}>
              {tr("Đóng", "Close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Compact +/- row used inside the attendance sheet of a class session. */
export function BehaviorQuickAwardRow({
  classId,
  sessionId,
  studentId,
  sessionTotal,
}: {
  classId: string;
  sessionId: string;
  studentId: string;
  sessionTotal: number;
}) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const { data } = useBehaviorPresets(classId);
  const [busy, setBusy] = useState(false);

  const award = async (presetId: string) => {
    setBusy(true);
    try {
      await postAward(classId, { studentIds: [studentId], presetId, sessionId });
      void qc.invalidateQueries({ queryKey: ["behavior-summary", classId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid={`quick-behavior-${studentId}`}>
      <span className="flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <Star className="h-3.5 w-3.5" /> {sessionTotal}
      </span>
      {(data?.presets ?? []).map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={busy}
          title={p.label}
          onClick={() => void award(p.id)}
          className={cn(
            "min-h-8 rounded-lg border px-2 text-xs font-semibold disabled:opacity-50",
            p.delta > 0
              ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:text-emerald-300 dark:hover:bg-emerald-950"
              : "border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950"
          )}
        >
          {p.icon ?? ""} {deltaLabel(p.delta)}
        </button>
      ))}
    </div>
  );
}

/** Session totals per student for the attendance sheet. */
export function useSessionBehaviorTotals(classId: string, sessionId: string, enabled: boolean) {
  return useQuery<BehaviorSummaryDTO>({
    queryKey: summaryKey(classId, sessionId),
    enabled,
    queryFn: () => apiFetchJson(`/api/classes/${classId}/behavior/points?sessionId=${encodeURIComponent(sessionId)}`),
  });
}
