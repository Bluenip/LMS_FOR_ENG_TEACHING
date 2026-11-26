"use client";

import { BackLink } from "@/components/navigation/BackLink";
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
  BookOpen,
  Camera,
  CheckCircle2,
  CheckSquare,
  ChevronDownSquare,
  Code,
  Copy,
  Download,
  Eye,
  FileDown,
  FileText,
  FileUp,
  Grid,
  Grid3X3,
  Hash,
  Headphones,
  Highlighter,
  ImagePlus,
  Link2,
  ListChecks,
  ListOrdered,
  Mic,
  MousePointer2,
  Move,
  PenTool,
  Plus,
  Redo2,
  Save,
  ScanSearch,
  Send,
  Share2,
  Sigma,
  Sparkles,
  Trash2,
  Type,
  Undo2,
  Upload,
  Volume2,
  ZoomIn,
  ZoomOut,
  Columns2,
} from "lucide-react";
import type { FieldType, SkillTag, WorksheetSubject } from "@prisma/client";
import {
  asOptionList,
  gradeSubmission,
  isManualFieldType,
  parseBulkAnswerString,
  type AnswerValue,
} from "@/lib/grading";
import { InteractiveFieldEditor } from "./interactive/InteractiveFieldEditor";
import { isInteractiveFieldType } from "./interactive/InteractiveQuestionInput";
import {
  createHistory,
  pushHistory,
  undoHistory,
  redoHistory,
  canUndo,
  canRedo,
} from "@/lib/worksheet/editor-history";
import {
  detectPdfBlanks,
  type DetectedPdfBlank,
} from "@/lib/worksheet/pdf-blank-detector";
import {
  getSubjectMeta,
  getSubjectProfile,
  normalizeSubject,
  WORKSHEET_SUBJECTS,
} from "@/lib/subjects";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PdfCanvasPage, usePdfDocument } from "./PdfCanvasPage";
import { OverlayFieldInput } from "./OverlayFieldInput";
import { AnswerSheetPanel } from "./AnswerSheetPanel";
import { LimitedAudioPlayer } from "./LimitedAudioPlayer";
import { MathText, hasMathSyntax } from "./MathText";
import { PromptText } from "./PromptText";
import { PassagesEditorPanel } from "./PassagesEditorPanel";
import { RubricEditor } from "./RubricEditor";
import { TrueFalseGroupEditor } from "./TrueFalseGroupEditor";
import { FormulaToolbar } from "./FormulaToolbar";
import type {
  EditorFieldDTO,
  StudentFieldDTO,
  WorksheetAudioDTO,
  WorksheetPageDTO,
  WorksheetPassageDTO,
} from "./types";

