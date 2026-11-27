"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Wand2 } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { masteryTagLabel, type MasteryLevel } from "@/lib/analytics/mastery";
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

interface MatrixDTO {
  tags: Array<{ tag: string; classAccuracy: number | null }>;
  rows: Array<{
    student: { id: string; name: string };
    cells: Record<string, { tag: string; accuracy: number | null; attemptsCount: number; level: MasteryLevel }>;
  }>;
}

export const LEVEL_CLASS: Record<MasteryLevel, string> = {
  MASTERED: "bg-emerald-500 text-white",
  DEVELOPING: "bg-amber-400 text-slate-900",
  NEEDS_WORK: "bg-rose-500 text-white",
  NO_DATA: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
};

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}`);

/**
 * Student × topic heatmap (green ≥ 80 %, amber 50–79 %, red < 50 %). Clicking a topic header selects
 * it; "Create remedial work" assigns bank questions on the selected topics to the students who are red.
 */
export function MasteryHeatmap({ classId, canAssign }: { classId: string; canAssign: boolean }) {
  const { tr, locale } = useI18n();
  const router = useRouter();
  const tagText = (tag: string) => masteryTagLabel(tag, locale);
  const { data, isLoading } = useQuery<MatrixDTO>({
    queryKey: ["class-mastery", classId],
    queryFn: () => apiFetchJson(`/api/classes/${classId}/mastery`),
  });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState("10");
  const [creating, setCreating] = useState(false);

  const weakStudents = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r) => selectedTags.some((t) => r.cells[t]?.level === "NEEDS_WORK")).map((r) => r.student);
  }, [data, selectedTags]);

  const create = async () => {
    setCreating(true);
    try {
      const res = await apiFetchJson<{ assignmentId: string; questionCount: number; studentCount: number }>(
        `/api/classes/${classId}/remedial`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topicTags: selectedTags,
            studentIds: weakStudents.map((s) => s.id),
            questionCount: Math.max(1, Math.min(40, Number(count) || 10)),
          }),
        }
      );
      toast.success(
        tr(
          `Đã giao bài ôn bù ${res.questionCount} câu cho ${res.studentCount} học sinh`,
          `Assigned ${res.questionCount} review questions to ${res.studentCount} students`
        )
      );
      setOpen(false);
      setSelectedTags([]);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setCreating(false);
    }
  };

  if (isLoading || !data) {
    return <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />;
  }
  if (data.tags.length === 0) {
    return (
      <div className="stitch-card p-8 text-center text-sm text-slate-500">
        {tr(
          "Chưa có dữ liệu. Gắn chủ đề (topic) cho câu hỏi và chấm bài để thấy bản đồ năng lực.",
          "No data yet. Tag questions with topics and grade work to see the mastery map."
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="mastery-heatmap">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-300">
          {(["MASTERED", "DEVELOPING", "NEEDS_WORK"] as const).map((l) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className={cn("h-3 w-3 rounded", LEVEL_CLASS[l])} />
              {l === "MASTERED" ? tr("Vững (≥80%)", "Mastered (≥80%)") : l === "DEVELOPING" ? tr("Đang tiến bộ", "Developing") : tr("Cần ôn (<50%)", "Needs work (<50%)")}
            </span>
          ))}
        </div>
        {canAssign && (
          <Button size="sm" disabled={selectedTags.length === 0 || weakStudents.length === 0} onClick={() => setOpen(true)} data-testid="remedial-open">
            <Wand2 className="h-4 w-4" /> {tr("Tạo bài ôn bù cho nhóm này", "Create remedial work for this group")}
            {weakStudents.length > 0 && ` (${weakStudents.length})`}
          </Button>
        )}
      </div>
      {canAssign && (
        <p className="text-xs text-slate-500">
          {tr("Bấm vào tên chủ đề để chọn (chủ đề yếu nhất đứng đầu).", "Click topic headers to select them (weakest first).")}
        </p>
      )}

      <div className="stitch-card overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[140px] bg-[#F8F9FF] px-3 py-2 text-left dark:bg-slate-800">{tr("Học sinh", "Student")}</th>
              {data.tags.map((t) => {
                const on = selectedTags.includes(t.tag);
                return (
                  <th key={t.tag} className="min-w-[78px] bg-[#F8F9FF] px-1 py-1 dark:bg-slate-800">
                    <button
                      type="button"
                      disabled={!canAssign}
                      onClick={() => setSelectedTags((prev) => (on ? prev.filter((x) => x !== t.tag) : [...prev, t.tag]))}
                      className={cn(
                        "w-full rounded-lg px-2 py-1.5 text-center font-semibold leading-tight",
                        on ? "bg-[#4F46E5] text-white" : "hover:bg-slate-200 dark:hover:bg-slate-700"
                      )}
                      data-testid={`mastery-tag-${t.tag}`}
                      title={tagText(t.tag).label}
                    >
                      <span className="line-clamp-2">{tagText(t.tag).label}</span>
                      <span className="block font-mono text-[10px] opacity-80">{pct(t.classAccuracy)}%</span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.student.id}>
                <td className="sticky left-0 z-10 truncate border-t border-slate-100 bg-white px-3 py-1.5 font-medium dark:border-slate-800 dark:bg-slate-900">
                  {r.student.name}
                </td>
                {data.tags.map((t) => {
                  const c = r.cells[t.tag]!;
                  return (
                    <td key={t.tag} className="border-t border-slate-100 p-1 dark:border-slate-800">
                      <div
                        className={cn("rounded-md py-1.5 text-center font-mono font-semibold", LEVEL_CLASS[c.level])}
                        title={`${r.student.name} · ${tagText(t.tag).label}: ${pct(c.accuracy)}% (${c.attemptsCount})`}
                        data-testid={`mastery-cell-${r.student.id}-${t.tag}`}
                        data-level={c.level}
                      >
                        {pct(c.accuracy)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="remedial-dialog">
          <DialogHeader>
            <DialogTitle>{tr("Tạo bài ôn bù", "Create remedial work")}</DialogTitle>
            <DialogDescription>
              {tr(
                `Chủ đề: ${selectedTags.map((t) => tagText(t).label).join(", ")}. Câu hỏi tự chấm lấy từ ngân hàng câu hỏi, chỉ giao cho ${weakStudents.length} học sinh dưới 50%.`,
                `Topics: ${selectedTags.map((t) => tagText(t).label).join(", ")}. Auto-graded questions from the bank, assigned only to the ${weakStudents.length} students under 50%.`
              )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-600 dark:text-slate-300">{weakStudents.map((s) => s.name).join(", ")}</p>
          <div className="w-32 space-y-1">
            <Label htmlFor="remedial-count">{tr("Số câu", "Questions")}</Label>
            <Input id="remedial-count" type="number" min={1} max={40} value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button onClick={() => void create()} disabled={creating} data-testid="remedial-create">
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {tr("Giao bài ôn bù", "Assign")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
