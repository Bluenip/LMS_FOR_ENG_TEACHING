"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Eraser,
  ExternalLink,
  Pen,
  RotateCcw,
  Save,
  Square,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  PhotoAnnotationItem,
  PhotoAnnotationMap,
  PhotoAnnotationType,
  UploadedAnswerFile,
} from "@/lib/grading/types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

interface PhotoAnnotatorModalProps {
  files: UploadedAnswerFile[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
  editable?: boolean;
  annotations?: PhotoAnnotationMap | null;
  onSave?: (nextAnnotations: PhotoAnnotationMap) => Promise<void>;
}

const COLORS = ["#DC2626", "#16A34A", "#2563EB", "#D97706"];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 10000) / 10000));
}

export function PhotoAnnotatorModal({
  files,
  initialIndex,
  open,
  onClose,
  editable = false,
  annotations,
  onSave,
}: PhotoAnnotatorModalProps) {
  const { tr } = useI18n();
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<PhotoAnnotationType>("pen");
  const [color, setColor] = useState(COLORS[0]!);
  const [draft, setDraft] = useState<PhotoAnnotationMap>({});
  const [activeStroke, setActiveStroke] = useState<PhotoAnnotationItem | null>(null);
  const [pendingText, setPendingText] = useState<{ x: number; y: number; value: string } | null>(
    null
  );
  const [saving, setSaving] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setIndex(Math.max(0, Math.min(files.length - 1, initialIndex)));
      setZoom(1);
      setDraft(annotations ? structuredClone(annotations) : {});
      setActiveStroke(null);
      setPendingText(null);
    }
  }, [open, initialIndex, files.length, annotations]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pendingText) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, pendingText]);

  if (!open || files.length === 0) return null;
  const current = files[index] ?? files[0]!;
  const src = `/api/files/${current.key}`;
  const currentList = draft[current.key] ?? [];
  const renderList = activeStroke ? [...currentList, activeStroke] : currentList;

  const updateCurrentList = (updater: (prev: PhotoAnnotationItem[]) => PhotoAnnotationItem[]) => {
    setDraft((prev) => ({
      ...prev,
      [current.key]: updater(prev[current.key] ?? []),
    }));
  };

  const getRelCoords = (e: React.PointerEvent<SVGSVGElement>): [number, number] | null => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return [
      clamp01((e.clientX - rect.left) / rect.width),
      clamp01((e.clientY - rect.top) / rect.height),
    ];
  };

  const makeId = () =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 10)
      : `ann-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!editable) return;
    const pt = getRelCoords(e);
    if (!pt) return;
    const [x, y] = pt;

    if (tool === "check" || tool === "cross") {
      updateCurrentList((prev) => [
        ...prev,
        { id: makeId(), type: tool, color, strokeWidth: 3.5, x, y, w: 0.05, h: 0.05 },
      ]);
      return;
    }

    if (tool === "text") {
      setPendingText({ x, y, value: "" });
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "pen") {
      setActiveStroke({
        id: makeId(),
        type: "pen",
        color,
        strokeWidth: 3,
        points: [[x, y]],
      });
    } else {
      setActiveStroke({
        id: makeId(),
        type: tool,
        color,
        strokeWidth: 3,
        x,
        y,
        w: 0,
        h: 0,
      });
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!editable || !activeStroke) return;
    const pt = getRelCoords(e);
    if (!pt) return;
    const [x, y] = pt;

    if (activeStroke.type === "pen") {
      const pts = activeStroke.points ?? [];
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(x - last[0], y - last[1]) >= 0.004) {
        setActiveStroke({ ...activeStroke, points: [...pts, [x, y]] });
      }
    } else {
      const ox = activeStroke.x ?? x;
      const oy = activeStroke.y ?? y;
      setActiveStroke({
        ...activeStroke,
        w: clamp01(Math.abs(x - ox)),
        h: clamp01(Math.abs(y - oy)),
        // Store top-left while dragging in opposite quadrants
        x: Math.min(ox, x),
        y: Math.min(oy, y),
      });
    }
  };

  const handlePointerUp = () => {
    if (!editable || !activeStroke) return;
    const finished = activeStroke;
    setActiveStroke(null);
    if (finished.type === "pen" && (finished.points?.length ?? 0) < 2) return;
    if (
      (finished.type === "rect" || finished.type === "circle") &&
      (finished.w ?? 0) < 0.01 &&
      (finished.h ?? 0) < 0.01
    ) {
      return;
    }
    updateCurrentList((prev) => [...prev, finished]);
  };

  const commitTextNote = () => {
    if (!pendingText) return;
    const text = pendingText.value.trim();
    if (text) {
      updateCurrentList((prev) => [
        ...prev,
        {
          id: makeId(),
          type: "text",
          color,
          strokeWidth: 2,
          x: pendingText.x,
          y: pendingText.y,
          text,
        },
      ]);
    }
    setPendingText(null);
  };

  const handleSaveAll = async () => {
    if (!onSave) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const renderSvgItem = (item: PhotoAnnotationItem) => {
    if (item.type === "pen" && item.points && item.points.length > 0) {
      const d = item.points
        .map(([px, py], idx) => `${idx === 0 ? "M" : "L"} ${px} ${py}`)
        .join(" ");
      return (
        <path
          key={item.id}
          d={d}
          fill="none"
          stroke={item.color}
          strokeWidth={item.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    if (item.type === "rect" && item.x !== undefined && item.y !== undefined) {
      return (
        <rect
          key={item.id}
          x={item.x}
          y={item.y}
          width={item.w ?? 0.05}
          height={item.h ?? 0.05}
          fill="none"
          stroke={item.color}
          strokeWidth={item.strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    if (item.type === "circle" && item.x !== undefined && item.y !== undefined) {
      const w = item.w ?? 0.06;
      const h = item.h ?? 0.06;
      return (
        <ellipse
          key={item.id}
          cx={item.x + w / 2}
          cy={item.y + h / 2}
          rx={Math.max(0.005, w / 2)}
          ry={Math.max(0.005, h / 2)}
          fill="none"
          stroke={item.color}
          strokeWidth={item.strokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    if (item.type === "check" && item.x !== undefined && item.y !== undefined) {
      const x = item.x;
      const y = item.y;
      return (
        <path
          key={item.id}
          d={`M ${x - 0.02} ${y} L ${x - 0.005} ${y + 0.018} L ${x + 0.024} ${y - 0.02}`}
          fill="none"
          stroke={item.color}
          strokeWidth={item.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    if (item.type === "cross" && item.x !== undefined && item.y !== undefined) {
      const x = item.x;
      const y = item.y;
      return (
        <g
          key={item.id}
          stroke={item.color}
          strokeWidth={item.strokeWidth}
          strokeLinecap="round"
        >
          <line
            x1={x - 0.018}
            y1={y - 0.018}
            x2={x + 0.018}
            y2={y + 0.018}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={x + 0.018}
            y1={y - 0.018}
            x2={x - 0.018}
            y2={y + 0.018}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      );
    }
    return null;
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-slate-950/95 text-white backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={current.name}
      data-testid={editable ? "photo-annotator-modal" : "photo-annotator-readonly"}
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-bold tabular-nums">
            {index + 1} / {files.length}
          </span>
          <span className="truncate text-sm font-medium">{current.name}</span>
          {!editable && currentList.length > 0 && (
            <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
              {tr("Có nét chấm của giáo viên", "Annotated by teacher")} ({currentList.length})
            </span>
          )}
        </div>

        {/* Drawing tools when editable */}
        {editable && (
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "pen", icon: Pen, label: tr("Bút vẽ", "Pen"), testId: "annotator-tool-pen" },
                { id: "check", icon: Check, label: tr("Đúng ✓", "Check ✓"), testId: "annotator-tool-check" },
                { id: "cross", icon: X, label: tr("Sai ✗", "Cross ✗"), testId: "annotator-tool-cross" },
                { id: "rect", icon: Square, label: tr("Khung", "Box"), testId: "annotator-tool-rect" },
                { id: "circle", icon: Circle, label: tr("Khoanh tròn", "Circle"), testId: "annotator-tool-circle" },
                { id: "text", icon: Type, label: tr("Ghi chú", "Text"), testId: "annotator-tool-text" },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTool(t.id)}
                  title={t.label}
                  data-testid={t.testId}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                    tool === t.id
                      ? "bg-[#4F46E5] text-white"
                      : "bg-white/10 text-slate-200 hover:bg-white/20"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden md:inline">{t.label}</span>
                </button>
              );
            })}

            <div className="mx-1 flex items-center gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  className={cn(
                    "h-6 w-6 rounded-full border-2 transition",
                    color === c ? "border-white scale-110" : "border-white/30"
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            <button
              type="button"
              disabled={currentList.length === 0}
              onClick={() => updateCurrentList((prev) => prev.slice(0, -1))}
              title={tr("Hoàn tác nét cuối", "Undo last mark")}
              data-testid="annotator-undo-btn"
              className="rounded-lg bg-white/10 p-2 hover:bg-white/20 disabled:opacity-30"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={currentList.length === 0}
              onClick={() => updateCurrentList(() => [])}
              title={tr("Xoá hết nét trên ảnh này", "Clear annotations on this photo")}
              data-testid="annotator-clear-btn"
              className="rounded-lg bg-white/10 p-2 hover:bg-white/20 disabled:opacity-30"
            >
              <Eraser className="h-4 w-4" />
            </button>
            {onSave && (
              <Button
                type="button"
                size="sm"
                variant="accent"
                disabled={saving}
                onClick={() => void handleSaveAll()}
                data-testid="annotator-save-btn"
                className="h-8"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? tr("Đang lưu…", "Saving…") : tr("Lưu nét chấm", "Save marks")}
              </Button>
            )}
          </div>
        )}

        {/* Zoom + Close */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            title={tr("Thu nhỏ", "Zoom out")}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[44px] text-center text-xs font-bold tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))}
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            title={tr("Phóng to", "Zoom in")}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            title={tr("Về 100%", "Reset zoom")}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            title={tr("Mở tab mới", "Open in new tab")}
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-red-500/80 p-2 hover:bg-red-500"
            title={tr("Đóng", "Close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Annotation Stage */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto p-4">
        {files.length > 1 && (
          <button
            type="button"
            disabled={index === 0}
            onClick={() => {
              setIndex((i) => Math.max(0, i - 1));
              setPendingText(null);
            }}
            className="fixed left-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/60 p-2.5 text-white hover:bg-black/80 disabled:opacity-30"
            aria-label={tr("Ảnh trước", "Previous photo")}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        <div
          ref={stageRef}
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
          className="relative inline-block max-w-[92vw] transition-transform duration-150 select-none"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={current.name}
            draggable={false}
            className="block max-h-[78vh] max-w-[90vw] object-contain select-none"
          />

          <svg
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            data-testid="annotator-svg-layer"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={cn(
              "absolute inset-0 h-full w-full touch-none",
              editable ? "cursor-crosshair" : "pointer-events-none"
            )}
          >
            {renderList.map(renderSvgItem)}
          </svg>

          {renderList
            .filter((i) => i.type === "text" && i.text && i.x !== undefined && i.y !== undefined)
            .map((item) => (
              <div
                key={item.id}
                style={{
                  left: `${(item.x ?? 0) * 100}%`,
                  top: `${(item.y ?? 0) * 100}%`,
                  color: item.color,
                  borderColor: item.color,
                }}
                className="pointer-events-none absolute max-w-[200px] -translate-y-1/2 rounded-md border bg-white/95 px-2 py-0.5 text-xs font-bold shadow-sm"
              >
                {item.text}
              </div>
            ))}

          {editable && pendingText && (
            <div
              style={{ left: `${pendingText.x * 100}%`, top: `${pendingText.y * 100}%` }}
              className="absolute z-30 flex -translate-y-1/2 items-center gap-1 rounded-xl border border-indigo-300 bg-white p-1.5 text-[#0B1C30] shadow-xl"
            >
              <input
                autoFocus
                type="text"
                value={pendingText.value}
                onChange={(e) =>
                  setPendingText((p) => (p ? { ...p, value: e.target.value } : null))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitTextNote();
                  if (e.key === "Escape") setPendingText(null);
                }}
                placeholder={tr("Nhập ghi chú…", "Type note…")}
                className="h-7 w-40 rounded border border-slate-200 px-2 text-xs outline-none focus:border-[#4F46E5]"
              />
              <Button type="button" size="sm" onClick={commitTextNote} className="h-7 px-2 text-xs">
                OK
              </Button>
              <button
                type="button"
                onClick={() => setPendingText(null)}
                className="p-1 text-slate-400 hover:text-red-500"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {files.length > 1 && (
          <button
            type="button"
            disabled={index === files.length - 1}
            onClick={() => {
              setIndex((i) => Math.min(files.length - 1, i + 1));
              setPendingText(null);
            }}
            className="fixed right-3 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/60 p-2.5 text-white hover:bg-black/80 disabled:opacity-30"
            aria-label={tr("Ảnh tiếp", "Next photo")}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
