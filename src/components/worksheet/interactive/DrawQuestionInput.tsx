"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, PenTool, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  isDrawAnswer,
  type AnswerValue,
  type DrawAnswerValue,
  type DrawOptions,
} from "@/lib/grading/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

interface DrawStroke {
  color: string;
  width: number;
  points: Array<[number, number]>;
}

interface DrawQuestionInputProps {
  fieldId: string;
  submissionId?: string | null;
  options: DrawOptions;
  value: AnswerValue;
  onChange: (val: DrawAnswerValue) => void;
  disabled?: boolean;
}

const COLORS = ["#0B1C30", "#DC2626", "#2563EB", "#059669"];

export function DrawQuestionInput({
  fieldId,
  submissionId,
  options,
  value,
  onChange,
  disabled = false,
}: DrawQuestionInputProps) {
  const { tr } = useI18n();
  const canvasW = typeof options.width === "number" && options.width > 100 ? options.width : 560;
  const canvasH = typeof options.height === "number" && options.height > 100 ? options.height : 300;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<DrawStroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<DrawStroke | null>(null);
  const [color, setColor] = useState<string>("#0B1C30");
  const [eraser, setEraser] = useState(false);
  const [saving, setSaving] = useState(false);

  const saved = isDrawAnswer(value) ? value : null;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvasW, canvasH);

    const drawOne = (st: DrawStroke) => {
      if (st.points.length === 0) return;
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      st.points.forEach(([x, y], idx) => {
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (st.points.length === 1) {
        ctx.lineTo(st.points[0]![0] + 0.5, st.points[0]![1] + 0.5);
      }
      ctx.stroke();
    };

    for (const st of strokes) drawOne(st);
    if (activeStroke) drawOne(activeStroke);
  }, [activeStroke, canvasH, canvasW, strokes]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const toCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return [
      ((e.clientX - rect.left) / rect.width) * canvasW,
      ((e.clientY - rect.top) / rect.height) * canvasH,
    ];
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const pt = toCanvasPoint(e);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setActiveStroke({
      color: eraser ? "#FFFFFF" : color,
      width: eraser ? 14 : 3,
      points: [pt],
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activeStroke || disabled) return;
    const pt = toCanvasPoint(e);
    if (!pt) return;
    setActiveStroke((prev) => (prev ? { ...prev, points: [...prev.points, pt] } : null));
  };

  const handlePointerUp = () => {
    if (!activeStroke) return;
    setStrokes((prev) => [...prev, activeStroke]);
    setActiveStroke(null);
  };

  const handleSaveDrawing = async () => {
    const canvas = canvasRef.current;
    if (!canvas || saving) return;
    if (!submissionId) {
      toast.error(tr("Chưa có phiên làm bài để lưu hình vẽ.", "Start an attempt before saving drawing."));
      return;
    }
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error(tr("Không tạo được ảnh PNG", "Failed to export PNG"));
      const formData = new FormData();
      formData.append("fieldId", fieldId);
      formData.append("file", blob, "drawing.png");
      const res = await fetch(`/api/submissions/${submissionId}/files`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Lưu hình vẽ thất bại", "Drawing upload failed"));
      onChange({ fileKey: json.file.key });
      toast.success(tr("Đã lưu hình vẽ vào bài làm.", "Drawing saved to submission."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lỗi lưu hình vẽ", "Save drawing error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2.5" data-testid={`draw-input-${fieldId}`}>
      {!disabled && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c);
                  setEraser(false);
                }}
                aria-label={`Color ${c}`}
                className={cn(
                  "h-7 w-7 rounded-full border-2 transition",
                  !eraser && color === c ? "border-[#4F46E5] scale-110" : "border-white shadow"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <Button
              type="button"
              size="sm"
              variant={eraser ? "default" : "outline"}
              onClick={() => setEraser((v) => !v)}
              className="h-8 px-2.5 text-xs"
            >
              {eraser ? <PenTool className="h-3.5 w-3.5" /> : <Eraser className="h-3.5 w-3.5" />}
              {eraser ? tr("Bút", "Pen") : tr("Tẩy", "Eraser")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={strokes.length === 0}
              onClick={() => setStrokes((s) => s.slice(0, -1))}
              className="h-8 px-2.5 text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {tr("Hoàn tác", "Undo")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={strokes.length === 0}
              onClick={() => setStrokes([])}
              className="h-8 px-2.5 text-xs"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {tr("Xoá hết", "Clear")}
            </Button>
          </div>

          <Button
            type="button"
            size="sm"
            variant="accent"
            disabled={saving || !submissionId}
            data-testid={`draw-save-${fieldId}`}
            onClick={() => void handleSaveDrawing()}
            className="min-h-[38px]"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? tr("Đang lưu…", "Saving…") : tr("Lưu hình vẽ", "Save drawing")}
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <canvas
          ref={canvasRef}
          width={canvasW}
          height={canvasH}
          data-testid={`draw-canvas-${fieldId}`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="w-full max-w-full touch-none cursor-crosshair block bg-white"
          style={{ aspectRatio: `${canvasW} / ${canvasH}` }}
        />
      </div>

      {saved?.fileKey && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2 text-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/files/${saved.fileKey}`}
            alt={tr("Hình vẽ đã lưu", "Saved drawing")}
            className="h-14 w-24 rounded border border-emerald-200 bg-white object-contain"
          />
          <span className="font-semibold text-emerald-800">
            {tr("Đã lưu hình vẽ thành công.", "Drawing saved.")}
          </span>
        </div>
      )}
    </div>
  );
}
