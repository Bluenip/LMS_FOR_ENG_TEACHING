"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImageUp, Loader2, ScanText, Trash2 } from "lucide-react";
import type { WorksheetSubject } from "@prisma/client";
import type { AiGeneratedQuestionDraft } from "@/lib/ai/gemini-prompt";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
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
import { MathText } from "./MathText";

const MAX_IMAGES = 5;
const MAX_SIDE = 2200;

interface PickedImage {
  name: string;
  blob: Blob;
  url: string;
}

/** Downscales a photo (and re-encodes as JPEG) so uploads stay well under the 6MB limit. */
async function imageToJpeg(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.88)
  );
}

/** Renders the first pages of a scanned PDF to JPEG blobs in the browser (pdf.js). */
async function pdfToImages(file: File, limit: number): Promise<PickedImage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: PickedImage[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, limit); p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas } as Parameters<typeof page.render>[0]).promise;
    const blob = await imageToJpeg(canvas, canvas.width, canvas.height);
    out.push({ name: `${file.name} #${p}`, blob, url: URL.createObjectURL(blob) });
  }
  await doc.destroy();
  return out;
}

function draftAnswerText(q: AiGeneratedQuestionDraft, tr: (vi: string, en: string) => string): string {
  const key = q.answerKey as { correct?: unknown; accepted?: unknown };
  if (q.type === "MULTIPLE_CHOICE") return `${tr("Đáp án", "Key")}: ${String(key.correct ?? "?")}`;
  if (q.type === "TEXT" && Array.isArray(key.accepted)) return `${tr("Đáp án", "Key")}: ${key.accepted.join(" / ")}`;
  if (q.type === "TRUE_FALSE_GROUP" && key.correct && typeof key.correct === "object") {
    return Object.entries(key.correct as Record<string, boolean>)
      .map(([k, v]) => `${k}) ${v ? tr("Đ", "T") : tr("S", "F")}`)
      .join("  ");
  }
  return "";
}

/**
 * Photo / scanned-PDF → AI OCR → editable draft questions → `onInsert`.
 * Nothing is saved until the teacher confirms.
 */
export function AiOcrDialog({
  open,
  onOpenChange,
  subject,
  onInsert,
  insertLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject?: WorksheetSubject | null;
  onInsert: (drafts: AiGeneratedQuestionDraft[]) => void | Promise<void>;
  insertLabel?: string;
}) {
  const { tr } = useI18n();
  const [images, setImages] = useState<PickedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<AiGeneratedQuestionDraft[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [inserting, setInserting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const reset = () => {
    images.forEach((i) => URL.revokeObjectURL(i.url));
    setImages([]);
    setDrafts([]);
    setSelected([]);
  };

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    setBusy(true);
    try {
      const next: PickedImage[] = [];
      for (const f of Array.from(list)) {
        if (images.length + next.length >= MAX_IMAGES) break;
        if (f.type === "application/pdf") {
          next.push(...(await pdfToImages(f, MAX_IMAGES - images.length - next.length)));
        } else if (f.type.startsWith("image/")) {
          const bmp = await createImageBitmap(f);
          const blob = await imageToJpeg(bmp, bmp.width, bmp.height);
          bmp.close();
          next.push({ name: f.name, blob, url: URL.createObjectURL(blob) });
        }
      }
      setImages((prev) => [...prev, ...next].slice(0, MAX_IMAGES));
    } catch {
      toast.error(tr("Không đọc được tệp đã chọn", "Could not read the selected file"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runOcr = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      images.forEach((img, i) => fd.append("images", new File([img.blob], `page-${i + 1}.jpg`, { type: "image/jpeg" })));
      if (subject) fd.append("subject", subject);
      const res = await apiFetchJson<{ questions: AiGeneratedQuestionDraft[] }>("/api/ai/ocr-worksheet", { method: "POST", body: fd });
      setDrafts(res.questions);
      setSelected(res.questions.map((_, i) => i));
      toast.success(tr(`AI đã đọc được ${res.questions.length} câu hỏi`, `AI read ${res.questions.length} questions`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Lỗi gọi AI", "AI request failed"));
    } finally {
      setBusy(false);
    }
  };

  const insert = async () => {
    setInserting(true);
    try {
      await onInsert(drafts.filter((_, i) => selected.includes(i)));
      reset();
      onOpenChange(false);
    } catch {
      // the caller already showed the error; keep the drafts so nothing is lost
    } finally {
      setInserting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="ai-ocr-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanText className="h-5 w-5 text-[#F97316]" />
            {tr("Quét ảnh đề giấy (AI OCR)", "Scan a paper exam (AI OCR)")}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "Chụp 1–5 trang đề hoặc chọn PDF scan. AI chép lại câu hỏi và công thức; bạn kiểm tra, sửa rồi mới thêm vào đề.",
              "Take 1–5 photos or pick a scanned PDF. AI transcribes questions and formulas; review and edit before adding."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {images.map((img, i) => (
              <div key={img.url} className="relative h-24 w-20 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview blob */}
                <img src={img.url} alt={img.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute right-0.5 top-0.5 rounded bg-white/90 p-1 text-slate-600 hover:text-red-600"
                  aria-label={tr("Bỏ ảnh", "Remove")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className="flex h-24 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-indigo-400 dark:border-slate-600"
              >
                <ImageUp className="h-5 w-5" />
                {tr("Thêm", "Add")}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,application/pdf"
              capture="environment"
              className="hidden"
              data-testid="ai-ocr-file-input"
              onChange={(e) => void addFiles(e.target.files)}
            />
          </div>
          <Button onClick={() => void runOcr()} disabled={busy || images.length === 0} data-testid="ai-ocr-run">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
            {tr("Đọc đề bằng AI", "Read with AI")}
          </Button>

          {drafts.length > 0 && (
            <div className="space-y-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                {tr("Kết quả từ AI — hãy kiểm tra lại câu chữ, công thức và đáp án.", "AI output — check wording, formulas and keys.")}
              </p>
              {drafts.map((q, i) => {
                const on = selected.includes(i);
                return (
                  <div
                    key={i}
                    className={cn(
                      "space-y-2 rounded-xl border p-3 text-sm",
                      on ? "border-[#4F46E5] bg-[#EEF2FF]/40 dark:bg-indigo-950/30" : "border-slate-200 dark:border-slate-700"
                    )}
                    data-testid={`ai-ocr-draft-${i}`}
                  >
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={on}
                        onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, i] : prev.filter((x) => x !== i)))}
                      />
                      <Badge variant="neutral">{q.type}</Badge>
                      <span className="text-xs text-slate-500">{draftAnswerText(q, tr)}</span>
                    </label>
                    <Textarea
                      rows={2}
                      value={q.prompt}
                      onChange={(e) => setDrafts((prev) => prev.map((d, j) => (j === i ? { ...d, prompt: e.target.value } : d)))}
                      className="text-sm"
                    />
                    <div className="rounded-lg bg-white px-3 py-2 dark:bg-slate-900">
                      <MathText text={q.prompt} />
                      {Array.isArray(q.options) && (
                        <ul className="mt-1 space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                          {(q.options as Array<{ id: string; text: string }>).map((o) => (
                            <li key={o.id}>
                              <b>{o.id}.</b> <MathText text={o.text} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {drafts.length > 0 && (
          <DialogFooter>
            <Button onClick={() => void insert()} disabled={inserting || selected.length === 0} data-testid="ai-ocr-insert">
              {inserting && <Loader2 className="h-4 w-4 animate-spin" />}
              {insertLabel ?? tr(`Thêm ${selected.length} câu vào đề`, `Add ${selected.length} to the worksheet`)}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
