"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Zap } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ExitTicketDialog({
  classId,
  open,
  onOpenChange,
}: {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { tr } = useI18n();
  const router = useRouter();
  const [type, setType] = useState<"MULTIPLE_CHOICE" | "TEXT">("MULTIPLE_CHOICE");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);
  const [accepted, setAccepted] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      const res = await apiFetchJson<{ id: string }>("/api/live-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "EXIT_TICKET",
          classId,
          title: tr("Hỏi nhanh", "Exit ticket"),
          type,
          prompt,
          options: type === "MULTIPLE_CHOICE" ? options.filter((o) => o.trim()) : undefined,
          correctIndex: type === "MULTIPLE_CHOICE" ? correctIndex : null,
          acceptedAnswers:
            type === "TEXT"
              ? accepted
                  .split("\n")
                  .map((a) => a.trim())
                  .filter(Boolean)
              : undefined,
        }),
      });
      router.push(`/teacher/live-quiz/${res.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Không tạo được câu hỏi", "Could not create the question"));
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tr("Hỏi nhanh (Exit Ticket)", "Exit Ticket")}</DialogTitle>
          <DialogDescription>
            {tr("Một câu hỏi nhanh cuối giờ, không cần tạo phiếu bài tập.", "One quick end-of-class question, no worksheet needed.")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={type === "MULTIPLE_CHOICE" ? "default" : "outline"} onClick={() => setType("MULTIPLE_CHOICE")}>
              {tr("Trắc nghiệm", "Multiple choice")}
            </Button>
            <Button type="button" size="sm" variant={type === "TEXT" ? "default" : "outline"} onClick={() => setType("TEXT")}>
              {tr("Trả lời ngắn", "Short answer")}
            </Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor="et-prompt">{tr("Câu hỏi", "Question")}</Label>
            <Textarea id="et-prompt" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} data-testid="exit-ticket-prompt" />
          </div>
          {type === "MULTIPLE_CHOICE" ? (
            <div className="space-y-2">
              <Label>{tr("Phương án (chọn đáp án đúng, có thể bỏ trống)", "Options (pick the correct one, optional)")}</Label>
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="et-correct"
                    className="h-5 w-5"
                    checked={correctIndex === i}
                    onChange={() => setCorrectIndex(i)}
                    aria-label={tr(`Đáp án đúng ${String.fromCharCode(65 + i)}`, `Correct option ${String.fromCharCode(65 + i)}`)}
                  />
                  <span className="w-5 font-semibold">{String.fromCharCode(65 + i)}</span>
                  <Input
                    value={o}
                    onChange={(e) => setOptions((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
                    data-testid={`exit-ticket-option-${i}`}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      onClick={() => {
                        setOptions((prev) => prev.filter((_, j) => j !== i));
                        setCorrectIndex(null);
                      }}
                      aria-label={tr("Xoá phương án", "Remove option")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
              {options.length < 6 && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setOptions((prev) => [...prev, ""])}>
                  <Plus className="h-4 w-4" /> {tr("Thêm phương án", "Add option")}
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="et-accepted">{tr("Đáp án chấp nhận (mỗi dòng 1 đáp án, có thể bỏ trống)", "Accepted answers (one per line, optional)")}</Label>
              <Textarea id="et-accepted" rows={2} value={accepted} onChange={(e) => setAccepted(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tr("Huỷ", "Cancel")}
          </Button>
          <Button onClick={() => void create()} disabled={creating || !prompt.trim()} data-testid="exit-ticket-create">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
            {tr("Bắt đầu hỏi", "Start")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
