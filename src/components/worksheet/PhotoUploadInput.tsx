"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, FileText, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import {
  isPhotoUploadAnswer,
  type AnswerValue,
  type PhotoAnnotationMap,
  type PhotoUploadAnswerValue,
  type UploadedAnswerFile,
} from "@/lib/grading/types";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { PhotoAnnotatorModal } from "./PhotoAnnotatorModal";

interface PhotoUploadInputProps {
  submissionId?: string | null;
  fieldId: string;
  value: AnswerValue;
  onChange?: (next: PhotoUploadAnswerValue) => void;
  disabled?: boolean;
  maxFiles?: number;
  previewOnly?: boolean;
  compact?: boolean;
  annotations?: PhotoAnnotationMap | null;
}

/** Downscales large smartphone camera images client-side so uploads stay fast even on 4G. */
async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 850 * 1024) {
    return file;
  }
  try {
    const imgUrl = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = imgUrl;
    });
    const maxEdge = 2000;
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(imgUrl);
      return file;
    }
    ctx.drawImage(img, 0, 0, width, height);
    URL.revokeObjectURL(imgUrl);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.82)
    );
    if (!blob || blob.size >= file.size) return file;
    const outName = file.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
    return new File([blob], outName, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function PhotoUploadInput({
  submissionId,
  fieldId,
  value,
  onChange,
  disabled = false,
  maxFiles = 5,
  previewOnly = false,
  compact = false,
  annotations = null,
}: PhotoUploadInputProps) {
  const { tr } = useI18n();
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const current: PhotoUploadAnswerValue = isPhotoUploadAnswer(value)
    ? value
    : { files: [], ...(typeof value === "string" && value ? { note: value } : {}) };

  const files = current.files;
  const imageFiles = files.filter((f) => f.mimeType !== "application/pdf");

  const handleUploadFiles = async (selected: FileList | null) => {
    if (!selected || selected.length === 0) return;
    if (previewOnly || !submissionId) {
      toast.info(
        tr(
          "Đang ở chế độ xem trước — học sinh sẽ chụp/tải ảnh lên tại đây khi làm bài.",
          "Preview mode — students upload photos/PDFs here when taking the assignment."
        )
      );
      return;
    }

    const remaining = Math.max(0, maxFiles - files.length);
    if (remaining === 0) {
      toast.error(tr(`Tối đa ${maxFiles} ảnh / file cho câu này.`, `Maximum ${maxFiles} files allowed.`));
      return;
    }

    const batch = Array.from(selected).slice(0, remaining);
    setUploading(true);
    let nextFiles = [...files];
    try {
      for (const rawFile of batch) {
        const prepared = await compressImageIfNeeded(rawFile);
        const fd = new FormData();
        fd.append("file", prepared);
        fd.append("fieldId", fieldId);
        const res = await fetch(`/api/submissions/${submissionId}/files`, {
          method: "POST",
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? tr("Tải file thất bại", "Upload failed"));
        }
        nextFiles = [...nextFiles, json.file as UploadedAnswerFile];
        onChange?.({ ...current, files: nextFiles });
      }
      toast.success(
        tr(
          `Đã tải lên ${batch.length} file bài làm.`,
          `Uploaded ${batch.length} file(s).`
        )
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lỗi tải file", "Upload error"));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (target: UploadedAnswerFile) => {
    const nextFiles = files.filter((f) => f.key !== target.key);
    onChange?.({ ...current, files: nextFiles });
    if (submissionId && !previewOnly) {
      await fetch(`/api/submissions/${submissionId}/files`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: target.key }),
      }).catch(() => undefined);
    }
  };

  return (
    <div className="space-y-3" data-photo-upload-field-id={fieldId}>
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void handleUploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleUploadFiles(e.target.files);
              e.target.value = "";
            }}
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading || files.length >= maxFiles}
            onClick={() => cameraInputRef.current?.click()}
            data-testid={`photo-camera-btn-${fieldId}`}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5 text-[#4F46E5]" />
            )}
            {tr("Chụp ảnh vở", "Take photo")}
          </Button>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={uploading || files.length >= maxFiles}
            onClick={() => fileInputRef.current?.click()}
            data-testid={`photo-pick-btn-${fieldId}`}
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {tr("Chọn ảnh / PDF", "Choose photos / PDF")}
          </Button>

          <span className="text-[11px] font-medium text-slate-400 tabular-nums">
            {files.length}/{maxFiles} file
          </span>
        </div>
      )}

      {files.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-[#F8F9FF] px-3 py-3 text-xs text-slate-500">
          <ImagePlus className="h-4 w-4 shrink-0 text-[#4F46E5]" />
          <span>
            {previewOnly
              ? tr(
                  "Học sinh sẽ chụp ảnh bài làm trong vở hoặc tải file PDF tại đây (tối đa " + maxFiles + " file).",
                  `Students capture notebook photos or upload PDFs here (up to ${maxFiles} files).`
                )
              : tr(
                  "Chưa có ảnh bài làm nào được tải lên.",
                  "No photos or PDFs uploaded yet."
                )}
          </span>
        </div>
      ) : (
        <div className={compact ? "grid grid-cols-2 gap-2" : "grid grid-cols-2 gap-2.5 sm:grid-cols-3"}>
          {files.map((f) => {
            const isPdf = f.mimeType === "application/pdf";
            const imgIndex = imageFiles.findIndex((x) => x.key === f.key);
            return (
              <div
                key={f.key}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                {isPdf ? (
                  <a
                    href={`/api/files/${f.key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-28 flex-col items-center justify-center gap-1.5 bg-[#EFF4FF] p-2 text-center hover:bg-[#EEF2FF]"
                  >
                    <FileText className="h-7 w-7 text-[#4F46E5]" />
                    <span className="line-clamp-2 text-[11px] font-semibold text-[#0B1C30]">
                      {f.name}
                    </span>
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => imgIndex >= 0 && setLightboxIdx(imgIndex)}
                    className="relative block h-28 w-full overflow-hidden bg-slate-100"
                    title={tr("Nhấn để phóng to / xem nét chấm", "Click to zoom / view annotations")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/files/${f.key}`}
                      alt={f.name}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                    {(annotations?.[f.key]?.length ?? 0) > 0 && (
                      <span
                        data-testid={`photo-annotated-badge-${f.key}`}
                        className="absolute bottom-1.5 left-1.5 rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-bold text-white shadow"
                      >
                        {tr("Có nét chấm", "Annotated")} ({annotations?.[f.key]?.length})
                      </span>
                    )}
                  </button>
                )}

                {!disabled && (
                  <button
                    type="button"
                    onClick={() => void handleRemove(f)}
                    className="absolute right-1.5 top-1.5 rounded-full bg-black/65 p-1 text-white hover:bg-red-600"
                    title={tr("Xoá file này", "Remove file")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!compact && (
        <input
          type="text"
          disabled={disabled}
          value={current.note ?? ""}
          onChange={(e) => onChange?.({ ...current, note: e.target.value })}
          placeholder={tr("Ghi chú ngắn cho giáo viên (tuỳ chọn)…", "Optional short note for teacher…")}
          className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#4F46E5]"
        />
      )}

      {imageFiles.length > 0 && (
        <PhotoAnnotatorModal
          files={imageFiles}
          initialIndex={lightboxIdx ?? 0}
          open={lightboxIdx !== null}
          onClose={() => setLightboxIdx(null)}
          editable={false}
          annotations={annotations}
        />
      )}
    </div>
  );
}
