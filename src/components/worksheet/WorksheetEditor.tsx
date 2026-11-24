"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Rnd } from "react-rnd";
import { toast } from "sonner";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  ArrowLeft,
  CheckCircle2,
  CheckSquare,
  ChevronDownSquare,
  Copy,
  Eye,
  FileText,
  Grid,
  Hash,
  ListChecks,
  ListOrdered,
  MousePointer2,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
  Type,
  Upload,
  ZoomIn,
  ZoomOut,
  Columns2,
} from "lucide-react";
import type { FieldType, SkillTag } from "@prisma/client";
import { gradeSubmission, parseBulkAnswerString, type AnswerValue } from "@/lib/grading";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PdfCanvasPage, usePdfDocument } from "./PdfCanvasPage";
import { OverlayFieldInput } from "./OverlayFieldInput";
import { AnswerSheetPanel } from "./AnswerSheetPanel";
import type { EditorFieldDTO, StudentFieldDTO, WorksheetPageDTO } from "./types";

interface WorksheetEditorProps {
  initialWorksheet: {
    id: string;
    title: string;
    instructions: string | null;
    pdfFileKey: string | null;
    pageCount: number;
    pages: WorksheetPageDTO[];
    fields: EditorFieldDTO[];
  };
}

type ActiveTool = "SELECT" | FieldType;

const TOOL_COLORS: Record<FieldType, { border: string; bg: string; badge: string }> = {
  TEXT: { border: "border-indigo-500", bg: "bg-indigo-50/75", badge: "bg-indigo-600" },
  NUMBER: { border: "border-sky-500", bg: "bg-sky-50/75", badge: "bg-sky-600" },
  DROPDOWN: { border: "border-violet-500", bg: "bg-violet-50/75", badge: "bg-violet-600" },
  CHECKBOX: { border: "border-emerald-500", bg: "bg-emerald-50/75", badge: "bg-emerald-600" },
  MULTIPLE_CHOICE: { border: "border-orange-500", bg: "bg-orange-50/75", badge: "bg-orange-600" },
  MULTI_SELECT: { border: "border-amber-500", bg: "bg-amber-50/75", badge: "bg-amber-600" },
  TRUE_FALSE: { border: "border-teal-500", bg: "bg-teal-50/75", badge: "bg-teal-600" },
  ESSAY: { border: "border-rose-500", bg: "bg-rose-50/75", badge: "bg-rose-600" },
};

const SKILL_VALUES: SkillTag[] = ["GRAMMAR", "VOCABULARY", "READING", "LISTENING", "WRITING", "SPEAKING"];

function createDefaultFieldPayload(
  type: FieldType,
  label: string,
  order: number,
  optionWord = "Lựa chọn"
): Pick<EditorFieldDTO, "type" | "label" | "order" | "points" | "options" | "answerKey" | "gradingOpts" | "style"> {
  const baseStyle = { fontSize: 13, align: "left" as const, transparentBg: false };
  switch (type) {
    case "TEXT":
      return {
        type,
        label,
        order,
        points: 1,
        options: null,
        answerKey: { accepted: [""] },
        gradingOpts: { caseSensitive: false, ignorePunctuation: false, ignoreExtraSpaces: true },
        style: baseStyle,
      };
    case "NUMBER":
      return {
        type,
        label,
        order,
        points: 1,
        options: null,
        answerKey: { value: 0, tolerance: 0 },
        gradingOpts: null,
        style: { ...baseStyle, align: "center" },
      };
    case "MULTIPLE_CHOICE":
      return {
        type,
        label,
        order,
        points: 1,
        options: [
          { id: "A", text: "A" },
          { id: "B", text: "B" },
          { id: "C", text: "C" },
          { id: "D", text: "D" },
        ],
        answerKey: { correct: "A" },
        gradingOpts: null,
        style: baseStyle,
      };
    case "MULTI_SELECT":
      return {
        type,
        label,
        order,
        points: 1,
        options: [
          { id: "A", text: "A" },
          { id: "B", text: "B" },
          { id: "C", text: "C" },
          { id: "D", text: "D" },
        ],
        answerKey: { correct: ["A"] },
        gradingOpts: { partialCredit: true },
        style: baseStyle,
      };
    case "DROPDOWN":
      return {
        type,
        label,
        order,
        points: 1,
        options: [
          { id: "opt1", text: `${optionWord} 1` },
          { id: "opt2", text: `${optionWord} 2` },
          { id: "opt3", text: `${optionWord} 3` },
        ],
        answerKey: { correct: "opt1" },
        gradingOpts: null,
        style: baseStyle,
      };
    case "TRUE_FALSE":
      return {
        type,
        label,
        order,
        points: 1,
        options: null,
        answerKey: { correct: true },
        gradingOpts: null,
        style: baseStyle,
      };
    case "CHECKBOX":
      return {
        type,
        label,
        order,
        points: 1,
        options: null,
        answerKey: { checked: true },
        gradingOpts: null,
        style: baseStyle,
      };
    case "ESSAY":
      return {
        type,
        label,
        order,
        points: 2,
        options: null,
        answerKey: { rubric: "" },
        gradingOpts: null,
        style: baseStyle,
      };
  }
}

function clamp01(val: number): number {
  return Math.max(0, Math.min(1, Math.round(val * 10000) / 10000));
}

