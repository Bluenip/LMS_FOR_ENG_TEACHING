"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Radio } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
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

const SELECT_CLASS =
  "h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm";

export function StartLiveQuizDialog({
  worksheetId,
  worksheetTitle,
  open,
  onOpenChange,
}: {
  worksheetId: string;
  worksheetTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { tr } = useI18n();
  const router = useRouter();
  const [classId, setClassId] = useState("");
  const [mode, setMode] = useState<"HOST_PACED" | "SELF_PACED">("HOST_PACED");
  const [limit, setLimit] = useState("30");
  const [creating, setCreating] = useState(false);

  const { data } = useQuery<{ classes: Array<{ id: string; name: string }> }>({
    queryKey: ["classes", "live-quiz-picker"],
    enabled: open,
    queryFn: () => apiFetchJson("/api/classes"),
  });

  const create = async () => {
    setCreating(true);
    try {
      const res = await apiFetchJson<{ id: string }>("/api/live-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "WORKSHEET",
          worksheetId,
          classId: classId || null,
          mode,
          questionLimitSec: Math.min(300, Math.max(5, Number(limit) || 30)),
        }),
      });
      router.push(`/teacher/live-quiz/${res.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Không tạo được Live Quiz", "Could not create the Live Quiz"));
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr("Mở Live Quiz", "Start a Live Quiz")}</DialogTitle>
          <DialogDescription>
            {tr(
              `Chiếu các câu tự chấm của "${worksheetTitle}" lên màn hình lớp, học sinh trả lời bằng điện thoại.`,
              `Project the auto-graded questions of "${worksheetTitle}"; students answer on their phones.`
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="lq-class">{tr("Lớp", "Class")}</Label>
            <select id="lq-class" className={SELECT_CLASS} value={classId} onChange={(e) => setClassId(e.target.value)} data-testid="lq-class-select">
              <option value="">{tr("Phiên mở (khách nhập tên)", "Open session (guests enter a name)")}</option>
              {data?.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500">
              {tr("Chọn lớp: chỉ học sinh của lớp (đã đăng nhập) được tham gia.", "With a class, only its signed-in students can join.")}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="lq-mode">{tr("Chế độ", "Mode")}</Label>
              <select id="lq-mode" className={SELECT_CLASS} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="HOST_PACED">{tr("GV điều khiển", "Host-paced")}</option>
                <option value="SELF_PACED">{tr("HS tự làm", "Self-paced")}</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="lq-limit">{tr("Giây / câu", "Seconds / question")}</Label>
              <Input id="lq-limit" type="number" min={5} max={300} value={limit} onChange={(e) => setLimit(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tr("Huỷ", "Cancel")}
          </Button>
          <Button onClick={() => void create()} disabled={creating} data-testid="lq-create">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
            {tr("Tạo phiên", "Create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