interface WorksheetEditorProps {
  initialWorksheet: {
    id: string;
    title: string;
    subject?: WorksheetSubject;
    instructions: string | null;
    passages?: WorksheetPassageDTO[];
    pdfFileKey: string | null;
    pageCount: number;
    isShared?: boolean;
    pages: WorksheetPageDTO[];
    fields: EditorFieldDTO[];
    audios?: WorksheetAudioDTO[];
    storageLocations?: Record<string, "drive" | "s3" | "local">;
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
  TRUE_FALSE_GROUP: { border: "border-cyan-500", bg: "bg-cyan-50/75", badge: "bg-cyan-600" },
  ESSAY: { border: "border-rose-500", bg: "bg-rose-50/75", badge: "bg-rose-600" },
  DICTATION: { border: "border-purple-500", bg: "bg-purple-50/75", badge: "bg-purple-600" },
  PHOTO_UPLOAD: { border: "border-lime-500", bg: "bg-lime-50/75", badge: "bg-lime-600" },
  MATCH: { border: "border-blue-500", bg: "bg-blue-50/75", badge: "bg-blue-600" },
  DRAG_DROP: { border: "border-fuchsia-500", bg: "bg-fuchsia-50/75", badge: "bg-fuchsia-600" },
  SPEAKING: { border: "border-pink-500", bg: "bg-pink-50/75", badge: "bg-pink-600" },
  VOICE_ANSWER: { border: "border-amber-600", bg: "bg-amber-50/75", badge: "bg-amber-700" },
  HIGHLIGHT: { border: "border-yellow-500", bg: "bg-yellow-50/75", badge: "bg-yellow-600" },
  ORDERING: { border: "border-emerald-600", bg: "bg-emerald-50/75", badge: "bg-emerald-700" },
  WORDSEARCH: { border: "border-cyan-600", bg: "bg-cyan-50/75", badge: "bg-cyan-700" },
  DRAW: { border: "border-violet-600", bg: "bg-violet-50/75", badge: "bg-violet-700" },
  CODE: { border: "border-slate-700", bg: "bg-slate-100/80", badge: "bg-slate-800" },
};

const SKILL_VALUES: SkillTag[] = ["GRAMMAR", "VOCABULARY", "READING", "LISTENING", "WRITING", "SPEAKING"];

/** Next free question number: highest leading number among labels ("3a" counts as 3) + 1. */
function nextQuestionNumber(list: Array<{ label: string }>): number {
  let max = 0;
  for (const f of list) {
    const n = parseInt(f.label, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

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
    case "TRUE_FALSE_GROUP":
      return {
        type,
        label,
        order,
        points: 1,
        options: [
          { id: "a", text: "" },
          { id: "b", text: "" },
          { id: "c", text: "" },
          { id: "d", text: "" },
        ],
        answerKey: { correct: { a: true, b: true, c: false, d: false } },
        gradingOpts: { tfScoring: "THPT_2025" },
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
    case "PHOTO_UPLOAD":
      return {
        type,
        label,
        order,
        points: 2,
        options: null,
        answerKey: { rubric: "", maxFiles: 5 },
        gradingOpts: null,
        style: baseStyle,
      };
    case "DICTATION":
      return {
        type,
        label,
        order,
        points: 2,
        options: null,
        answerKey: { transcript: "" },
        gradingOpts: {
          caseSensitive: false,
          ignorePunctuation: true,
          scoring: "WORD_ACCURACY",
        },
        style: baseStyle,
      };
    case "MATCH":
      return {
        type,
        label,
        order,
        points: 2,
        options: {
          left: [
            { id: "L1", text: "1" },
            { id: "L2", text: "2" },
          ],
          right: [
            { id: "R1", text: "A" },
            { id: "R2", text: "B" },
          ],
        },
        answerKey: {
          pairs: [
            ["L1", "R1"],
            ["L2", "R2"],
          ],
        },
        gradingOpts: null,
        style: baseStyle,
      };
    case "DRAG_DROP":
      return {
        type,
        label,
        order,
        points: 2,
        options: {
          tokens: [
            { id: "T1", text: "Token 1" },
            { id: "T2", text: "Token 2" },
          ],
          slots: [
            { id: "S1", label: "Slot 1" },
            { id: "S2", label: "Slot 2" },
          ],
          singleUse: true,
        },
        answerKey: { slots: { S1: ["T1"], S2: ["T2"] } },
        gradingOpts: null,
        style: baseStyle,
      };
    case "SPEAKING":
      return {
        type,
        label,
        order,
        points: 2,
        options: { lang: "en-US", maxTries: 3 },
        answerKey: { transcript: "Hello world" },
        gradingOpts: { ignorePunctuation: true, scoring: "WORD_ACCURACY" },
        style: baseStyle,
      };
    case "VOICE_ANSWER":
      return {
        type,
        label,
        order,
        points: 2,
        options: { maxDurationSec: 120 },
        answerKey: { note: "" },
        gradingOpts: null,
        style: baseStyle,
      };
    case "HIGHLIGHT":
      return {
        type,
        label,
        order,
        points: 2,
        options: { tokens: ["Highlight", "the", "verb", "here."] },
        answerKey: { indices: [0] },
        gradingOpts: null,
        style: baseStyle,
      };
    case "ORDERING":
      return {
        type,
        label,
        order,
        points: 2,
        options: {
          items: [
            { id: "1", text: "Step 1" },
            { id: "2", text: "Step 2" },
          ],
        },
        answerKey: { order: ["1", "2"] },
        gradingOpts: { orderingScoring: "LCS" },
        style: baseStyle,
      };
    case "WORDSEARCH":
      return {
        type,
        label,
        order,
        points: 2,
        options: { rows: 8, cols: 8, seed: 42, showWordList: true },
        answerKey: { words: ["CAT", "DOG"] },
        gradingOpts: null,
        style: baseStyle,
      };
    case "DRAW":
      return {
        type,
        label,
        order,
        points: 2,
        options: { width: 560, height: 300 },
        answerKey: { note: "" },
        gradingOpts: null,
        style: baseStyle,
      };
    case "CODE":
      return {
        type,
        label,
        order,
        points: 2,
        options: { language: "javascript", starterCode: "console.log('Hello');" },
        answerKey: { referenceCode: "console.log('Hello');", expectedOutput: "Hello" },
        gradingOpts: null,
        style: baseStyle,
      };
  }
}

function clamp01(val: number): number {
  return Math.max(0, Math.min(1, Math.round(val * 10000) / 10000));
}

export function WorksheetEditor({ initialWorksheet }: WorksheetEditorProps) {
  const { m: vi, tr, locale } = useI18n();
  const [worksheetId] = useState(initialWorksheet.id);
  const [title, setTitle] = useState(initialWorksheet.title);
  const [subject, setSubject] = useState<WorksheetSubject>(() =>
    normalizeSubject(initialWorksheet.subject)
  );
  const [passages, setPassages] = useState<WorksheetPassageDTO[]>(
    initialWorksheet.passages ?? []
  );
  const [showPassagesOverride, setShowPassagesOverride] = useState(false);
  const [showAllTools, setShowAllTools] = useState(false);
  const [pdfFileKey, setPdfFileKey] = useState<string | null>(initialWorksheet.pdfFileKey);
  const [storageLocations, setStorageLocations] = useState<
    Record<string, "drive" | "s3" | "local">
  >(initialWorksheet.storageLocations ?? {});
  const [pages, setPages] = useState<WorksheetPageDTO[]>(initialWorksheet.pages);
  const [audios, setAudios] = useState<WorksheetAudioDTO[]>(initialWorksheet.audios ?? []);
  const [isShared, setIsShared] = useState(Boolean(initialWorksheet.isShared));
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [importingWord, setImportingWord] = useState(false);
  const [uploadingBgImages, setUploadingBgImages] = useState(false);
  const [uploadingFieldImageId, setUploadingFieldImageId] = useState<string | null>(null);
  const [detectingBlanks, setDetectingBlanks] = useState(false);
  const [detectedBlanks, setDetectedBlanks] = useState<DetectedPdfBlank[]>([]);
  const [selectedBlankIndices, setSelectedBlankIndices] = useState<number[]>([]);
  const [detectDialogOpen, setDetectDialogOpen] = useState(false);
  const wordAppendInputRef = useRef<HTMLInputElement | null>(null);
  const bgImagesInputRef = useRef<HTMLInputElement | null>(null);

  const [history, setHistory] = useState(() =>
    createHistory<EditorFieldDTO[]>(
      initialWorksheet.fields.map((f) => ({ ...f, isPersisted: true }))
    )
  );
  const fields = history.present;
  const setFields = useCallback(
    (
      updater: EditorFieldDTO[] | ((prev: EditorFieldDTO[]) => EditorFieldDTO[]),
      opts?: { skipHistory?: boolean; replaceWithinMs?: number }
    ) => {
      setHistory((h) => {
        const next = typeof updater === "function" ? updater(h.present) : updater;
        if (next === h.present) return h;
        if (opts?.skipHistory) {
          return { ...h, present: next };
        }
        return pushHistory(h, next, { replaceWithinMs: opts?.replaceWithinMs });
      });
    },
    []
  );
  const handleUndo = useCallback(() => {
    setHistory((h) => undoHistory(h));
  }, []);
  const handleRedo = useCallback(() => {
    setHistory((h) => redoHistory(h));
  }, []);

  const [activeTool, setActiveTool] = useState<ActiveTool>("SELECT");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activePage, setActivePage] = useState(0);
  const [zoom, setZoom] = useState(1.0);
  const pdfScrollRef = useRef<HTMLDivElement | null>(null);
  /** set while a thumbnail jump is animating, so the scroll handler does not fight it */
  const jumpingToPageRef = useRef<number | null>(null);

  /** Jumps to a PDF page: inside the PDF panel on desktop, in the window on phones. */
  const goToPage = (pageIndex: number) => {
    setActivePage(pageIndex);
    const container = pdfScrollRef.current;
    const pageEl = container?.querySelector<HTMLElement>(`[data-pdf-page="${pageIndex}"]`);
    if (!container || !pageEl) return;
    const label = (pageEl.parentElement as HTMLElement | null) ?? pageEl; // include the "Page n / N" caption
    jumpingToPageRef.current = pageIndex;
    window.setTimeout(() => {
      if (jumpingToPageRef.current === pageIndex) jumpingToPageRef.current = null;
    }, 900);
    const scrollsInside = container.scrollHeight > container.clientHeight + 1 &&
      getComputedStyle(container).overflowY !== "visible";
    if (scrollsInside) {
      const top = label.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 12;
      container.scrollTo({ top, behavior: "smooth" });
    } else {
      // phones: the window scrolls; keep the page below the sticky editor toolbar
      const toolbar = document.querySelector<HTMLElement>("[data-editor-toolbar]");
      const offset = (toolbar?.getBoundingClientRect().bottom ?? 80) + 12;
      window.scrollTo({ top: window.scrollY + label.getBoundingClientRect().top - offset, behavior: "smooth" });
    }
  };

  /** Highlights the thumbnail of the page currently at the top of the PDF panel. */
  const syncActivePageFromScroll = () => {
    const container = pdfScrollRef.current;
    if (!container || jumpingToPageRef.current !== null) return;
    const top = container.getBoundingClientRect().top + 80;
    let current = 0;
    container.querySelectorAll<HTMLElement>("[data-pdf-page]").forEach((el) => {
      if (el.getBoundingClientRect().top <= top) current = Number(el.dataset.pdfPage ?? 0);
    });
    if (current !== activePage) {
      setActivePage(current);
      document
        .querySelector<HTMLElement>(`[data-thumb-page="${current}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
  };
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
  const [quickType, setQuickType] = useState<FieldType>(
    () => getSubjectProfile(initialWorksheet.subject).defaultQuickType
  );
  const [quickStart, setQuickStart] = useState(() => nextQuestionNumber(initialWorksheet.fields));
  const [bulkKeyInput, setBulkKeyInput] = useState("");

  const profile = useMemo(() => getSubjectProfile(subject), [subject]);
  const subjectMeta = useMemo(() => getSubjectMeta(subject), [subject]);

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
  const audioInputRef = useRef<HTMLInputElement | null>(null);

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
  const fieldCount = fields.length;
  useEffect(() => {
    setQuickStart(nextQuestionNumber(fields));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldCount]);

  const sheetFields = useMemo(
    () => fields.filter((f) => f.placement === "ANSWER_SHEET"),
    [fields]
  );

  /**
   * Centre of the studio when the worksheet has a PDF: the PDF pages, or the answer-sheet
   * questions (e.g. imported from Word) — so those can be edited without scrolling past every page.
   * Opens on the answer sheet when there are sheet questions but no boxes drawn on the PDF yet.
   */
  const [studioView, setStudioView] = useState<"pdf" | "sheet">(() => {
    const hasSheet = initialWorksheet.fields.some((f) => f.placement === "ANSWER_SHEET");
    const hasOverlay = initialWorksheet.fields.some((f) => f.placement === "OVERLAY");
    return hasSheet && !hasOverlay ? "sheet" : "pdf";
  });

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
              passageId: f.passageId ?? null,
              audioId: f.audioId ?? null,
              imageKey: f.imageKey ?? null,
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
              rubric: f.rubric ?? null,
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
        setFields(
          (prev) => {
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
          },
          { skipHistory: true }
        );
        setSaveState("saved");
      } catch (err) {
        console.error("Save fields error:", err);
        setSaveState("error");
        toast.error(err instanceof Error ? err.message : vi.common.saveFailed);
      }
    },
    [setFields, worksheetId, tr, vi]
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

  const passagesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (passagesTimerRef.current) clearTimeout(passagesTimerRef.current);
    };
  }, []);

  const handlePassagesChange = (next: WorksheetPassageDTO[]) => {
    setPassages(next);
    if (passagesTimerRef.current) clearTimeout(passagesTimerRef.current);
    passagesTimerRef.current = setTimeout(() => {
      void fetch(`/api/worksheets/${worksheetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passages: next }),
      });
    }, 800);
  };

  const handleChangeSubject = async (nextSubject: WorksheetSubject) => {
    setSubject(nextSubject);
    setActiveTool("SELECT");
    setQuickType(getSubjectProfile(nextSubject).defaultQuickType);
    const res = await fetch(`/api/worksheets/${worksheetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: nextSubject }),
    });
    if (res.ok) {
      const m = getSubjectMeta(nextSubject);
      toast.success(
        tr(
          `Đã chuyển giao diện môn ${m.shortVi}.`,
          `Switched editor to ${m.shortEn}.`
        )
      );
    } else {
      toast.error(vi.common.saveFailed);
    }
  };

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
      if (json.worksheet.pdfFileKey && json.storageLocation) {
        setStorageLocations((prev) => ({
          ...prev,
          [json.worksheet.pdfFileKey]: json.storageLocation,
        }));
      }
      setPages(json.worksheet.pages);
      setActivePage(0);
      toast.success(tr(`Đã tải PDF (${json.worksheet.pageCount} trang)!`, `PDF uploaded (${json.worksheet.pageCount} pages)!`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Tải PDF thất bại", "PDF upload failed"));
    } finally {
      setUploadingPdf(false);
    }
  };

  const handleUploadBgImages = async (fileList: FileList) => {
    const fileArr = Array.from(fileList).slice(0, 30);
    if (fileArr.length === 0) return;
    setUploadingBgImages(true);
    try {
      const formData = new FormData();
      fileArr.forEach((f) => formData.append("files", f));
      const res = await fetch(`/api/worksheets/${worksheetId}/images`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Tải ảnh nền thất bại", "Background image upload failed"));
      setPdfFileKey(null);
      setPages(json.worksheet.pages ?? []);
      setActivePage(0);
      setStudioView("pdf");
      toast.success(
        tr(
          `Đã tải ${json.worksheet.pageCount} ảnh trang đề (Fill on image)!`,
          `Uploaded ${json.worksheet.pageCount} background image page(s)!`
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Tải ảnh nền thất bại", "Background image upload failed"));
    } finally {
      setUploadingBgImages(false);
    }
  };

  const handleUploadFieldImage = async (fieldId: string, file: File) => {
    const target = fields.find((f) => f.id === fieldId);
    setUploadingFieldImageId(fieldId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (target?.isPersisted) {
        formData.append("fieldId", fieldId);
      }
      const res = await fetch(`/api/worksheets/${worksheetId}/field-image`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Tải ảnh câu hỏi thất bại", "Image upload failed"));
      setFields((prev) =>
        prev.map((f) => (f.id === fieldId ? { ...f, imageKey: json.imageKey } : f))
      );
      toast.success(tr("Đã gắn ảnh minh hoạ cho câu hỏi!", "Attached question illustration!"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Tải ảnh câu hỏi thất bại", "Image upload failed"));
    } finally {
      setUploadingFieldImageId(null);
    }
  };

  const handleDeleteFieldImage = async (fieldId: string) => {
    const target = fields.find((f) => f.id === fieldId);
    if (!target?.imageKey) return;
    try {
      const qs = new URLSearchParams();
      if (target.isPersisted) qs.set("fieldId", target.id);
      qs.set("imageKey", target.imageKey);
      const res = await fetch(`/api/worksheets/${worksheetId}/field-image?${qs.toString()}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Xoá ảnh thất bại", "Remove image failed"));
      setFields((prev) =>
        prev.map((f) => (f.id === fieldId ? { ...f, imageKey: null } : f))
      );
      toast.success(tr("Đã gỡ ảnh minh hoạ.", "Illustration removed."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Xoá ảnh thất bại", "Remove image failed"));
    }
  };

  const handleDetectPdfBlanks = async () => {
    if (!pdfDoc) return;
    setDetectingBlanks(true);
    try {
      const found: DetectedPdfBlank[] = [];
      for (let i = 0; i < pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i + 1);
        const viewport = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const items = content.items
          .filter((item): item is typeof item & { str: string; transform: number[]; width: number; height?: number } =>
            typeof (item as { str?: unknown }).str === "string"
          )
          .map((item) => ({
            str: item.str,
            transform: item.transform,
            width: item.width,
            height: item.height,
          }));
        const pageFound = detectPdfBlanks(items, { width: viewport.width, height: viewport.height }, i, fields);
        found.push(...pageFound);
      }
      if (found.length === 0) {
        toast.info(tr("Không phát hiện ô trống (____ / [ ]) mới nào trên PDF.", "No new blank areas (____ / [ ]) detected in PDF."));
        return;
      }
      setDetectedBlanks(found);
      setSelectedBlankIndices(found.map((_, idx) => idx));
      setDetectDialogOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Quét PDF thất bại", "PDF scan failed"));
    } finally {
      setDetectingBlanks(false);
    }
  };

  const handleConfirmDetectedBlanks = () => {
    const selectedSet = new Set(selectedBlankIndices);
    const chosen = detectedBlanks.filter((_, idx) => selectedSet.has(idx));
    if (chosen.length === 0) {
      setDetectDialogOpen(false);
      return;
    }
    const created: EditorFieldDTO[] = chosen.map((b, idx) => {
      const base = createDefaultFieldPayload(
        b.type,
        String(fields.length + idx + 1),
        fields.length + idx,
        tr("Lựa chọn", "Option")
      );
      return {
        id: `tmp-scan-${Date.now()}-${idx}`,
        isPersisted: false,
        placement: "OVERLAY",
        pageIndex: b.pageIndex,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        ...base,
      };
    });
    setFields((prev) => [...prev, ...created]);
    setDetectDialogOpen(false);
    setStudioView("pdf");
    toast.success(
      tr(`Đã thêm ${created.length} ô tương tác từ quét PDF!`, `Added ${created.length} interactive boxes from PDF scan!`)
    );
  };

  const handleUploadAudio = async (file: File) => {
    setUploadingAudio(true);
    try {
      // Best-effort client-side duration probe so server knows track length for stream token TTL
      const durationSec = await new Promise<number | null>((resolve) => {
        const url = URL.createObjectURL(file);
        const el = new Audio();
        el.preload = "metadata";
        const cleanup = () => URL.revokeObjectURL(url);
        el.onloadedmetadata = () => {
          const d = Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration) : null;
          cleanup();
          resolve(d);
        };
        el.onerror = () => {
          cleanup();
          resolve(null);
        };
        el.src = url;
      });

      const formData = new FormData();
      formData.append("file", file);
      if (durationSec !== null) formData.append("durationSec", String(durationSec));
      const res = await fetch(`/api/worksheets/${worksheetId}/audio`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Tải file nghe thất bại", "Audio upload failed"));
      setAudios((prev) => [...prev, json.audio]);
      if (json.audio.fileKey && json.storageLocation) {
        setStorageLocations((prev) => ({
          ...prev,
          [json.audio.fileKey]: json.storageLocation,
        }));
      }
      toast.success(tr(`Đã tải lên file nghe "${json.audio.title}"`, `Uploaded audio "${json.audio.title}"`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Tải file nghe thất bại", "Audio upload failed"));
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleRenameAudio = async (audioId: string, nextTitle: string) => {
    const trimmed = nextTitle.trim();
    if (!trimmed) return;
    const res = await fetch(`/api/worksheets/${worksheetId}/audio/${audioId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    if (res.ok) {
      setAudios((prev) => prev.map((a) => (a.id === audioId ? { ...a, title: trimmed } : a)));
    }
  };

  const handleDeleteAudio = async (audioId: string) => {
    const res = await fetch(`/api/worksheets/${worksheetId}/audio/${audioId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error(tr("Xoá file nghe thất bại", "Failed to delete audio"));
      return;
    }
    setAudios((prev) => prev.filter((a) => a.id !== audioId));
    setFields((prev) => prev.map((f) => (f.audioId === audioId ? { ...f, audioId: null } : f)));
    toast.success(tr("Đã xoá file nghe.", "Audio deleted."));
  };

  const handleToggleShare = async () => {
    const next = !isShared;
    const res = await fetch(`/api/worksheets/${worksheetId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isShared: next }),
    });
    if (res.ok) {
      setIsShared(next);
      toast.success(
        next
          ? tr("Đã chia sẻ phiếu cho các giáo viên khác!", "Shared with other teachers!")
          : tr("Đã tắt chia sẻ.", "Sharing disabled.")
      );
    }
  };

  const handleAppendFromWord = async (file: File) => {
    setImportingWord(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("startNumber", String(fields.length + 1));
      const res = await fetch("/api/worksheets/parse-word", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Đọc file Word thất bại", "Word parse failed"));
      const parsed = (json.fields ?? []) as Array<{
        label: string;
        prompt: string;
        accepted: string[];
        points: number;
      }>;
      if (parsed.length === 0) {
        toast.warning(tr("Không tìm thấy ô __đáp án__ nào trong file.", "No __answer__ blanks found in file."));
        return;
      }
      const newFields: EditorFieldDTO[] = parsed.map((pf, idx) => ({
        id: `tmp-word-${Date.now()}-${idx}`,
        isPersisted: false,
        placement: "ANSWER_SHEET",
        type: "TEXT",
        label: pf.label,
        prompt: pf.prompt,
        order: fields.length + idx,
        points: pf.points,
        options: null,
        answerKey: { accepted: pf.accepted },
        gradingOpts: {
          caseSensitive: false,
          ignorePunctuation: true,
          ignoreExtraSpaces: true,
        },
        style: { fontSize: 13, align: "left", transparentBg: false },
      }));
      setFields((prev) => [...prev, ...newFields]);
      setStudioView("sheet");
      toast.success(
        tr(`Đã thêm tự động ${newFields.length} ô điền từ từ file Word!`, `Appended ${newFields.length} fill-in-the-blank items from Word!`)
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Nhập Word thất bại", "Word import failed"));
    } finally {
      setImportingWord(false);
    }
  };

  const updateField = useCallback(
    (id: string, patch: Partial<EditorFieldDTO>) => {
      setFields(
        (prev) => {
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
        },
        { replaceWithinMs: 400 }
      );
    },
    [setFields]
  );

  const deleteSelectedFields = useCallback(() => {
    if (selectedIds.length === 0) return;
    const delSet = new Set(selectedIds);
    setFields((prev) => prev.filter((f) => !delSet.has(f.id)));
    setSelectedIds([]);
  }, [selectedIds, setFields]);

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
  }, [fields, selectedIds, setFields]);

  // Keyboard shortcuts: Ctrl/Cmd+Z Undo, Ctrl/Cmd+Shift+Z Redo, Delete, Ctrl/Cmd+D, Arrow keys
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

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y")
      ) {
        e.preventDefault();
        handleRedo();
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
  }, [
    previewMode,
    selectedIds,
    deleteSelectedFields,
    duplicateSelectedFields,
    handleUndo,
    handleRedo,
    setFields,
    zoom,
  ]);

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
    setStudioView("sheet");
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
        passageId: f.passageId,
        audioId: f.audioId,
        imageKey: f.imageKey ?? null,
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
                    options: f.options,
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

        {audios.length > 0 && (
          <div className="stitch-card p-4 space-y-2.5">
            <p className="text-xs font-bold text-[#0B1C30]">
              {tr("File nghe của bài tập", "Worksheet audio tracks")}
            </p>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {audios.map((a) => (
                <LimitedAudioPlayer
                  key={a.id}
                  audio={a}
                  previewUrl={a.fileKey ? `/api/files/${a.fileKey}` : null}
                />
              ))}
            </div>
          </div>
        )}

        <div
          className={cn(
            "flex flex-col gap-6",
            pages.length > 0 ? "lg:flex-row lg:items-start" : "mx-auto max-w-3xl pb-16"
          )}
        >
          {pages.length > 0 && (
          <div className="min-w-0 flex-1 space-y-5 overflow-x-auto pb-16">
            {pages.length > 0 ? (
              pages.map((p) => (
                <PdfCanvasPage
                  key={p.pageIndex}
                  pdfDoc={pdfDoc}
                  imageUrl={p.imageKey ? `/api/files/${p.imageKey}` : null}
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
              null
            )}
          </div>
          )}

          <AnswerSheetPanel
            wide={pages.length === 0}
            allFields={previewFields}
            passages={passages}
            answers={previewAnswers}
            previewOnly
            onChange={(fieldId, val) =>
              setPreviewAnswers((prev) => ({ ...prev, [fieldId]: val }))
            }
            onJumpToField={(f) => {
              const el = document.querySelector(`[data-overlay-field-id="${f.id}"]`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            revealResult={Boolean(previewGraded)}
            revealKey={Boolean(previewGraded)}
            audios={audios}
            audioPreviewMode
            gradeByFieldId={
              previewGraded
                ? Object.fromEntries(
                    Object.entries(previewGraded.fieldResults).map(([fid, r]) => [
                      fid,
                      { isCorrect: r.isCorrect, score: r.score, gradeDetail: r.detail ?? null },
                    ])
                  )
                : {}
            }
          />
        </div>
      </div>
    );
  }

  // ===== EDITOR MODE =====
  const showAudioSection =
    profile.showAudio || audios.length > 0 || fields.some((f) => f.type === "DICTATION");
  const showSkillTagControl =
    profile.showEnglishSkills || Boolean(selectedField?.skillTag);
  const showPassagesSection =
    profile.showPassages || passages.length > 0 || showPassagesOverride;

  const toolMetaByType: Record<FieldType, { label: string; icon: React.ReactNode }> = {
    TEXT: { label: vi.worksheets.tools.TEXT, icon: <Type className="h-3.5 w-3.5" /> },
    NUMBER: { label: vi.worksheets.tools.NUMBER, icon: <Hash className="h-3.5 w-3.5" /> },
    DROPDOWN: { label: vi.worksheets.tools.DROPDOWN, icon: <ChevronDownSquare className="h-3.5 w-3.5" /> },
    CHECKBOX: { label: vi.worksheets.tools.CHECKBOX, icon: <CheckSquare className="h-3.5 w-3.5" /> },
    MULTIPLE_CHOICE: { label: vi.worksheets.tools.MULTIPLE_CHOICE, icon: <ListChecks className="h-3.5 w-3.5" /> },
    MULTI_SELECT: { label: vi.worksheets.tools.MULTI_SELECT, icon: <ListChecks className="h-3.5 w-3.5" /> },
    TRUE_FALSE: { label: vi.worksheets.tools.TRUE_FALSE, icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    TRUE_FALSE_GROUP: { label: vi.worksheets.tools.TRUE_FALSE_GROUP, icon: <CheckSquare className="h-3.5 w-3.5" /> },
    ESSAY: { label: vi.worksheets.tools.ESSAY, icon: <FileText className="h-3.5 w-3.5" /> },
    DICTATION: { label: vi.worksheets.tools.DICTATION, icon: <Mic className="h-3.5 w-3.5" /> },
    PHOTO_UPLOAD: { label: vi.worksheets.tools.PHOTO_UPLOAD, icon: <Camera className="h-3.5 w-3.5" /> },
    MATCH: { label: vi.worksheets.tools.MATCH, icon: <Link2 className="h-3.5 w-3.5" /> },
    DRAG_DROP: { label: vi.worksheets.tools.DRAG_DROP, icon: <Move className="h-3.5 w-3.5" /> },
    SPEAKING: { label: vi.worksheets.tools.SPEAKING, icon: <Volume2 className="h-3.5 w-3.5" /> },
    VOICE_ANSWER: { label: vi.worksheets.tools.VOICE_ANSWER, icon: <Mic className="h-3.5 w-3.5" /> },
    HIGHLIGHT: { label: vi.worksheets.tools.HIGHLIGHT, icon: <Highlighter className="h-3.5 w-3.5" /> },
    ORDERING: { label: vi.worksheets.tools.ORDERING, icon: <ListOrdered className="h-3.5 w-3.5" /> },
    WORDSEARCH: { label: vi.worksheets.tools.WORDSEARCH, icon: <Grid3X3 className="h-3.5 w-3.5" /> },
    DRAW: { label: vi.worksheets.tools.DRAW, icon: <PenTool className="h-3.5 w-3.5" /> },
    CODE: { label: vi.worksheets.tools.CODE, icon: <Code className="h-3.5 w-3.5" /> },
  };

  const visibleToolTypes = showAllTools
    ? profile.allAvailableTools
    : profile.primaryTools;

  const tools: Array<{ id: ActiveTool; label: string; icon: React.ReactNode }> = [
    { id: "SELECT", label: vi.worksheets.tools.select, icon: <MousePointer2 className="h-3.5 w-3.5" /> },
    ...visibleToolTypes.map((ft) => ({
      id: ft as ActiveTool,
      label: toolMetaByType[ft].label,
      icon: toolMetaByType[ft].icon,
    })),
  ];

  const availableQuickTypes: FieldType[] = Array.from(
    new Set([
      ...profile.allAvailableTools,
      ...sheetFields.map((f) => f.type),
    ])
  );

  const hasImagePages = pages.some((p) => Boolean(p.imageKey));
  const hasPdf = pages.length > 0 && (Boolean(pdfFileKey) || hasImagePages);

  // Mode B — answer sheet & quick answer key (shown in the centre tab when there is a PDF)
  const answerSheetSection = (
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
                {tr("Thêm nhanh câu hỏi phiếu trả lời, nhập tự động từ Word (__đáp án__) hoặc dán chuỗi đáp án trắc nghiệm.", "Quickly add questions, auto-import from Word (__answer__) or paste a multiple-choice key.")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={wordAppendInputRef}
              type="file"
              accept=".docx,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleAppendFromWord(f);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={importingWord}
              onClick={() => wordAppendInputRef.current?.click()}
            >
              <FileUp className="h-4 w-4 text-[#F97316]" />
              {importingWord
                ? tr("Đang phân tích…", "Parsing…")
                : tr("Nhập tự động từ Word (.docx)", "Auto-import from Word (.docx)")}
            </Button>
          </div>
        </div>

        {/* Shared Passages / Stimulus Blocks */}
        {showPassagesSection ? (
          <PassagesEditorPanel
            passages={passages}
            onChange={handlePassagesChange}
            titleLabel={
              subject === "LITERATURE" || profile.key === "SOCIAL"
                ? tr("Ngữ liệu / Văn bản đọc hiểu dùng chung", "Shared reading / source passage")
                : tr("Đoạn đọc / Ngữ liệu dùng chung", "Shared reading passage")
            }
          />
        ) : (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowPassagesOverride(true)}
              className="text-xs text-[#464555] hover:text-[#3525CD]"
            >
              <BookOpen className="h-3.5 w-3.5" />
              {tr("+ Thêm đoạn đọc / ngữ liệu dùng chung", "+ Add shared reading / stimulus passage")}
            </Button>
          </div>
        )}

        {/* Quick Add + Bulk Answer Key Controls */}
        <div className={cn("grid grid-cols-1 gap-4", hasPdf ? "xl:grid-cols-2" : "lg:grid-cols-2")}>
          {/* Quick Add N questions */}
          <div
            data-testid="quick-add-sheet-section"
            className="rounded-xl border border-slate-200 bg-[#F8F9FF] p-3.5 space-y-2.5"
          >
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
                  data-testid="quick-add-count-input"
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
                  data-testid="quick-add-type-select"
                  className="mt-1 h-9 w-full rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium outline-none focus:border-[#4F46E5]"
                >
                  {availableQuickTypes.map((ft) => (
                    <option key={ft} value={ft}>
                      {vi.worksheets.tools[ft]}
                    </option>
                  ))}
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
              <Button
                type="button"
                size="sm"
                data-testid="quick-add-submit-btn"
                onClick={handleQuickAdd}
                className="h-9"
              >
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
          <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", !hasPdf && "lg:grid-cols-3")}>
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

                  {/* Question text (from Word or typed): visible and editable right on the card */}
                  <div className="mt-2.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                    <Label className="text-[10px] font-bold uppercase text-slate-400">
                      {tr("Câu hỏi", "Question")}
                    </Label>
                    <Textarea
                      value={field.prompt ?? ""}
                      onChange={(e) => updateField(field.id, { prompt: e.target.value })}
                      onFocus={() => setSelectedIds([field.id])}
                      placeholder={tr("Nhập nội dung câu hỏi…", "Type the question…")}
                      rows={2}
                      className="mt-1 min-h-[52px] text-xs leading-relaxed"
                    />
                    <FormulaToolbar
                      compact
                      onInsert={(snippet) =>
                        updateField(field.id, {
                          prompt: `${field.prompt ?? ""}${field.prompt ? " " : ""}${snippet}`,
                        })
                      }
                    />
                    {field.prompt && hasMathSyntax(field.prompt) && (
                      <div className="mt-1 rounded-lg bg-[#F8F9FF] px-2 py-1 text-xs text-[#0B1C30]">
                        <PromptText text={field.prompt} />
                      </div>
                    )}

                    {/* Per-question illustration image */}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <input
                        id={`field-img-input-${field.id}`}
                        data-testid={`field-image-input-${field.id}`}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleUploadFieldImage(field.id, file);
                          e.target.value = "";
                        }}
                      />
                      <label
                        htmlFor={`field-img-input-${field.id}`}
                        data-testid={`field-image-upload-${field.id}`}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-[#464555] hover:border-indigo-300",
                          uploadingFieldImageId === field.id && "pointer-events-none opacity-60"
                        )}
                      >
                        <ImagePlus className="h-3.5 w-3.5 text-[#4F46E5]" />
                        {uploadingFieldImageId === field.id
                          ? tr("Đang tải…", "Uploading…")
                          : field.imageKey
                            ? tr("Đổi ảnh minh hoạ", "Change image")
                            : tr("Ảnh minh hoạ", "Add image")}
                      </label>
                      {field.imageKey && (
                        <button
                          type="button"
                          data-testid={`field-image-remove-${field.id}`}
                          onClick={() => void handleDeleteFieldImage(field.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100"
                        >
                          <Trash2 className="h-3 w-3" />
                          {tr("Gỡ ảnh", "Remove")}
                        </button>
                      )}
                    </div>
                    {field.imageKey && (
                      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white p-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/files/${field.imageKey}`}
                          alt={field.label}
                          className="max-h-36 w-full rounded object-contain"
                        />
                      </div>
                    )}

                    <Label className="mt-2 block text-[10px] font-bold uppercase text-slate-400">
                      {isManualFieldType(field.type)
                        ? tr("Hướng dẫn chấm", "Rubric")
                        : tr("Đáp án", "Answer")}
                    </Label>
                  </div>

                  {/* Quick inline answer editor */}
                  <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                    {field.type === "MULTIPLE_CHOICE" && (
                      <div className="flex gap-1.5">
                        {asOptionList(field.options).map((opt) => (
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
                          { v: false, label: tr("Sai", "False") },
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

                    {field.type === "TRUE_FALSE_GROUP" && (
                      <TrueFalseGroupEditor
                        fieldId={field.id}
                        options={asOptionList(field.options)}
                        answerKey={field.answerKey}
                        gradingOpts={field.gradingOpts}
                        compact
                        onChange={(patch) => updateField(field.id, patch)}
                      />
                    )}

                    {(field.type === "ESSAY" || field.type === "PHOTO_UPLOAD") && (
                      <div className="space-y-2">
                        <Input
                          value={String(field.answerKey.rubric ?? "")}
                          onChange={(e) =>
                            updateField(field.id, {
                              answerKey: { ...field.answerKey, rubric: e.target.value },
                            })
                          }
                          placeholder={
                            field.type === "PHOTO_UPLOAD"
                              ? tr("Yêu cầu chụp vở / tiêu chí chấm…", "Notebook photo instructions / rubric…")
                              : tr("Tiêu chí chấm tự luận…", "Essay rubric…")
                          }
                          className="h-8 text-xs"
                        />
                        <RubricEditor
                          rubric={field.rubric}
                          fieldPoints={field.points}
                          compact
                          onChange={(nextRubric, syncedPoints) =>
                            updateField(field.id, {
                              rubric: nextRubric.length > 0 ? nextRubric : null,
                              ...(syncedPoints !== undefined ? { points: syncedPoints } : {}),
                            })
                          }
                        />
                      </div>
                    )}

                    {field.type === "DICTATION" && (
                      <Textarea
                        rows={2}
                        value={String(field.answerKey.transcript ?? "")}
                        onChange={(e) =>
                          updateField(field.id, {
                            answerKey: { transcript: e.target.value },
                          })
                        }
                        placeholder={tr("Nhập transcript chuẩn…", "Enter expected transcript…")}
                        className="text-xs"
                      />
                    )}

                    {isInteractiveFieldType(field.type) && (
                      <InteractiveFieldEditor
                        fieldId={field.id}
                        type={field.type}
                        points={field.points}
                        options={field.options}
                        answerKey={field.answerKey}
                        gradingOpts={field.gradingOpts}
                        rubric={field.rubric}
                        onChange={(patch) => updateField(field.id, patch)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
  );

  return (
    <div className="space-y-4">
      {/* Top Floating Stitch Toolbar */}
      <div data-editor-toolbar className="sticky top-16 z-30 rounded-2xl border border-slate-200/90 bg-white/95 p-2.5 shadow-toolbar backdrop-blur">
        {/* Row 1: Title/Status + Document Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: Back + Title + Autosave status */}
          <div className="flex items-center gap-2 min-w-0">
            <BackLink
              iconOnly
              fallbackHref="/teacher/worksheets"
              label={tr("Quay lại", "Back")}
            />
            <div className="min-w-0">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => void saveTitle(title)}
                className="w-48 sm:w-64 truncate rounded-lg bg-transparent px-1.5 py-0.5 text-sm font-bold text-[#0B1C30] hover:bg-slate-100 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
                <span className="text-slate-300">•</span>
                <select
                  aria-label={tr("Môn học của phiếu", "Worksheet subject")}
                  value={subject}
                  onChange={(e) => void handleChangeSubject(e.target.value as WorksheetSubject)}
                  data-testid="editor-subject-select"
                  className={cn(
                    "h-5 rounded-full border-0 px-2 text-[10px] font-bold outline-none cursor-pointer",
                    subjectMeta.badgeClass
                  )}
                >
                  {WORKSHEET_SUBJECTS.map((subj) => {
                    const m = getSubjectMeta(subj);
                    return (
                      <option key={subj} value={subj}>
                        {locale === "en" ? m.shortEn : m.shortVi}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Right: Share + Export + Preview + Save + Assign CTA */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              variant={isShared ? "secondary" : "outline"}
              size="sm"
              onClick={() => void handleToggleShare()}
              title={tr("Chia sẻ phiếu cho giáo viên khác trong hệ thống", "Share worksheet with other teachers")}
            >
              <Share2 className={cn("h-4 w-4", isShared && "text-emerald-600")} />
              <span className="hidden 2xl:inline">
                {isShared ? tr("Đang chia sẻ", "Shared") : tr("Chia sẻ GV", "Share")}
              </span>
            </Button>
            <Button variant="outline" size="sm" asChild title={tr("Xuất gói backup .zip (gồm PDF + file nghe + đáp án)", "Export backup .zip")}>
              <a href={`/api/worksheets/${worksheetId}/export?format=zip`} download>
                <Download className="h-4 w-4" />
                <span className="hidden 2xl:inline">.zip</span>
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild title={tr("Xuất file Word (.docx có đáp án)", "Export Word (.docx)")}>
              <a href={`/api/worksheets/${worksheetId}/export?format=docx`} download>
                <FileDown className="h-4 w-4" />
                <span className="hidden 2xl:inline">.docx</span>
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild title={tr("Xuất đề PDF in ấn (bản học sinh)", "Export printable PDF (student)")}>
              <a
                href={`/api/worksheets/${worksheetId}/export?format=pdf&mode=student`}
                download
                data-testid="editor-export-pdf-student"
              >
                <FileDown className="h-4 w-4 text-[#4F46E5]" />
                <span className="hidden 2xl:inline">PDF (HS)</span>
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild title={tr("Xuất đề PDF kèm Đáp án in ấn", "Export printable PDF (key)")}>
              <a
                href={`/api/worksheets/${worksheetId}/export?format=pdf&mode=key`}
                download
                data-testid="editor-export-pdf-key"
              >
                <FileDown className="h-4 w-4 text-emerald-600" />
                <span className="hidden 2xl:inline">PDF (ĐA)</span>
              </a>
            </Button>
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

        {/* Row 2: Field Tool Palette + Canvas Controls (Zoom, Undo/Redo, Blanks, Snap, Align) */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-xs">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-[#EFF4FF] p-1">
            {tools.map((t) => (
              <button
                key={t.id}
                type="button"
                data-tool={t.id}
                onClick={() => setActiveTool(t.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition",
                  activeTool === t.id
                    ? "bg-[#4F46E5] text-white shadow-sm"
                    : "text-[#464555] hover:bg-white hover:text-[#3525CD]"
                )}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
            {profile.allAvailableTools.length > profile.primaryTools.length && (
              <button
                type="button"
                onClick={() => setShowAllTools((v) => !v)}
                className="inline-flex items-center rounded-lg px-2 py-1 text-[11px] font-bold text-[#3525CD] hover:bg-white"
                title={tr("Hiện thêm / thu gọn công cụ ít dùng", "Toggle secondary tools")}
              >
                {showAllTools ? tr("Thu gọn", "Less") : `+${profile.allAvailableTools.length - profile.primaryTools.length}`}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
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

            <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white px-1 py-0.5">
              <button
                type="button"
                data-testid="editor-undo-btn"
                disabled={!canUndo(history)}
                onClick={handleUndo}
                title={tr("Hoàn tác (Ctrl+Z)", "Undo (Ctrl+Z)")}
                aria-label={tr("Hoàn tác", "Undo")}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-600 hover:bg-slate-100 hover:text-[#3525CD] disabled:opacity-35 disabled:pointer-events-none"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                data-testid="editor-redo-btn"
                disabled={!canRedo(history)}
                onClick={handleRedo}
                title={tr("Làm lại (Ctrl+Shift+Z)", "Redo (Ctrl+Shift+Z)")}
                aria-label={tr("Làm lại", "Redo")}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-600 hover:bg-slate-100 hover:text-[#3525CD] disabled:opacity-35 disabled:pointer-events-none"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {pdfDoc && (
              <button
                type="button"
                data-testid="detect-pdf-blanks-btn"
                disabled={detectingBlanks}
                onClick={() => void handleDetectPdfBlanks()}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-[#EEF2FF]/70 px-2.5 py-1 font-semibold text-[#3525CD] hover:bg-[#EEF2FF] disabled:opacity-50"
              >
                <ScanSearch className="h-3.5 w-3.5" />
                {detectingBlanks
                  ? tr("Đang quét…", "Scanning…")
                  : tr("Quét ô trống từ PDF", "Detect PDF blanks")}
              </button>
            )}

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
                    data-thumb-page={p.pageIndex}
                    onClick={() => goToPage(p.pageIndex)}
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
                      ) : p.imageKey ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={`/api/files/${p.imageKey}`}
                          alt={`${tr("Trang", "Page")} ${p.pageIndex + 1}`}
                          className={cn(
                            "object-cover",
                            isLandscape ? "h-12 w-16" : "h-16 w-12"
                          )}
                        />
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
            <input
              ref={bgImagesInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              data-testid="bg-images-input"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  void handleUploadBgImages(e.target.files);
                }
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full"
              data-testid="upload-bg-images-btn"
              disabled={uploadingBgImages}
              onClick={() => bgImagesInputRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5 text-[#4F46E5]" />
              {uploadingBgImages
                ? tr("Đang tải ảnh…", "Uploading images…")
                : tr("Tải ảnh nền (Fill on image)", "Upload images (Fill on image)")}
            </Button>
            {pdfFileKey && (
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>{tr("Lưu trữ PDF:", "PDF storage:")}</span>
                <Badge
                  variant={storageLocations[pdfFileKey] === "drive" ? "mint" : "neutral"}
                  className="text-[10px]"
                  data-testid="pdf-storage-badge"
                >
                  {storageLocations[pdfFileKey] === "drive"
                    ? "Google Drive"
                    : storageLocations[pdfFileKey] === "s3"
                      ? "S3"
                      : tr("Máy chủ", "Server")}
                </Badge>
              </div>
            )}
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

          {/* Worksheet Audio Manager Card (shown for Language / General or when existing audio/dictation exists) */}
          {showAudioSection && (
          <div className="stitch-card p-3 space-y-2.5" data-testid="editor-audio-panel">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-[#0B1C30]">
                <Headphones className="h-3.5 w-3.5 text-[#4F46E5]" />
                {tr("File nghe", "Audio tracks")}
              </h3>
              <Badge variant="default" className="text-[10px]">
                {audios.length}
              </Badge>
            </div>

            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-0.5">
              {audios.length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  {tr("Chưa có file nghe. Tải MP3/WAV/M4A để dùng cho bài Listening hoặc Chép chính tả.", "No audio yet. Upload MP3/WAV/M4A for listening or dictation.")}
                </p>
              ) : (
                audios.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-xl border border-slate-200 bg-[#F8F9FF] p-2 space-y-1.5"
                  >
                    <div className="flex items-center gap-1">
                      <input
                        defaultValue={a.title}
                        onBlur={(e) => void handleRenameAudio(a.id, e.target.value)}
                        className="min-w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-[11px] font-semibold text-[#0B1C30] hover:bg-white focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                      />
                      {a.fileKey && (
                        <Badge
                          variant={storageLocations[a.fileKey] === "drive" ? "mint" : "neutral"}
                          className="text-[9px] px-1.5 py-0"
                          data-testid={`audio-storage-badge-${a.id}`}
                        >
                          {storageLocations[a.fileKey] === "drive"
                            ? "Drive"
                            : storageLocations[a.fileKey] === "s3"
                              ? "S3"
                              : tr("Máy chủ", "Server")}
                        </Badge>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleDeleteAudio(a.id)}
                        className="p-0.5 text-slate-400 hover:text-red-500"
                        title={tr("Xoá file nghe", "Delete audio")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {a.fileKey && (
                      <audio
                        controls
                        preload="none"
                        src={`/api/files/${a.fileKey}`}
                        className="h-7 w-full"
                      />
                    )}
                  </div>
                ))
              )}
            </div>

            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.m4a,.webm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUploadAudio(f);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={uploadingAudio}
              onClick={() => audioInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {uploadingAudio
                ? tr("Đang tải…", "Uploading…")
                : tr("Tải file nghe (MP3/WAV)", "Upload audio")}
            </Button>
          </div>
          )}

          {/* Math LaTeX Cheat Sheet Card (for STEM / Informatics / General) */}
          {profile.showMathHint && (
            <div className="stitch-card p-3 space-y-2" data-testid="math-latex-hint-card">
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-[#0B1C30]">
                <Sigma className="h-3.5 w-3.5 text-[#4F46E5]" />
                {tr("Gõ công thức LaTeX", "LaTeX math guide")}
              </h3>
              <p className="text-[11px] leading-relaxed text-[#464555]">
                {tr(
                  "Bọc công thức trong $...$ (trong dòng) hoặc $$...$$ (xuống dòng riêng).",
                  "Wrap formulas in $...$ (inline) or $$...$$ (display)."
                )}
              </p>
              <div className="space-y-1.5 rounded-xl bg-[#F8F9FF] p-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-[#3525CD]">{"$\\frac{a}{b}$"}</code>
                  <MathText text={"$\\frac{a}{b}$"} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-[#3525CD]">{"$x^2 + \\sqrt{x}$"}</code>
                  <MathText text={"$x^2 + \\sqrt{x}$"} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <code className="font-mono text-[#3525CD]">{"$\\Delta \\ge 0$"}</code>
                  <MathText text={"$\\Delta \\ge 0$"} />
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* CENTER: PDF Canvas + Draw + React-Rnd Overlays */}
        <section className="space-y-3 lg:col-span-7">
          {hasPdf && (
            <div
              role="tablist"
              aria-label={tr("Khu vực biên tập", "Editing area")}
              className="grid grid-cols-2 gap-1 rounded-xl bg-[#EFF4FF] p-1"
            >
              {(
                [
                  [
                    "pdf",
                    hasImagePages && !pdfFileKey
                      ? tr(
                          `Trang ảnh (${pages.length} trang · ${overlayFields.length} ô)`,
                          `Images (${pages.length} pages · ${overlayFields.length} boxes)`
                        )
                      : tr(
                          `Đề PDF (${pages.length} trang · ${overlayFields.length} ô)`,
                          `PDF (${pages.length} pages · ${overlayFields.length} boxes)`
                        ),
                  ],
                  ["sheet", tr(`Phiếu trả lời (${sheetFields.length} câu)`, `Answer sheet (${sheetFields.length} questions)`)],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={studioView === id}
                  data-testid={`studio-view-${id}`}
                  onClick={() => setStudioView(id)}
                  className={cn(
                    "min-h-10 truncate rounded-lg px-3 text-xs font-bold transition",
                    studioView === id ? "bg-white text-[#3525CD] shadow-sm" : "text-[#464555] hover:text-[#0B1C30]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {hasPdf && studioView === "sheet" ? (
            answerSheetSection
          ) : (
          <div
            ref={pdfScrollRef}
            onScroll={syncActivePageFromScroll}
            data-testid="pdf-scroll"
            className={cn(
              "rounded-2xl border border-slate-200/80 bg-[#EFF4FF]/60 p-4 overflow-x-auto",
              // desktop: the PDF scrolls inside its own panel so toolbar, pages and properties stay in view
              hasPdf && "min-h-[540px] lg:h-[calc(100vh-17rem)] lg:min-h-[420px] lg:overflow-y-auto lg:overscroll-contain"
            )}
          >
            {pdfError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {pdfError}
              </div>
            )}

            {!hasPdf ? (
              <div
                className={cn(
                  "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-white px-6 text-center",
                  sheetFields.length > 0 ? "py-6" : "py-20"
                )}
              >
                <Upload className={cn("text-[#4F46E5]", sheetFields.length > 0 ? "h-7 w-7" : "h-10 w-10")} />
                <h3 className="mt-3 text-base font-bold text-[#0B1C30]">
                  {sheetFields.length > 0
                    ? tr(
                        `Bài này dùng Phiếu trả lời (${sheetFields.length} câu, xem và sửa ngay bên dưới)`,
                        `This worksheet uses the answer sheet (${sheetFields.length} questions, view and edit them below)`
                      )
                    : tr("Tải file PDF hoặc ảnh chụp đề lên để vẽ ô tương tác", "Upload a PDF or test images to draw interactive boxes")}
                </h3>
                <p className="mt-1 max-w-md text-xs text-[#464555]">
                  {vi.worksheets.pdfRequirements} {tr("Bạn cũng có thể tải ảnh trang đề (PNG/JPG/WebP) hoặc tạo câu hỏi ở “Phiếu trả lời” bên dưới.", "You can also upload page images (PNG/JPG/WebP) or create questions in the “Answer sheet” below.")}
                </p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPdf}
                  >
                    <Upload className="h-4 w-4" />
                    {vi.worksheets.uploadPdf}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => bgImagesInputRef.current?.click()}
                    disabled={uploadingBgImages}
                  >
                    <ImagePlus className="h-4 w-4 text-[#4F46E5]" />
                    {tr("Tải ảnh nền", "Upload images")}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="relative space-y-6">
                {pdfLoading && !hasImagePages && (
                  <p className="pointer-events-none sticky top-2 z-20 mx-auto w-fit rounded-full border border-indigo-200 bg-white/95 px-3 py-1 text-center text-xs font-medium text-indigo-600 shadow-sm">
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
                        imageUrl={p.imageKey ? `/api/files/${p.imageKey}` : null}
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
                                  ? toolType === "ESSAY" ||
                                    toolType === "TRUE_FALSE_GROUP" ||
                                    toolType === "PHOTO_UPLOAD"
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
          )}
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
                        .filter(
                          (k): k is FieldType =>
                            k !== "select" &&
                            (profile.allAvailableTools.includes(k as FieldType) ||
                              k === selectedField.type)
                        )
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

                {/* Points & Optional English SkillTag */}
                <div className={cn("grid gap-2", showSkillTagControl ? "grid-cols-2" : "grid-cols-1")}>
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
                  {showSkillTagControl && (
                  <div className="space-y-1" data-testid="inspector-skill-tag">
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
                  )}
                </div>

                {/* Optional Shared Passage link */}
                {passages.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs">{tr("Gắn vào đoạn đọc / ngữ liệu", "Linked passage")}</Label>
                    <select
                      value={selectedField.passageId ?? ""}
                      onChange={(e) =>
                        updateField(selectedField.id, {
                          passageId: e.target.value || null,
                        })
                      }
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs outline-none focus:border-[#4F46E5]"
                    >
                      <option value="">{tr("Không gắn đoạn đọc", "None")}</option>
                      {passages.map((psg, i) => (
                        <option key={psg.id} value={psg.id}>
                          #{i + 1}: {psg.title || tr("Đoạn đọc", "Passage")}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Optional prompt (handy for ANSWER_SHEET) */}
                {selectedField.placement === "ANSWER_SHEET" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">{vi.worksheets.editor.prompt}</Label>
                    <Textarea
                      value={selectedField.prompt ?? ""}
                      onChange={(e) => updateField(selectedField.id, { prompt: e.target.value })}
                      placeholder={tr("Nhập đề câu hỏi nếu muốn…", "Enter the question text if you like…")}
                      rows={4}
                      className="text-xs leading-relaxed"
                    />
                    <FormulaToolbar
                      compact
                      onInsert={(snippet) =>
                        updateField(selectedField.id, {
                          prompt: `${selectedField.prompt ?? ""}${selectedField.prompt ? " " : ""}${snippet}`,
                        })
                      }
                    />
                    {selectedField.prompt && hasMathSyntax(selectedField.prompt) && (
                      <div className="rounded-lg border border-indigo-100 bg-[#F8F9FF] px-2.5 py-1.5 text-xs text-[#0B1C30]">
                        <PromptText text={selectedField.prompt} />
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <label
                        htmlFor={`field-img-input-${selectedField.id}`}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-[#464555] hover:border-indigo-300",
                          uploadingFieldImageId === selectedField.id && "pointer-events-none opacity-60"
                        )}
                      >
                        <ImagePlus className="h-3.5 w-3.5 text-[#4F46E5]" />
                        {selectedField.imageKey
                          ? tr("Đổi ảnh minh hoạ", "Change illustration")
                          : tr("Thêm ảnh minh hoạ", "Add illustration")}
                      </label>
                      {selectedField.imageKey && (
                        <button
                          type="button"
                          onClick={() => void handleDeleteFieldImage(selectedField.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100"
                        >
                          <Trash2 className="h-3 w-3" />
                          {tr("Gỡ ảnh", "Remove")}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Optional audio track link */}
                {audios.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs">{tr("Gắn file nghe cho câu này", "Linked audio track")}</Label>
                    <select
                      value={selectedField.audioId ?? ""}
                      onChange={(e) =>
                        updateField(selectedField.id, {
                          audioId: e.target.value || null,
                        })
                      }
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white px-2 text-xs outline-none focus:border-[#4F46E5]"
                    >
                      <option value="">{tr("Không gắn riêng (dùng player chung)", "None (use shared player)")}</option>
                      {audios.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.title}
                        </option>
                      ))}
                    </select>
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
                      {asOptionList(selectedField.options).map((opt, idx) => {
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
                                const opts = [...asOptionList(selectedField.options)];
                                opts[idx] = { ...opt, text: e.target.value };
                                updateField(selectedField.id, { options: opts });
                              }}
                              className="h-8 flex-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const opts = asOptionList(selectedField.options).filter(
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
                          const opts = asOptionList(selectedField.options);
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
                    <div className="space-y-2">
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
                      <RubricEditor
                        rubric={selectedField.rubric}
                        fieldPoints={selectedField.points}
                        onChange={(nextRubric, syncedPoints) =>
                          updateField(selectedField.id, {
                            rubric: nextRubric.length > 0 ? nextRubric : null,
                            ...(syncedPoints !== undefined ? { points: syncedPoints } : {}),
                          })
                        }
                      />
                    </div>
                  )}

                  {selectedField.type === "TRUE_FALSE_GROUP" && (
                    <TrueFalseGroupEditor
                      fieldId={selectedField.id}
                      options={asOptionList(selectedField.options)}
                      answerKey={selectedField.answerKey}
                      gradingOpts={selectedField.gradingOpts}
                      onChange={(patch) => updateField(selectedField.id, patch)}
                    />
                  )}

                  {selectedField.type === "PHOTO_UPLOAD" && (
                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <Label className="text-[11px]">{tr("Số ảnh / file tối đa", "Max photos / files")}</Label>
                        <Input
                          type="number"
                          min={1}
                          max={15}
                          value={Number(selectedField.answerKey.maxFiles ?? 5)}
                          onChange={(e) =>
                            updateField(selectedField.id, {
                              answerKey: {
                                ...selectedField.answerKey,
                                maxFiles: Math.max(1, Math.min(15, Number(e.target.value) || 5)),
                              },
                            })
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">{vi.worksheets.editor.rubric}</Label>
                        <Textarea
                          rows={3}
                          value={String(selectedField.answerKey.rubric ?? "")}
                          onChange={(e) =>
                            updateField(selectedField.id, {
                              answerKey: { ...selectedField.answerKey, rubric: e.target.value },
                            })
                          }
                          placeholder={tr(
                            "Hướng dẫn chấm ảnh bài làm / ghi chú cho học sinh…",
                            "Photo grading rubric / instructions…"
                          )}
                          className="text-xs"
                        />
                      </div>
                      <RubricEditor
                        rubric={selectedField.rubric}
                        fieldPoints={selectedField.points}
                        onChange={(nextRubric, syncedPoints) =>
                          updateField(selectedField.id, {
                            rubric: nextRubric.length > 0 ? nextRubric : null,
                            ...(syncedPoints !== undefined ? { points: syncedPoints } : {}),
                          })
                        }
                      />
                    </div>
                  )}

                  {selectedField.type === "DICTATION" && (
                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <Label className="text-[11px]">
                          {tr("Transcript chuẩn (đáp án chép chính tả)", "Expected transcript")}
                        </Label>
                        <Textarea
                          rows={4}
                          value={String(selectedField.answerKey.transcript ?? "")}
                          onChange={(e) =>
                            updateField(selectedField.id, {
                              answerKey: { transcript: e.target.value },
                            })
                          }
                          placeholder={tr(
                            "Nhập chính xác nội dung học sinh cần nghe và chép lại…",
                            "Enter the exact transcript students must type…"
                          )}
                          className="text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[11px]">{tr("Cách tính điểm", "Scoring rule")}</Label>
                        <select
                          value={selectedField.gradingOpts?.scoring ?? "WORD_ACCURACY"}
                          onChange={(e) =>
                            updateField(selectedField.id, {
                              gradingOpts: {
                                ...selectedField.gradingOpts,
                                scoring: e.target.value as "WORD_ACCURACY" | "ALL_OR_NOTHING",
                              },
                            })
                          }
                          className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs outline-none focus:border-[#4F46E5]"
                        >
                          <option value="WORD_ACCURACY">
                            {tr("Theo % số từ đúng (VD: 8/10 từ → 80% điểm)", "By % of correct words (e.g. 8/10 → 80%)")}
                          </option>
                          <option value="ALL_OR_NOTHING">
                            {tr("Đúng hết mới được điểm", "All-or-nothing")}
                          </option>
                        </select>
                      </div>

                      <label className="flex items-center justify-between">
                        <span>{vi.worksheets.editor.ignorePunctuation}</span>
                        <Switch
                          checked={selectedField.gradingOpts?.ignorePunctuation ?? true}
                          onCheckedChange={(v) =>
                            updateField(selectedField.id, {
                              gradingOpts: { ...selectedField.gradingOpts, ignorePunctuation: v },
                            })
                          }
                        />
                      </label>
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
                    </div>
                  )}

                  {isInteractiveFieldType(selectedField.type) && (
                    <InteractiveFieldEditor
                      fieldId={selectedField.id}
                      type={selectedField.type}
                      points={selectedField.points}
                      options={selectedField.options}
                      answerKey={selectedField.answerKey}
                      gradingOpts={selectedField.gradingOpts}
                      rubric={selectedField.rubric}
                      onChange={(patch) => updateField(selectedField.id, patch)}
                    />
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

      {/* Without a PDF the answer sheet is the whole worksheet: keep it below the studio grid */}
      {!hasPdf && answerSheetSection}

      {/* Dialog review detected PDF blanks */}
      <Dialog open={detectDialogOpen} onOpenChange={setDetectDialogOpen}>
        <DialogContent className="max-w-xl" data-testid="detect-blanks-dialog">
          <DialogHeader>
            <DialogTitle>{tr("Ô trống gợi ý từ đề PDF", "Suggested blanks from PDF")}</DialogTitle>
            <DialogDescription>
              {tr(
                "Hệ thống tự động tìm thấy các dòng gạch chân (____) và ô chọn ([ ] / ☐). Chọn những ô muốn chuyển thành ô tương tác.",
                "Automatically detected underline blanks (____) and checkboxes ([ ] / ☐). Choose which ones to add as interactive boxes."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {detectedBlanks.map((b, idx) => {
              const checked = selectedBlankIndices.includes(idx);
              return (
                <label
                  key={`${b.pageIndex}-${idx}`}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-xs transition",
                    checked
                      ? "border-[#4F46E5] bg-[#EEF2FF]/60"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedBlankIndices((prev) => [...prev, idx]);
                      } else {
                        setSelectedBlankIndices((prev) => prev.filter((i) => i !== idx));
                      }
                    }}
                    className="h-4 w-4 rounded accent-[#4F46E5]"
                  />
                  <Badge variant={b.type === "CHECKBOX" ? "mint" : "indigo"} className="shrink-0 text-[10px]">
                    {b.type}
                  </Badge>
                  <span className="shrink-0 font-semibold text-slate-600">
                    {tr("Trang", "Page")} {b.pageIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[#0B1C30]">
                    {b.snippet}
                  </span>
                </label>
              );
            })}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setDetectDialogOpen(false)}>
              {vi.common.cancel}
            </Button>
            <Button
              type="button"
              data-testid="confirm-detect-blanks-btn"
              disabled={selectedBlankIndices.length === 0}
              onClick={handleConfirmDetectedBlanks}
            >
              {tr(
                `Thêm ${selectedBlankIndices.length} ô đã chọn`,
                `Add ${selectedBlankIndices.length} selected`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