export function WorksheetEditor({ initialWorksheet }: WorksheetEditorProps) {
  const { m: vi, tr } = useI18n();
  const [worksheetId] = useState(initialWorksheet.id);
  const [title, setTitle] = useState(initialWorksheet.title);
  const [pdfFileKey, setPdfFileKey] = useState<string | null>(initialWorksheet.pdfFileKey);
  const [pages, setPages] = useState<WorksheetPageDTO[]>(initialWorksheet.pages);
  const [fields, setFields] = useState<EditorFieldDTO[]>(
    initialWorksheet.fields.map((f) => ({ ...f, isPersisted: true }))
  );

  const [activeTool, setActiveTool] = useState<ActiveTool>("SELECT");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activePage, setActivePage] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [uploadingPdf, setUploadingPdf] = useState(false);

  // Drawing rectangle state
  const [drawing, setDrawing] = useState<{
    pageIndex: number;
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  } | null>(null);

  // Live alignment guide lines while dragging
  const [guides, setGuides] = useState<{ pageIndex: number; x?: number; y?: number } | null>(null);

  // Mode B Quick-add + Bulk key state
  const [quickCount, setQuickCount] = useState(5);
  const [quickType, setQuickType] = useState<FieldType>("MULTIPLE_CHOICE");
  const [quickStart, setQuickStart] = useState(() => initialWorksheet.fields.length + 1);
  const [bulkKeyInput, setBulkKeyInput] = useState("");

  // Student Preview Mode
  const [previewMode, setPreviewMode] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, AnswerValue>>({});
  const [previewGraded, setPreviewGraded] = useState<ReturnType<typeof gradeSubmission> | null>(
    null
  );

  const pdfUrl = pdfFileKey ? `/api/files/${pdfFileKey}` : null;
  const { pdfDoc, loading: pdfLoading, error: pdfError } = usePdfDocument(pdfUrl);

  const isInitialMount = useRef(true);
  const skipNextAutosaveRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedField = useMemo(() => {
    const firstId = selectedIds[0];
    if (!firstId) return null;
    return fields.find((f) => f.id === firstId) ?? null;
  }, [fields, selectedIds]);

  const totalPoints = useMemo(
    () => Math.round(fields.reduce((sum, f) => sum + (Number(f.points) || 0), 0) * 100) / 100,
    [fields]
  );

  const overlayFields = useMemo(
    () => fields.filter((f) => f.placement === "OVERLAY"),
    [fields]
  );
  const sheetFields = useMemo(
    () => fields.filter((f) => f.placement === "ANSWER_SHEET"),
    [fields]
  );

  const persistFields = useCallback(
    async (fieldsToSave: EditorFieldDTO[]) => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/worksheets/${worksheetId}/fields`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: fieldsToSave.map((f, idx) => ({
              id: f.isPersisted ? f.id : undefined,
              placement: f.placement,
              type: f.type,
              label: f.label || String(idx + 1),
              prompt: f.prompt ?? null,
              explanation: f.explanation ?? null,
              skillTag: f.skillTag ?? null,
              order: idx,
              points: Number(f.points) || 0,
              pageIndex: f.placement === "OVERLAY" ? (f.pageIndex ?? 0) : null,
              x: f.placement === "OVERLAY" ? clamp01(f.x ?? 0) : null,
              y: f.placement === "OVERLAY" ? clamp01(f.y ?? 0) : null,
              w: f.placement === "OVERLAY" ? Math.max(0.01, clamp01(f.w ?? 0.15)) : null,
              h: f.placement === "OVERLAY" ? Math.max(0.01, clamp01(f.h ?? 0.04)) : null,
              style: f.style ?? null,
              options: f.options ?? null,
              answerKey: f.answerKey,
              gradingOpts: f.gradingOpts ?? null,
            })),
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          if (err.code === "FIELD_HAS_ANSWERS") {
            // Server refused the change to protect student answers: restore the saved version
            toast.error(tr(`${err.error} Đang tải lại phiên bản đã lưu…`, `${err.error} Reloading the saved version…`));
            setSaveState("error");
            setTimeout(() => window.location.reload(), 2500);
            return;
          }
          throw new Error(err.error ?? tr("Lưu thất bại", "Save failed"));
        }
        const json = (await res.json()) as { fields: EditorFieldDTO[] };
        // Remap client temp IDs to persisted DB IDs without re-triggering autosave loop
        skipNextAutosaveRef.current = true;
        setFields((prev) => {
          if (prev.length !== json.fields.length) return prev;
          const idMap = new Map<string, string>();
          prev.forEach((p, idx) => {
            const saved = json.fields[idx];
            if (saved && p.id !== saved.id) {
              idMap.set(p.id, saved.id);
            }
          });
          if (idMap.size > 0) {
            setSelectedIds((sel) => sel.map((id) => idMap.get(id) ?? id));
          }
          return json.fields.map((saved) => ({ ...saved, isPersisted: true }));
        });
        setSaveState("saved");
      } catch (err) {
        console.error("Save fields error:", err);
        setSaveState("error");
        toast.error(err instanceof Error ? err.message : vi.common.saveFailed);
      }
    },
    [worksheetId, tr, vi]
  );

  // Debounced 1s autosave whenever fields change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    setSaveState("dirty");
    const timer = setTimeout(() => {
      void persistFields(fields);
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  const saveTitle = async (newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    await fetch(`/api/worksheets/${worksheetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
  };

  const handleUploadPdf = async (file: File) => {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error(tr("Chỉ chấp nhận tệp PDF (.pdf).", "Only PDF files (.pdf) are accepted."));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error(tr("Tệp PDF vượt quá 20MB.", "The PDF file is larger than 20MB."));
      return;
    }

    setUploadingPdf(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/worksheets/${worksheetId}/pdf`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Tải PDF thất bại", "PDF upload failed"));
      setPdfFileKey(json.worksheet.pdfFileKey);
      setPages(json.worksheet.pages);
      setActivePage(0);
      toast.success(tr(`Đã tải PDF (${json.worksheet.pageCount} trang)!`, `PDF uploaded (${json.worksheet.pageCount} pages)!`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Tải PDF thất bại", "PDF upload failed"));
    } finally {
      setUploadingPdf(false);
    }
  };

  const updateField = useCallback((id: string, patch: Partial<EditorFieldDTO>) => {
    setFields((prev) => {
      const target = prev.find((f) => f.id === id);
      if (
        !target ||
        (Object.keys(patch) as Array<keyof EditorFieldDTO>).every(
          (k) => JSON.stringify(target[k]) === JSON.stringify(patch[k])
        )
      ) {
        return prev; // no-op: keep same array so autosave is not triggered
      }
      return prev.map((f) => (f.id === id ? { ...f, ...patch } : f));
    });
  }, []);

  const deleteSelectedFields = useCallback(() => {
    if (selectedIds.length === 0) return;
    const delSet = new Set(selectedIds);
    setFields((prev) => prev.filter((f) => !delSet.has(f.id)));
    setSelectedIds([]);
  }, [selectedIds]);

  const duplicateSelectedFields = useCallback(() => {
    if (selectedIds.length === 0) return;
    const toDup = fields.filter((f) => selectedIds.includes(f.id));
    if (toDup.length === 0) return;
    const newIds: string[] = [];
    const clones = toDup.map((f, idx) => {
      const id = `tmp-${Date.now()}-${idx}`;
      newIds.push(id);
      return {
        ...f,
        id,
        isPersisted: false,
        label: String(fields.length + idx + 1),
        order: fields.length + idx,
        x: f.placement === "OVERLAY" ? clamp01((f.x ?? 0) + 0.02) : null,
        y: f.placement === "OVERLAY" ? clamp01((f.y ?? 0) + 0.03) : null,
      };
    });
    setFields((prev) => [...prev, ...clones]);
    setSelectedIds(newIds);
  }, [fields, selectedIds]);

  // Keyboard shortcuts: Delete, Ctrl/Cmd+D, Arrow keys (+Shift for 10px)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (previewMode) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (selectedIds.length === 0) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelectedFields();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelectedFields();
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const stepPx = e.shiftKey ? 10 : 2;
        // Reference page width ~760px * zoom
        const deltaX = stepPx / (760 * zoom);
        const deltaY = stepPx / (1075 * zoom);
        const dx = e.key === "ArrowRight" ? deltaX : e.key === "ArrowLeft" ? -deltaX : 0;
        const dy = e.key === "ArrowDown" ? deltaY : e.key === "ArrowUp" ? -deltaY : 0;
        const selSet = new Set(selectedIds);
        setFields((prev) =>
          prev.map((f) => {
            if (!selSet.has(f.id) || f.placement !== "OVERLAY") return f;
            return {
              ...f,
              x: clamp01((f.x ?? 0) + dx),
              y: clamp01((f.y ?? 0) + dy),
            };
          })
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewMode, selectedIds, deleteSelectedFields, duplicateSelectedFields, zoom]);

  // Auto-number in reading order (pageIndex -> y -> x for OVERLAY, then ANSWER_SHEET)
  const autoNumberReadingOrder = () => {
    setFields((prev) => {
      const overlays = prev
        .filter((f) => f.placement === "OVERLAY")
        .sort((a, b) => {
          const pDiff = (a.pageIndex ?? 0) - (b.pageIndex ?? 0);
          if (pDiff !== 0) return pDiff;
          // Group rows within 2% height tolerance
          const yDiff = (a.y ?? 0) - (b.y ?? 0);
          if (Math.abs(yDiff) > 0.02) return yDiff;
          return (a.x ?? 0) - (b.x ?? 0);
        });
      const sheets = prev.filter((f) => f.placement === "ANSWER_SHEET");
      const combined = [...overlays, ...sheets];
      return combined.map((f, idx) => ({ ...f, label: String(idx + 1), order: idx }));
    });
    toast.success(tr("Đã đánh số câu tự động theo thứ tự đọc!", "Questions numbered automatically in reading order!"));
  };

  // Multi-select alignment helpers
  const alignSelected = (mode: "LEFT" | "TOP" | "SAME_WIDTH") => {
    const selectedOverlays = fields.filter(
      (f) => selectedIds.includes(f.id) && f.placement === "OVERLAY"
    );
    if (selectedOverlays.length < 2) {
      toast.info(tr("Giữ Shift + click để chọn từ 2 ô trở lên.", "Hold Shift + click to select 2 or more boxes."));
      return;
    }
    const minX = Math.min(...selectedOverlays.map((f) => f.x ?? 0));
    const minY = Math.min(...selectedOverlays.map((f) => f.y ?? 0));
    const refW = selectedOverlays[0]?.w ?? 0.15;
    const selSet = new Set(selectedIds);
    setFields((prev) =>
      prev.map((f) => {
        if (!selSet.has(f.id) || f.placement !== "OVERLAY") return f;
        if (mode === "LEFT") return { ...f, x: minX };
        if (mode === "TOP") return { ...f, y: minY };
        return { ...f, w: refW };
      })
    );
  };

  // Mode B Quick-Add N questions
  const handleQuickAdd = () => {
    const count = Math.max(1, Math.min(100, quickCount));
    const start = Math.max(1, quickStart);
    const created: EditorFieldDTO[] = [];
    for (let i = 0; i < count; i++) {
      const label = String(start + i);
      const base = createDefaultFieldPayload(quickType, label, fields.length + i, tr("Lựa chọn", "Option"));
      created.push({
        id: `tmp-sheet-${Date.now()}-${i}`,
        isPersisted: false,
        placement: "ANSWER_SHEET",
        ...base,
      });
    }
    setFields((prev) => [...prev, ...created]);
    setQuickStart(start + count);
    toast.success(tr(`Đã thêm ${count} câu vào phiếu trả lời!`, `Added ${count} questions to the answer sheet!`));
  };

  // Mode B Bulk Answer Key string apply
  const handleApplyBulkKey = () => {
    const letters = parseBulkAnswerString(bulkKeyInput);
    if (letters.length === 0) {
      toast.error(tr("Không nhận diện được đáp án từ chuỗi đã nhập.", "Could not read any answers from that text."));
      return;
    }

    let applied = 0;
    setFields((prev) => {
      const next = [...prev];
      const mcIndices: number[] = [];
      next.forEach((f, idx) => {
        if (f.placement === "ANSWER_SHEET" && f.type === "MULTIPLE_CHOICE") {
          mcIndices.push(idx);
        }
      });

      // If not enough MC questions exist yet, auto-create them!
      if (mcIndices.length < letters.length) {
        const missing = letters.length - mcIndices.length;
        const startNum = next.length + 1;
        for (let i = 0; i < missing; i++) {
          const base = createDefaultFieldPayload(
            "MULTIPLE_CHOICE",
            String(startNum + i),
            next.length,
            tr("Lựa chọn", "Option")
          );
          const created: EditorFieldDTO = {
            id: `tmp-bulk-${Date.now()}-${i}`,
            isPersisted: false,
            placement: "ANSWER_SHEET",
            ...base,
          };
          next.push(created);
          mcIndices.push(next.length - 1);
        }
      }

      for (let i = 0; i < letters.length; i++) {
        const idx = mcIndices[i];
        if (idx === undefined) break;
        const target = next[idx]!;
        next[idx] = {
          ...target,
          answerKey: { correct: letters[i]! },
        };
        applied++;
      }
      return next;
    });

    toast.success(tr(`Đã áp dụng ${applied} đáp án trắc nghiệm!`, `Applied ${applied} multiple-choice answers!`));
  };

  const snapValue = (v: number) => (snapToGrid ? Math.round(v * 100) / 100 : v);

  // Convert editor fields to student preview fields
  const previewFields: StudentFieldDTO[] = useMemo(
    () =>
      fields.map((f) => ({
        id: f.id,
        worksheetId,
        placement: f.placement,
        type: f.type,
        label: f.label,
        prompt: f.prompt,
        skillTag: f.skillTag,
        order: f.order,
        points: f.points,
        pageIndex: f.pageIndex,
        x: f.x,
        y: f.y,
        w: f.w,
        h: f.h,
        style: f.style,
        options: f.options,
        revealedAnswer: previewGraded ? f.answerKey : undefined,
        explanation: previewGraded ? f.explanation : undefined,
      })),
    [fields, worksheetId, previewGraded]
  );

  // ===== PREVIEW AS STUDENT MODE =====
  if (previewMode) {
    return (
      <div className="space-y-4">
        <div className="sticky top-16 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-white/95 px-5 py-3 shadow-toolbar backdrop-blur">
          <div className="flex items-center gap-3">
            <Badge variant="indigo">{tr("Xem như học sinh", "Preview as student")}</Badge>
            <h2 className="text-base font-bold text-[#0B1C30]">{title}</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
                className="p-1 text-slate-600 hover:text-indigo-600"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="min-w-[42px] text-center text-xs font-bold tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.0, Math.round((z + 0.25) * 100) / 100))}
                className="p-1 text-slate-600 hover:text-indigo-600"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
            <Button
              variant="accent"
              size="sm"
              onClick={() => {
                const res = gradeSubmission(
                  fields.map((f) => ({
                    id: f.id,
                    type: f.type,
                    points: f.points,
                    answerKey: f.answerKey,
                    gradingOpts: f.gradingOpts,
                  })),
                  previewAnswers
                );
                setPreviewGraded(res);
                toast.success(tr(`Chấm thử: ${res.autoScore} / ${res.maxScore} điểm`, `Test score: ${res.autoScore} / ${res.maxScore} points`));
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
              {tr("Chấm thử ngay", "Test grading")}
            </Button>
            {previewGraded && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPreviewAnswers({});
                  setPreviewGraded(null);
                }}
              >
                {tr("Làm lại thử", "Try again")}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setPreviewMode(false);
                setPreviewGraded(null);
              }}
            >
              {vi.worksheets.exitPreview}
            </Button>
          </div>
        </div>

        {previewGraded && (
          <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-900">
            <span>
              {tr("Kết quả chấm thử:", "Test result:")} {previewGraded.autoScore} / {previewGraded.maxScore} {tr("điểm", "points")}
              {previewGraded.hasManualFields ? tr(" (chưa tính điểm câu Tự luận)", " (essay questions not included)") : ""}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1 space-y-5 overflow-x-auto pb-16">
            {pages.length > 0 ? (
              pages.map((p) => (
                <PdfCanvasPage
                  key={p.pageIndex}
                  pdfDoc={pdfDoc}
                  pageIndex={p.pageIndex}
                  widthPt={p.widthPt}
                  heightPt={p.heightPt}
                  zoom={zoom}
                >
                  {({ widthPx, heightPx }) =>
                    previewFields
                      .filter((f) => f.placement === "OVERLAY" && f.pageIndex === p.pageIndex)
                      .map((f) => {
                        const g = previewGraded?.fieldResults[f.id];
                        return (
                          <OverlayFieldInput
                            key={f.id}
                            field={f}
                            pageWidthPx={widthPx}
                            pageHeightPx={heightPx}
                            zoom={zoom}
                            value={previewAnswers[f.id]}
                            onChange={(val) =>
                              setPreviewAnswers((prev) => ({ ...prev, [f.id]: val }))
                            }
                            revealResult={Boolean(previewGraded)}
                            revealKey={Boolean(previewGraded)}
                            isCorrect={g?.isCorrect}
                            score={g?.score}
                          />
                        );
                      })
                  }
                </PdfCanvasPage>
              ))
            ) : (
              <div className="stitch-card p-10 text-center text-sm text-slate-500">
                {tr("Worksheet không có PDF — học sinh sẽ làm trực tiếp trên Phiếu trả lời bên phải.", "This worksheet has no PDF — students answer directly on the answer sheet on the right.")}
              </div>
            )}
          </div>

          <AnswerSheetPanel
            allFields={previewFields}
            answers={previewAnswers}
            onChange={(fieldId, val) =>
              setPreviewAnswers((prev) => ({ ...prev, [fieldId]: val }))
            }
            onJumpToField={(f) => {
              const el = document.querySelector(`[data-overlay-field-id="${f.id}"]`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            revealResult={Boolean(previewGraded)}
            revealKey={Boolean(previewGraded)}
            gradeByFieldId={previewGraded?.fieldResults ?? {}}
          />
        </div>
      </div>
    );
  }

  // ===== EDITOR MODE =====
  const tools: Array<{ id: ActiveTool; label: string; icon: React.ReactNode }> = [
    { id: "SELECT", label: vi.worksheets.tools.select, icon: <MousePointer2 className="h-3.5 w-3.5" /> },
    { id: "TEXT", label: vi.worksheets.tools.TEXT, icon: <Type className="h-3.5 w-3.5" /> },
    { id: "NUMBER", label: vi.worksheets.tools.NUMBER, icon: <Hash className="h-3.5 w-3.5" /> },
    { id: "DROPDOWN", label: vi.worksheets.tools.DROPDOWN, icon: <ChevronDownSquare className="h-3.5 w-3.5" /> },
    { id: "CHECKBOX", label: vi.worksheets.tools.CHECKBOX, icon: <CheckSquare className="h-3.5 w-3.5" /> },
    { id: "MULTIPLE_CHOICE", label: vi.worksheets.tools.MULTIPLE_CHOICE, icon: <ListChecks className="h-3.5 w-3.5" /> },
    { id: "ESSAY", label: vi.worksheets.tools.ESSAY, icon: <FileText className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Top Floating Stitch Toolbar */}
      <div className="sticky top-16 z-30 rounded-2xl border border-slate-200/90 bg-white/95 p-3 shadow-toolbar backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Back + Title + Autosave status */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/teacher/worksheets" title={tr("Quay lại danh sách Worksheet", "Back to worksheets")}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => void saveTitle(title)}
                className="w-52 sm:w-64 truncate rounded-lg bg-transparent px-1.5 py-0.5 text-sm font-bold text-[#0B1C30] hover:bg-slate-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <div className="mt-0.5 flex items-center gap-2 px-1.5 text-[11px]">
                <span
                  data-testid="autosave-status"
                  className={cn(
                    "inline-flex items-center gap-1 font-medium",
                    saveState === "saved" && "text-emerald-600",
                    saveState === "saving" && "text-indigo-600",
                    saveState === "dirty" && "text-amber-600",
                    saveState === "error" && "text-red-600"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      saveState === "saved" && "bg-emerald-500",
                      saveState === "saving" && "bg-indigo-500 animate-pulse",
                      saveState === "dirty" && "bg-amber-500",
                      saveState === "error" && "bg-red-500"
                    )}
                  />
                  {saveState === "saved" && vi.common.saved}
                  {saveState === "saving" && vi.common.saving}
                  {saveState === "dirty" && tr("Chưa lưu…", "Unsaved…")}
                  {saveState === "error" && vi.common.saveFailed}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-500">
                  {pages.length} {tr("trang •", "pages •")} {fields.length} {tr("câu", "questions")}
                </span>
              </div>
            </div>
          </div>

          {/* Center: Field Tool Palette */}
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-[#EFF4FF] p-1">
            {tools.map((t) => (
              <button
                key={t.id}
                type="button"
                data-tool={t.id}
                onClick={() => setActiveTool(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                  activeTool === t.id
                    ? "bg-[#4F46E5] text-white shadow-sm"
                    : "text-[#464555] hover:bg-white hover:text-[#3525CD]"
                )}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Right: Preview + Save + Assign CTA */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPreviewMode(true)}>
              <Eye className="h-4 w-4" />
              <span className="hidden xl:inline">{vi.worksheets.previewAsStudent}</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void persistFields(fields)}
              disabled={saveState === "saving"}
            >
              <Save className="h-4 w-4" />
              <span className="hidden sm:inline">{tr("Lưu", "Save")}</span>
            </Button>
            <Button variant="accent" size="sm" asChild>
              <Link href={`/teacher/assignments/new?worksheetId=${worksheetId}`}>
                <Send className="h-4 w-4" />
                {vi.worksheets.assignToClass}
              </Link>
            </Button>
          </div>
        </div>

        {/* Sub-toolbar: Zoom, Grid Snap, Auto-number, Multi-select Align */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-1.5 py-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
                className="p-1 text-slate-600 hover:text-indigo-600"
                aria-label={tr("Thu nhỏ", "Zoom out")}
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[40px] text-center font-bold tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.0, Math.round((z + 0.25) * 100) / 100))}
                className="p-1 text-slate-600 hover:text-indigo-600"
                aria-label={tr("Phóng to", "Zoom in")}
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSnapToGrid((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 font-semibold transition",
                snapToGrid
                  ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              <Grid className="h-3.5 w-3.5" />
              {vi.worksheets.editor.snapToGrid}
            </button>

            <button
              type="button"
              onClick={autoNumberReadingOrder}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-600 hover:bg-slate-50"
            >
              <ListOrdered className="h-3.5 w-3.5" />
              {vi.worksheets.editor.autoNumber}
            </button>

            {selectedIds.length >= 2 && (
              <div className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5">
                <span className="font-semibold text-indigo-700 mr-1">
                  {tr("Đang chọn", "Selected")} {selectedIds.length} {tr("ô:", "boxes:")}
                </span>
                <button
                  type="button"
                  onClick={() => alignSelected("LEFT")}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-indigo-800 hover:bg-indigo-100"
                >
                  <AlignStartVertical className="h-3 w-3" />
                  {vi.worksheets.editor.alignLeft}
                </button>
                <button
                  type="button"
                  onClick={() => alignSelected("TOP")}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-indigo-800 hover:bg-indigo-100"
                >
                  <AlignStartHorizontal className="h-3 w-3" />
                  {vi.worksheets.editor.alignTop}
                </button>
                <button
                  type="button"
                  onClick={() => alignSelected("SAME_WIDTH")}
                  className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-indigo-800 hover:bg-indigo-100"
                >
                  <Columns2 className="h-3 w-3" />
                  {vi.worksheets.editor.sameWidth}
                </button>
              </div>
            )}
          </div>

          <p className="hidden text-slate-400 xl:block">
            {activeTool === "SELECT"
              ? tr("Mẹo: Delete xoá ô • Ctrl+D nhân bản • Mũi tên (+Shift) dịch chuyển", "Tip: Delete removes • Ctrl+D duplicates • Arrows (+Shift) move")
              : vi.worksheets.editor.drawHint}
          </p>
        </div>
      </div>

      {/* Main 3-Column Studio Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        {/* LEFT RAIL: Thumbnails + Upload PDF + Total Points */}
        <aside className="space-y-4 lg:col-span-2">
          <div className="stitch-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-bold text-[#0B1C30]">{tr("Trang tài liệu", "Document pages")}</h3>
              <Badge variant="default" className="text-[10px]">
                {pages.length} {tr("trang", "pages")}
              </Badge>
            </div>

            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {pages.map((p) => {
                const countOnPage = overlayFields.filter((f) => f.pageIndex === p.pageIndex).length;
                const isLandscape = p.widthPt > p.heightPt;
                return (
                  <button
                    key={p.pageIndex}
                    type="button"
                    onClick={() => {
                      setActivePage(p.pageIndex);
                      const el = document.querySelector(`[data-pdf-page="${p.pageIndex}"]`);
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className={cn(
                      "w-full rounded-xl border p-2 text-left transition",
                      activePage === p.pageIndex
                        ? "border-[#4F46E5] bg-[#EEF2FF]/70"
                        : "border-slate-200 bg-[#F8F9FF] hover:border-indigo-200"
                    )}
                  >
                    <div className="mx-auto mb-1.5 flex justify-center overflow-hidden rounded border border-slate-200 bg-white">
                      {pdfDoc ? (
                        <PdfCanvasPage
                          pdfDoc={pdfDoc}
                          pageIndex={p.pageIndex}
                          widthPt={p.widthPt}
                          heightPt={p.heightPt}
                          zoom={1}
                          baseWidthPx={isLandscape ? 60 : 64}
                          className="pointer-events-none !shadow-none"
                        >
                          {() => null}
                        </PdfCanvasPage>
                      ) : (
                        <div
                          className={cn(
                            "flex items-center justify-center text-[10px] font-bold text-slate-400",
                            isLandscape ? "h-12 w-16" : "h-16 w-12"
                          )}
                        >
                          {p.pageIndex + 1}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-[#0B1C30]">
                        {tr("Trang", "Page")} {p.pageIndex + 1}
                      </span>
                      <span className="text-indigo-600 font-semibold">{countOnPage} {tr("ô", "boxes")}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUploadPdf(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
              disabled={uploadingPdf}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {uploadingPdf
                ? tr("Đang tải…", "Loading…")
                : pdfFileKey
                  ? vi.worksheets.replacePdf
                  : vi.worksheets.uploadPdf}
            </Button>
          </div>

          {/* Stitch Total Points Card */}
          <div className="stitch-card p-4">
            <p className="text-xs font-semibold text-[#464555]">{tr("Tổng điểm bài tập", "Total points")}</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#3525CD] tabular-nums">
                {totalPoints}
              </span>
              <Badge variant="mint" className="text-[10px]">
                {fields.length} {tr("câu", "questions")}
              </Badge>
            </div>
            <div className="mt-2.5 flex justify-between text-[11px] text-slate-500">
              <span>Overlay: {overlayFields.length}</span>
              <span>{tr("Phiếu:", "Sheet:")} {sheetFields.length}</span>
            </div>
          </div>
        </aside>

        {/* CENTER: PDF Canvas + Draw + React-Rnd Overlays */}
        <section className="lg:col-span-7">
          <div className="rounded-2xl border border-slate-200/80 bg-[#EFF4FF]/60 p-4 overflow-x-auto min-h-[540px]">
            {pdfError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {pdfError}
              </div>
            )}

            {!pdfFileKey || pages.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-white px-6 py-20 text-center">
                <Upload className="h-10 w-10 text-[#4F46E5]" />
                <h3 className="mt-3 text-base font-bold text-[#0B1C30]">
                  {tr("Tải file PDF đề bài lên để vẽ ô tương tác", "Upload the test PDF to draw interactive boxes")}
                </h3>
                <p className="mt-1 max-w-md text-xs text-[#464555]">
                  {vi.worksheets.pdfRequirements} {tr("Bạn cũng có thể tạo câu hỏi trực tiếp ở mục “Phiếu trả lời” bên dưới mà không cần PDF.", "You can also create questions directly in the “Answer sheet” section below without a PDF.")}
                </p>
                <Button
                  className="mt-4"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPdf}
                >
                  <Upload className="h-4 w-4" />
                  {vi.worksheets.uploadPdf}
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {pdfLoading && (
                  <p className="text-center text-xs font-medium text-indigo-600">
                    {tr("Đang tải nội dung PDF…", "Loading PDF content…")}
                  </p>
                )}

                {pages.map((p) => {
                  const pageOverlays = overlayFields.filter((f) => f.pageIndex === p.pageIndex);

                  return (
                    <div key={p.pageIndex} className="space-y-1.5">
                      <div className="flex items-center justify-between px-1 text-[11px] font-semibold text-slate-500">
                        <span>
                          {tr("Trang", "Page")} {p.pageIndex + 1} / {pages.length} (
                          {Math.round(p.widthPt)} × {Math.round(p.heightPt)} pt{" "}
                          {p.widthPt > p.heightPt ? "• Ngang" : tr("• Dọc", "• Portrait")})
                        </span>
                        <span>{pageOverlays.length} {tr("ô tương tác", "interactive boxes")}</span>
                      </div>

                      <PdfCanvasPage
                        pdfDoc={pdfDoc}
                        pageIndex={p.pageIndex}
                        widthPt={p.widthPt}
                        heightPt={p.heightPt}
                        zoom={zoom}
                        eager={p.pageIndex === 0}
                      >
                        {({ widthPx, heightPx }) => (
                          <div
                            data-editor-page-layer={p.pageIndex}
                            className={cn(
                              "relative h-full w-full",
                              activeTool !== "SELECT" ? "cursor-crosshair" : "cursor-default"
                            )}
                            onMouseDown={(e) => {
                              if (e.target !== e.currentTarget) return;
                              setActivePage(p.pageIndex);
                              if (activeTool === "SELECT") {
                                setSelectedIds([]);
                                return;
                              }
                              const rect = e.currentTarget.getBoundingClientRect();
                              const sx = clamp01((e.clientX - rect.left) / rect.width);
                              const sy = clamp01((e.clientY - rect.top) / rect.height);
                              setDrawing({
                                pageIndex: p.pageIndex,
                                startX: sx,
                                startY: sy,
                                curX: sx,
                                curY: sy,
                              });
                            }}
                            onMouseMove={(e) => {
                              if (!drawing || drawing.pageIndex !== p.pageIndex) return;
                              const rect = e.currentTarget.getBoundingClientRect();
                              setDrawing((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      curX: clamp01((e.clientX - rect.left) / rect.width),
                                      curY: clamp01((e.clientY - rect.top) / rect.height),
                                    }
                                  : null
                              );
                            }}
                            onMouseUp={() => {
                              if (!drawing || drawing.pageIndex !== p.pageIndex) return;
                              const toolType = activeTool === "SELECT" ? "TEXT" : activeTool;
                              const x = snapValue(Math.min(drawing.startX, drawing.curX));
                              const y = snapValue(Math.min(drawing.startY, drawing.curY));
                              const rawW = Math.abs(drawing.curX - drawing.startX);
                              const rawH = Math.abs(drawing.curY - drawing.startY);
                              // If user just clicked without dragging far, give a nice default size!
                              const w = snapValue(
                                rawW < 0.025 ? (toolType === "CHECKBOX" ? 0.045 : 0.22) : rawW
                              );
                              const h = snapValue(
                                rawH < 0.018
                                  ? toolType === "ESSAY"
                                    ? 0.1
                                    : 0.04
                                  : rawH
                              );

                              const newId = `tmp-ov-${Date.now()}`;
                              const base = createDefaultFieldPayload(
                                toolType,
                                String(fields.length + 1),
                                fields.length,
                                tr("Lựa chọn", "Option")
                              );
                              const newField: EditorFieldDTO = {
                                id: newId,
                                isPersisted: false,
                                placement: "OVERLAY",
                                pageIndex: p.pageIndex,
                                x: clamp01(x),
                                y: clamp01(y),
                                w: clamp01(Math.min(w, 1 - x)),
                                h: clamp01(Math.min(h, 1 - y)),
                                ...base,
                              };
                              setFields((prev) => [...prev, newField]);
                              setSelectedIds([newId]);
                              setDrawing(null);
                              setActiveTool("SELECT");
                            }}
                          >
                            {/* Live Alignment Guides */}
                            {guides && guides.pageIndex === p.pageIndex && (
                              <>
                                {guides.x !== undefined && (
                                  <div
                                    className="pointer-events-none absolute inset-y-0 z-30 w-px bg-orange-500"
                                    style={{ left: `${guides.x * 100}%` }}
                                  />
                                )}
                                {guides.y !== undefined && (
                                  <div
                                    className="pointer-events-none absolute inset-x-0 z-30 h-px bg-orange-500"
                                    style={{ top: `${guides.y * 100}%` }}
                                  />
                                )}
                              </>
                            )}

                            {/* Active rubber-band drawing box */}
                            {drawing && drawing.pageIndex === p.pageIndex && (
                              <div
                                className="pointer-events-none absolute z-30 rounded border-2 border-dashed border-[#4F46E5] bg-indigo-200/30"
                                style={{
                                  left: `${Math.min(drawing.startX, drawing.curX) * 100}%`,
                                  top: `${Math.min(drawing.startY, drawing.curY) * 100}%`,
                                  width: `${Math.abs(drawing.curX - drawing.startX) * 100}%`,
                                  height: `${Math.abs(drawing.curY - drawing.startY) * 100}%`,
                                }}
                              />
                            )}

                            {/* Draggable & Resizable Overlay Fields (react-rnd) */}
                            {pageOverlays.map((field) => {
                              const isSelected = selectedIds.includes(field.id);
                              const colors = TOOL_COLORS[field.type];
                              const fx = (field.x ?? 0) * widthPx;
                              const fy = (field.y ?? 0) * heightPx;
                              const fw = Math.max(24, (field.w ?? 0.15) * widthPx);
                              const fh = Math.max(20, (field.h ?? 0.04) * heightPx);

                              return (
                                <Rnd
                                  key={field.id}
                                  bounds="parent"
                                  size={{ width: fw, height: fh }}
                                  position={{ x: fx, y: fy }}
                                  onDrag={(_e, d) => {
                                    const nx = d.x / widthPx;
                                    const ny = d.y / heightPx;
                                    // Check alignment with sibling overlays
                                    let matchX: number | undefined;
                                    let matchY: number | undefined;
                                    for (const other of pageOverlays) {
                                      if (other.id === field.id) continue;
                                      if (Math.abs((other.x ?? 0) - nx) < 0.008) {
                                        matchX = other.x ?? 0;
                                      }
                                      if (Math.abs((other.y ?? 0) - ny) < 0.008) {
                                        matchY = other.y ?? 0;
                                      }
                                    }
                                    setGuides(
                                      matchX !== undefined || matchY !== undefined
                                        ? { pageIndex: p.pageIndex, x: matchX, y: matchY }
                                        : null
                                    );
                                  }}
                                  onDragStop={(_e, d) => {
                                    setGuides(null);
                                    // A plain click (no real movement) must not modify / autosave the field
                                    const movedPx = Math.hypot(
                                      d.x - (field.x ?? 0) * widthPx,
                                      d.y - (field.y ?? 0) * heightPx
                                    );
                                    if (movedPx < 3) return;
                                    const nx = snapValue(clamp01(d.x / widthPx));
                                    const ny = snapValue(clamp01(d.y / heightPx));
                                    updateField(field.id, { x: nx, y: ny });
                                  }}
                                  onResizeStop={(_e, _dir, ref, _delta, pos) => {
                                    const nx = snapValue(clamp01(pos.x / widthPx));
                                    const ny = snapValue(clamp01(pos.y / heightPx));
                                    const nw = snapValue(
                                      Math.max(0.02, clamp01(ref.offsetWidth / widthPx))
                                    );
                                    const nh = snapValue(
                                      Math.max(0.015, clamp01(ref.offsetHeight / heightPx))
                                    );
                                    updateField(field.id, { x: nx, y: ny, w: nw, h: nh });
                                  }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    if (e.shiftKey) {
                                      setSelectedIds((prev) =>
                                        prev.includes(field.id)
                                          ? prev.filter((id) => id !== field.id)
                                          : [...prev, field.id]
                                      );
                                    } else {
                                      setSelectedIds([field.id]);
                                    }
                                  }}
                                  className={cn(
                                    "group rounded-md border-2 border-dashed transition-shadow",
                                    colors.border,
                                    colors.bg,
                                    isSelected && "border-solid ring-2 ring-[#F97316] z-20"
                                  )}
                                >
                                  <div
                                    data-editor-field-id={field.id}
                                    className="relative flex h-full w-full items-center justify-between px-1.5 text-[11px] font-semibold text-slate-700"
                                  >
                                    <span
                                      className={cn(
                                        "pointer-events-none absolute -top-5 left-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm",
                                        colors.badge
                                      )}
                                    >
                                      {tr("Câu", "Q")} {field.label}
                                    </span>
                                    <span className="truncate opacity-80">
                                      {vi.worksheets.tools[field.type]}
                                    </span>
                                    <span className="ml-1 shrink-0 text-[10px] text-slate-500">
                                      {field.points}{tr("đ", "pt")}
                                    </span>
                                  </div>
                                </Rnd>
                              );
                            })}
                          </div>
                        )}
                      </PdfCanvasPage>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT PANEL: Properties Inspector */}
        <aside className="lg:col-span-3">
          <div className="stitch-card sticky top-44 p-4 max-h-[calc(100vh-190px)] overflow-y-auto">
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-sm font-bold text-[#0B1C30]">
                {vi.worksheets.editor.properties}
              </h3>
              {selectedField && (
                <Badge variant="default">{tr("Câu", "Q")} {selectedField.label}</Badge>
              )}
            </div>

            {!selectedField ? (
              <p className="py-10 text-center text-xs leading-relaxed text-slate-400">
                {vi.worksheets.editor.noSelection}
              </p>
            ) : (
              <div className="space-y-3.5 text-xs">
                {/* Type & Label */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{tr("Loại ô", "Box type")}</Label>
                    <select
                      value={selectedField.type}
                      onChange={(e) => {
                        const newType = e.target.value as FieldType;
                        const def = createDefaultFieldPayload(
                          newType,
                          selectedField.label,
                          selectedField.order,
                          tr("Lựa chọn", "Option")
                        );
                        updateField(selectedField.id, {
                          type: newType,
                          options: def.options,
                          answerKey: def.answerKey,
                          gradingOpts: def.gradingOpts,
                        });
                      }}
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs font-medium outline-none focus:border-[#4F46E5]"
                    >
                      {(Object.keys(vi.worksheets.tools) as Array<keyof typeof vi.worksheets.tools>)
                        .filter((k): k is FieldType => k !== "select")
                        .map((ft) => (
                          <option key={ft} value={ft}>
                            {vi.worksheets.tools[ft]}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">{vi.worksheets.editor.label}</Label>
                    <Input
                      value={selectedField.label}
                      onChange={(e) => updateField(selectedField.id, { label: e.target.value })}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                {/* Points & SkillTag */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">{vi.worksheets.editor.points}</Label>
                    <Input
                      type="number"
                      step="0.25"
                      min="0"
                      value={selectedField.points}
                      onChange={(e) =>
                        updateField(selectedField.id, { points: Number(e.target.value) || 0 })
                      }
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{vi.worksheets.editor.skillTag}</Label>
                    <select
                      value={selectedField.skillTag ?? ""}
                      onChange={(e) =>
                        updateField(selectedField.id, {
                          skillTag: (e.target.value || null) as SkillTag | null,
                        })
                      }
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs outline-none focus:border-[#4F46E5]"
                    >
                      <option value="">{tr("Không gắn", "None")}</option>
                      {SKILL_VALUES.map((sk) => (
                        <option key={sk} value={sk}>
                          {vi.skills[sk]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Optional prompt (handy for ANSWER_SHEET) */}
                {selectedField.placement === "ANSWER_SHEET" && (
                  <div className="space-y-1">
                    <Label className="text-xs">{vi.worksheets.editor.prompt}</Label>
                    <Input
                      value={selectedField.prompt ?? ""}
                      onChange={(e) => updateField(selectedField.id, { prompt: e.target.value })}
                      placeholder={tr("Nhập đề câu hỏi nếu muốn…", "Enter the question text if you like…")}
                      className="h-9 text-xs"
                    />
                  </div>
                )}

                {/* Answer Key Editor by FieldType */}
                <div className="rounded-xl border border-indigo-100 bg-[#F8F9FF] p-3 space-y-2.5">
                  <p className="font-bold text-[#3525CD]">{tr("Cấu hình Đáp án đúng", "Correct answer settings")}</p>

                  {selectedField.type === "TEXT" && (
                    <div className="space-y-1.5">
                      <Label className="text-[11px]">{vi.worksheets.editor.acceptedAnswers}</Label>
                      <Input
                        aria-label={tr("Đáp án chấp nhận", "Accepted answer")}
                        value={
                          Array.isArray(selectedField.answerKey.accepted)
                            ? (selectedField.answerKey.accepted as string[]).join("|")
                            : ""
                        }
                        onChange={(e) =>
                          updateField(selectedField.id, {
                            answerKey: {
                              accepted: e.target.value.split("|").map((s) => s.trim()),
                            },
                          })
                        }
                        placeholder={vi.worksheets.editor.acceptedHint}
                        className="h-9 text-xs"
                      />
                      <div className="space-y-1.5 pt-1">
                        <label className="flex items-center justify-between">
                          <span>{vi.worksheets.editor.caseSensitive}</span>
                          <Switch
                            checked={Boolean(selectedField.gradingOpts?.caseSensitive)}
                            onCheckedChange={(v) =>
                              updateField(selectedField.id, {
                                gradingOpts: { ...selectedField.gradingOpts, caseSensitive: v },
                              })
                            }
                          />
                        </label>
                        <label className="flex items-center justify-between">
                          <span>{vi.worksheets.editor.ignorePunctuation}</span>
                          <Switch
                            checked={Boolean(selectedField.gradingOpts?.ignorePunctuation)}
                            onCheckedChange={(v) =>
                              updateField(selectedField.id, {
                                gradingOpts: {
                                  ...selectedField.gradingOpts,
                                  ignorePunctuation: v,
                                },
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {selectedField.type === "NUMBER" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px]">{vi.worksheets.editor.numericValue}</Label>
                        <Input
                          type="number"
                          step="any"
                          value={String(selectedField.answerKey.value ?? 0)}
                          onChange={(e) =>
                            updateField(selectedField.id, {
                              answerKey: {
                                ...selectedField.answerKey,
                                value: Number(e.target.value),
                              },
                            })
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">{vi.worksheets.editor.tolerance}</Label>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={String(selectedField.answerKey.tolerance ?? 0)}
                          onChange={(e) =>
                            updateField(selectedField.id, {
                              answerKey: {
                                ...selectedField.answerKey,
                                tolerance: Number(e.target.value) || 0,
                              },
                            })
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {(selectedField.type === "MULTIPLE_CHOICE" ||
                    selectedField.type === "DROPDOWN" ||
                    selectedField.type === "MULTI_SELECT") && (
                    <div className="space-y-2">
                      {(selectedField.options ?? []).map((opt, idx) => {
                        const isMulti = selectedField.type === "MULTI_SELECT";
                        const correctArr = Array.isArray(selectedField.answerKey.correct)
                          ? (selectedField.answerKey.correct as string[])
                          : [];
                        const isCorrect = isMulti
                          ? correctArr.includes(opt.id)
                          : selectedField.answerKey.correct === opt.id;

                        return (
                          <div key={opt.id} className="flex items-center gap-1.5">
                            <input
                              type={isMulti ? "checkbox" : "radio"}
                              name={`correct-${selectedField.id}`}
                              checked={isCorrect}
                              onChange={() => {
                                if (isMulti) {
                                  const next = isCorrect
                                    ? correctArr.filter((x) => x !== opt.id)
                                    : [...correctArr, opt.id];
                                  updateField(selectedField.id, { answerKey: { correct: next } });
                                } else {
                                  updateField(selectedField.id, { answerKey: { correct: opt.id } });
                                }
                              }}
                              className="accent-[#4F46E5]"
                            />
                            <Input
                              value={opt.text}
                              onChange={(e) => {
                                const opts = [...(selectedField.options ?? [])];
                                opts[idx] = { ...opt, text: e.target.value };
                                updateField(selectedField.id, { options: opts });
                              }}
                              className="h-8 flex-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const opts = (selectedField.options ?? []).filter(
                                  (_, i) => i !== idx
                                );
                                updateField(selectedField.id, { options: opts });
                              }}
                              className="text-slate-400 hover:text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs"
                        onClick={() => {
                          const opts = selectedField.options ?? [];
                          const nextChar = String.fromCharCode(65 + opts.length);
                          const id =
                            selectedField.type === "DROPDOWN" ? `opt${opts.length + 1}` : nextChar;
                          updateField(selectedField.id, {
                            options: [...opts, { id, text: id }],
                          });
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {vi.worksheets.editor.addOption}
                      </Button>
                      {selectedField.type === "MULTI_SELECT" && (
                        <label className="flex items-center justify-between pt-1">
                          <span>{vi.worksheets.editor.partialCredit}</span>
                          <Switch
                            checked={Boolean(selectedField.gradingOpts?.partialCredit)}
                            onCheckedChange={(v) =>
                              updateField(selectedField.id, {
                                gradingOpts: { ...selectedField.gradingOpts, partialCredit: v },
                              })
                            }
                          />
                        </label>
                      )}
                    </div>
                  )}

                  {selectedField.type === "TRUE_FALSE" && (
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { v: true, label: tr("Đúng (True)", "True") },
                        { v: false, label: "Sai (False)" },
                      ].map((item) => (
                        <button
                          key={String(item.v)}
                          type="button"
                          onClick={() =>
                            updateField(selectedField.id, { answerKey: { correct: item.v } })
                          }
                          className={cn(
                            "rounded-lg border py-1.5 font-semibold",
                            selectedField.answerKey.correct === item.v
                              ? "border-[#4F46E5] bg-[#4F46E5] text-white"
                              : "border-slate-200 bg-white text-slate-700"
                          )}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedField.type === "CHECKBOX" && (
                    <label className="flex items-center justify-between">
                      <span>{tr("Đáp án đúng là ĐÃ TICK (✓)", "The correct answer is TICKED (✓)")}</span>
                      <Switch
                        checked={Boolean(selectedField.answerKey.checked)}
                        onCheckedChange={(v) =>
                          updateField(selectedField.id, { answerKey: { checked: v } })
                        }
                      />
                    </label>
                  )}

                  {selectedField.type === "ESSAY" && (
                    <div className="space-y-1">
                      <Label className="text-[11px]">{vi.worksheets.editor.rubric}</Label>
                      <Textarea
                        rows={3}
                        value={String(selectedField.answerKey.rubric ?? "")}
                        onChange={(e) =>
                          updateField(selectedField.id, { answerKey: { rubric: e.target.value } })
                        }
                        placeholder={tr("Tiêu chí chấm tự luận…", "Essay grading criteria…")}
                        className="text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* Overlay Styling */}
                {selectedField.placement === "OVERLAY" && (
                  <div className="space-y-2 border-t border-slate-100 pt-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px]">{vi.worksheets.editor.fontSize}</Label>
                        <Input
                          type="number"
                          min={9}
                          max={36}
                          value={selectedField.style?.fontSize ?? 13}
                          onChange={(e) =>
                            updateField(selectedField.id, {
                              style: {
                                ...selectedField.style,
                                fontSize: Number(e.target.value) || 13,
                              },
                            })
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">{vi.worksheets.editor.textAlign}</Label>
                        <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 p-0.5">
                          {(["left", "center", "right"] as const).map((al) => (
                            <button
                              key={al}
                              type="button"
                              onClick={() =>
                                updateField(selectedField.id, {
                                  style: { ...selectedField.style, align: al },
                                })
                              }
                              className={cn(
                                "flex h-7 items-center justify-center rounded",
                                (selectedField.style?.align ?? "left") === al
                                  ? "bg-[#EEF2FF] text-[#3525CD]"
                                  : "text-slate-400"
                              )}
                            >
                              {al === "left" && <AlignLeft className="h-3.5 w-3.5" />}
                              {al === "center" && <AlignCenter className="h-3.5 w-3.5" />}
                              {al === "right" && <AlignRight className="h-3.5 w-3.5" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <label className="flex items-center justify-between">
                      <span>{vi.worksheets.editor.transparentBg}</span>
                      <Switch
                        checked={Boolean(selectedField.style?.transparentBg)}
                        onCheckedChange={(v) =>
                          updateField(selectedField.id, {
                            style: { ...selectedField.style, transparentBg: v },
                          })
                        }
                      />
                    </label>
                  </div>
                )}

                {/* Explanation */}
                <div className="space-y-1 border-t border-slate-100 pt-2.5">
                  <Label className="text-[11px]">{vi.worksheets.editor.explanation}</Label>
                  <Textarea
                    rows={2}
                    value={selectedField.explanation ?? ""}
                    onChange={(e) =>
                      updateField(selectedField.id, { explanation: e.target.value })
                    }
                    placeholder={tr("Giải thích hiện cho học sinh sau khi nộp…", "Explanation shown to students after submitting…")}
                    className="text-xs"
                  />
                </div>

                {/* Duplicate & Delete buttons */}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={duplicateSelectedFields}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {tr("Sao chép", "Duplicate")}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={deleteSelectedFields}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {tr("Xoá ô", "Delete box")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* BOTTOM SECTION: Mode B — Answer Sheet & Quick Answer Key (Stitch style) */}
      <section className="stitch-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FFEDD5] text-[#F97316]">
              <Sparkles className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-[#0B1C30]">
                {vi.worksheets.modes.sheetTab} ({sheetFields.length} {tr("câu)", "questions)")}
              </h3>
              <p className="text-xs text-[#464555]">
                {tr("Thêm nhanh câu hỏi phiếu trả lời hoặc dán chuỗi đáp án trắc nghiệm (VD: ABCDA hoặc 1A 2B 3C).", "Quickly add answer-sheet questions or paste a multiple-choice key (e.g. ABCDA or 1A 2B 3C).")}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Add + Bulk Answer Key Controls */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Quick Add N questions */}
          <div className="rounded-xl border border-slate-200 bg-[#F8F9FF] p-3.5 space-y-2.5">
            <p className="text-xs font-bold text-[#0B1C30]">
              {vi.worksheets.editor.quickAddTitle}
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-20">
                <Label className="text-[11px]">{vi.worksheets.editor.quickAddCount}</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={quickCount}
                  onChange={(e) => setQuickCount(Number(e.target.value) || 1)}
                  className="mt-1 h-9 text-xs"
                />
              </div>
              <div className="flex-1 min-w-[140px]">
                <Label className="text-[11px]">{vi.worksheets.editor.quickAddType}</Label>
                <select
                  value={quickType}
                  onChange={(e) => setQuickType(e.target.value as FieldType)}
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium outline-none focus:border-[#4F46E5]"
                >
                  <option value="MULTIPLE_CHOICE">{tr("Trắc nghiệm A–D", "Multiple choice A–D")}</option>
                  <option value="TRUE_FALSE">{tr("Đúng / Sai", "True / False")}</option>
                  <option value="TEXT">{tr("Điền ngắn", "Short answer")}</option>
                  <option value="NUMBER">{tr("Điền số", "Number")}</option>
                  <option value="ESSAY">{tr("Tự luận", "Essay")}</option>
                </select>
              </div>
              <div className="w-24">
                <Label className="text-[11px]">{vi.worksheets.editor.quickAddStart}</Label>
                <Input
                  type="number"
                  min={1}
                  value={quickStart}
                  onChange={(e) => setQuickStart(Number(e.target.value) || 1)}
                  className="mt-1 h-9 text-xs"
                />
              </div>
              <Button type="button" size="sm" onClick={handleQuickAdd} className="h-9">
                <Plus className="h-4 w-4" />
                {vi.worksheets.editor.quickAddButton}
              </Button>
            </div>
          </div>

          {/* Bulk Answer Key String */}
          <div className="rounded-xl border border-indigo-100 bg-[#EEF2FF]/50 p-3.5 space-y-2.5">
            <p className="text-xs font-bold text-[#3525CD]">
              {vi.worksheets.editor.bulkKeyTitle}
            </p>
            <div className="flex items-center gap-2">
              <Input
                value={bulkKeyInput}
                onChange={(e) => setBulkKeyInput(e.target.value)}
                placeholder={vi.worksheets.editor.bulkKeyPlaceholder}
                className="h-9 flex-1 bg-white font-mono text-xs tracking-wider"
              />
              <Button type="button" size="sm" onClick={handleApplyBulkKey} className="h-9 shrink-0">
                {vi.worksheets.editor.bulkKeyApply}
              </Button>
            </div>
          </div>
        </div>

        {/* List of ANSWER_SHEET fields */}
        {sheetFields.length > 0 && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sheetFields.map((field) => {
              const isSelected = selectedIds.includes(field.id);
              return (
                <div
                  key={field.id}
                  onClick={() => setSelectedIds([field.id])}
                  className={cn(
                    "cursor-pointer rounded-xl border p-3 transition",
                    isSelected
                      ? "border-[#4F46E5] bg-[#EEF2FF]/60 ring-2 ring-indigo-100"
                      : "border-slate-200 bg-white hover:border-indigo-200"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 min-w-[24px] items-center justify-center rounded-md bg-[#4F46E5] px-1.5 text-xs font-bold text-white">
                        {field.label}
                      </span>
                      <span className="text-xs font-semibold text-[#0B1C30]">
                        {vi.worksheets.tools[field.type]}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-500">
                        {field.points}{tr("đ", "pt")}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFields((prev) => prev.filter((x) => x.id !== field.id));
                          setSelectedIds((prev) => prev.filter((x) => x !== field.id));
                        }}
                        className="text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Quick inline answer editor */}
                  <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
                    {field.type === "MULTIPLE_CHOICE" && (
                      <div className="flex gap-1.5">
                        {(field.options ?? []).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              updateField(field.id, { answerKey: { correct: opt.id } })
                            }
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition",
                              field.answerKey.correct === opt.id
                                ? "bg-[#4F46E5] text-white"
                                : "bg-slate-100 text-slate-600 hover:bg-indigo-100"
                            )}
                          >
                            {opt.id}
                          </button>
                        ))}
                      </div>
                    )}

                    {field.type === "TRUE_FALSE" && (
                      <div className="flex gap-1.5">
                        {[
                          { v: true, label: tr("Đúng", "True") },
                          { v: false, label: "Sai" },
                        ].map((o) => (
                          <button
                            key={String(o.v)}
                            type="button"
                            onClick={() =>
                              updateField(field.id, { answerKey: { correct: o.v } })
                            }
                            className={cn(
                              "rounded-lg px-2.5 py-1 text-xs font-semibold",
                              field.answerKey.correct === o.v
                                ? "bg-[#4F46E5] text-white"
                                : "bg-slate-100 text-slate-600"
                            )}
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}

                    {field.type === "TEXT" && (
                      <Input
                        value={
                          Array.isArray(field.answerKey.accepted)
                            ? (field.answerKey.accepted as string[]).join("|")
                            : ""
                        }
                        onChange={(e) =>
                          updateField(field.id, {
                            answerKey: {
                              accepted: e.target.value.split("|").map((s) => s.trim()),
                            },
                          })
                        }
                        placeholder={tr("Đáp án chấp nhận (vd: don't|do not)", "Accepted answer (e.g. don't|do not)")}
                        className="h-8 text-xs"
                      />
                    )}

                    {field.type === "NUMBER" && (
                      <Input
                        type="number"
                        step="any"
                        value={String(field.answerKey.value ?? 0)}
                        onChange={(e) =>
                          updateField(field.id, {
                            answerKey: {
                              ...field.answerKey,
                              value: Number(e.target.value),
                            },
                          })
                        }
                        className="h-8 text-xs"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
