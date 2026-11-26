"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { UploadedAnswerFile } from "@/lib/grading/types";
import { useI18n } from "@/lib/i18n/client";

interface PhotoLightboxModalProps {
  files: UploadedAnswerFile[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

export function PhotoLightboxModal({
  files,
  initialIndex,
  open,
  onClose,
}: PhotoLightboxModalProps) {
  const { tr } = useI18n();
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (open) {
      setIndex(Math.max(0, Math.min(files.length - 1, initialIndex)));
      setZoom(1);
      setRotation(0);
    }
  }, [open, initialIndex, files.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && index > 0) {
        setIndex((i) => i - 1);
        setZoom(1);
        setRotation(0);
      } else if (e.key === "ArrowRight" && index < files.length - 1) {
        setIndex((i) => i + 1);
        setZoom(1);
        setRotation(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, files.length, onClose]);

  if (!open || files.length === 0) return null;
  const current = files[index] ?? files[0]!;
  const src = `/api/files/${current.key}`;

  return (
    <div
      className="fixed inset-0 z-[70] pointer-events-auto flex flex-col bg-slate-950/90 backdrop-blur-sm text-white"
      role="dialog"
      aria-modal="true"
      aria-label={current.name}
      data-testid="photo-lightbox-modal"
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="rounded-md bg-white/15 px-2 py-0.5 text-xs font-bold tabular-nums">
            {index + 1} / {files.length}
          </span>
          <span className="truncate text-sm font-medium">{current.name}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            title={tr("Thu nhỏ", "Zoom out")}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[46px] text-center text-xs font-bold tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))}
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            title={tr("Phóng to", "Zoom in")}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => (r - 90) % 360)}
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            title={tr("Xoay trái 90°", "Rotate left 90°")}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="rounded-lg bg-white/10 p-2 hover:bg-white/20"
            title={tr("Xoay phải 90°", "Rotate right 90°")}
          >
            <RotateCw className="h-4 w-4" />
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
            title={tr("Đóng (Esc)", "Close (Esc)")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main Stage */}
      <div className="relative flex flex-1 items-center justify-center overflow-auto p-4">
        {files.length > 1 && (
          <button
            type="button"
            disabled={index === 0}
            onClick={() => {
              setIndex((i) => Math.max(0, i - 1));
              setZoom(1);
              setRotation(0);
            }}
            className="absolute left-3 z-10 rounded-full bg-black/50 p-2.5 text-white hover:bg-black/80 disabled:opacity-30"
            aria-label={tr("Ảnh trước", "Previous photo")}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={current.name}
          style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
          className="max-h-[80vh] max-w-[90vw] object-contain transition-transform duration-150 select-none"
        />

        {files.length > 1 && (
          <button
            type="button"
            disabled={index === files.length - 1}
            onClick={() => {
              setIndex((i) => Math.min(files.length - 1, i + 1));
              setZoom(1);
              setRotation(0);
            }}
            className="absolute right-3 z-10 rounded-full bg-black/50 p-2.5 text-white hover:bg-black/80 disabled:opacity-30"
            aria-label={tr("Ảnh tiếp", "Next photo")}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}
