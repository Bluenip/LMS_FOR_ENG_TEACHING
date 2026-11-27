"use client";

import { useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
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

type Format = "AIKEN" | "MOODLE_XML" | "QUIZIZZ_CSV";

/** Import Aiken / Moodle XML / Quizizz CSV into the question bank or the end of a worksheet. */
export function StandardImportDialog({
  open,
  onOpenChange,
  target,
  worksheetId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  target: "BANK" | "WORKSHEET";
  worksheetId?: string;
  onDone: () => void;
}) {
  const { tr } = useI18n();
  const [format, setFormat] = useState<Format>("AIKEN");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<{ count: number; warnings: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const call = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const res = await apiFetchJson<{ imported: number; questions: unknown[]; warnings: string[] }>("/api/import/standard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, content, target, worksheetId, dryRun }),
      });
      if (dryRun) setPreview({ count: res.questions.length, warnings: res.warnings });
      else {
        toast.success(tr(`Đã nhập ${res.imported} câu hỏi`, `Imported ${res.imported} questions`));
        setContent("");
        setPreview(null);
        onOpenChange(false);
        onDone();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Nhập thất bại", "Import failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="standard-import-dialog">
        <DialogHeader>
          <DialogTitle>{tr("Nhập đề chuẩn quốc tế", "Import standard formats")}</DialogTitle>
          <DialogDescription>{tr("Aiken, Moodle XML hoặc CSV xuất từ Quizizz. Chọn tệp hoặc dán nội dung.", "Aiken, Moodle XML or a Quizizz CSV export. Pick a file or paste the content.")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {(["AIKEN", "MOODLE_XML", "QUIZIZZ_CSV"] as const).map((f) => (
            <Button key={f} size="sm" variant={format === f ? "default" : "outline"} onClick={() => { setFormat(f); setPreview(null); }} data-testid={`import-format-${f}`}>
              {f === "AIKEN" ? "Aiken" : f === "MOODLE_XML" ? "Moodle XML" : "Quizizz CSV"}
            </Button>
          ))}
          <label className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-semibold dark:border-slate-700">
            <FileUp className="h-3.5 w-3.5" /> {tr("Chọn tệp", "Choose file")}
            <input
              type="file"
              accept=".txt,.xml,.csv,text/plain,text/xml,text/csv"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setContent(await f.text());
                setPreview(null);
              }}
            />
          </label>
        </div>
        <Textarea
          rows={10}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setPreview(null);
          }}
          className="font-mono text-xs"
          placeholder={format === "AIKEN" ? "What is 2+2?\nA. 3\nB. 4\nANSWER: B" : format === "MOODLE_XML" ? "<quiz>…</quiz>" : "Question Text,Question Type,Option 1,Option 2,…,Correct Answer"}
          data-testid="import-content"
        />
        {preview && (
          <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800" data-testid="import-preview">
            <p className="font-semibold">{tr(`Đọc được ${preview.count} câu hỏi`, `Found ${preview.count} questions`)}</p>
            {preview.warnings.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-amber-700 dark:text-amber-300">
                {preview.warnings.slice(0, 10).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => void call(true)} disabled={busy || !content.trim()} data-testid="import-preview-btn">
            {tr("Xem trước", "Preview")}
          </Button>
          <Button onClick={() => void call(false)} disabled={busy || !preview || preview.count === 0} data-testid="import-confirm">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} {tr("Nhập", "Import")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
