"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Camera, CameraOff, ImageUp, Loader2, RotateCcw, Save } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { readBubbles, summarizeReadings, type BubbleGroupReading } from "@/lib/omr/bubble-reader";
import { gradeOmrAnswers, pickVariantKey } from "@/lib/omr/grader";
import {
  OmrWarpError,
  findFiducials,
  grayToRgba,
  toGrayscale,
  warpToCanonical,
  type GrayImage,
  type RgbaImage,
} from "@/lib/omr/perspective-warp";
import { Button } from "@/components/ui/button";
import { OmrLegend, OmrScanOverlay } from "./OmrScanOverlay";
import type { OmrSheetDetailDTO } from "./types";

const MAX_PROCESS_SIDE = 2000;
const SELECT_CLASS =
  "h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm";

function drawToImageData(source: CanvasImageSource, w: number, h: number, maxSide: number): RgbaImage {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0, cw, ch);
  return ctx.getImageData(0, 0, cw, ch);
}

async function grayToJpeg(gray: GrayImage): Promise<Blob> {
  const rgba = grayToRgba(gray);
  const canvas = document.createElement("canvas");
  canvas.width = gray.width;
  canvas.height = gray.height;
  canvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(rgba.data), gray.width, gray.height), 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", 0.85)
  );
}

interface Pending {
  blob: Blob;
  url: string;
  readings: BubbleGroupReading[];
}

export function OmrScanner({ sheetId }: { sheetId: string }) {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery<OmrSheetDetailDTO>({
    queryKey: ["omr-sheet", sheetId],
    queryFn: () => apiFetchJson(`/api/omr/sheets/${sheetId}`),
  });

  const [pending, setPending] = useState<Pending | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [studentOverride, setStudentOverride] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [aligned, setAligned] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const template = data?.sheet.template;

  const processImage = useCallback(
    async (img: RgbaImage) => {
      if (!template) return;
      setProcessing(true);
      try {
        // let the spinner paint before the synchronous image work
        await new Promise((r) => setTimeout(r, 20));
        const { gray } = warpToCanonical(img);
        const read = readBubbles(gray, template);
        const blob = await grayToJpeg(gray);
        setPending((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { blob, url: URL.createObjectURL(blob), readings: read.readings };
        });
        setStudentOverride("");
      } catch (e) {
        if (e instanceof OmrWarpError) {
          toast.error(
            tr(
              "Không thấy đủ 4 ô vuông đen ở 4 góc phiếu. Hãy chụp thẳng, đủ sáng và lọt cả 4 góc.",
              "Could not find the 4 black corner squares. Shoot straight, well lit, with all 4 corners visible."
            )
          );
        } else {
          toast.error(tr("Không đọc được ảnh", "Could not read the image"));
        }
      } finally {
        setProcessing(false);
      }
    },
    [template, tr]
  );

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      const img = drawToImageData(bmp, bmp.width, bmp.height, MAX_PROCESS_SIDE);
      bmp.close();
      await processImage(img);
    } catch {
      toast.error(tr("Không đọc được ảnh", "Could not read the image"));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setAligned(false);
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      toast.error(tr("Không mở được camera. Hãy cấp quyền hoặc chọn ảnh từ thư viện.", "Camera unavailable. Allow access or pick a photo."));
    }
  };

  const captureFrame = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const img = drawToImageData(v, v.videoWidth, v.videoHeight, MAX_PROCESS_SIDE);
    stopCamera();
    await processImage(img);
  }, [processImage, stopCamera]);

  // Auto-capture: once the 4 corner squares are found in two consecutive frames.
  useEffect(() => {
    if (!cameraOn || pending) return;
    let hits = 0;
    const timer = setInterval(() => {
      const v = videoRef.current;
      if (!v || !v.videoWidth) return;
      try {
        findFiducials(toGrayscale(drawToImageData(v, v.videoWidth, v.videoHeight, 640)));
        hits++;
        setAligned(true);
        if (hits >= 2) {
          clearInterval(timer);
          void captureFrame();
        }
      } catch {
        hits = 0;
        setAligned(false);
      }
    }, 600);
    return () => clearInterval(timer);
  }, [cameraOn, pending, captureFrame]);

  useEffect(() => stopCamera, [stopCamera]);

  const summary = useMemo(
    () => (pending && template ? summarizeReadings(template, pending.readings) : null),
    [pending, template]
  );
  const grade = useMemo(
    () =>
      summary && data && template
        ? gradeOmrAnswers(template, summary.answers, data.sheet.answerKeyByVariant, data.sheet.pointsConfig)
        : null,
    [summary, data, template]
  );
  const matched = useMemo(() => {
    if (!summary?.answers.sbd || !data) return null;
    return data.roster.find((r) => r.sbd === summary.answers.sbd && r.sbdUnique) ?? null;
  }, [summary, data]);
  const expectedKey = useMemo(
    () => (data && summary ? pickVariantKey(data.sheet.answerKeyByVariant, summary.answers.variantCode)?.key ?? null : null),
    [data, summary]
  );

  const pick = (groupKey: string, value: string | null) => {
    setPending((prev) =>
      prev
        ? {
            ...prev,
            readings: prev.readings.map((r) =>
              r.key === groupKey ? { ...r, value, status: value === null ? "BLANK" : "OK" } : r
            ),
          }
        : prev
    );
  };

  const discard = () => {
    if (pending) URL.revokeObjectURL(pending.url);
    setPending(null);
  };

  const save = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("image", new File([pending.blob], "scan.jpg", { type: "image/jpeg" }));
      fd.append("readings", JSON.stringify(pending.readings));
      let res = await apiFetchJson<{ scan: { id: string; score: number; maxScore: number; studentName: string | null; needsReview: boolean } }>(
        `/api/omr/sheets/${sheetId}/scans`,
        { method: "POST", body: fd }
      );
      if (studentOverride) {
        res = await apiFetchJson(`/api/omr/scans/${res.scan.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ studentId: studentOverride }),
        });
      }
      toast.success(
        `${res.scan.studentName ?? tr("Chưa rõ HS", "Unknown student")}: ${res.scan.score}/${res.scan.maxScore}` +
          (res.scan.needsReview ? ` · ${tr("cần duyệt", "needs review")}` : "")
      );
      discard();
      void qc.invalidateQueries({ queryKey: ["omr-sheet", sheetId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Lưu thất bại", "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </div>
    );
  }

  const reviewCount = summary?.reviewKeys.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4" data-testid="omr-scanner">
      <div>
        <Link href={`/teacher/omr/${sheetId}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          <ArrowLeft className="h-4 w-4" /> {data.sheet.title}
        </Link>
        <h1 className="text-xl font-bold text-[#0B1C30] dark:text-slate-100">{tr("Quét phiếu tô", "Scan answer sheets")}</h1>
        <p className="text-sm text-slate-500">
          {data.scans.length} {tr("phiếu đã quét", "sheets scanned")}
        </p>
      </div>

      {!pending && (
        <div className="stitch-card space-y-3 p-4">
          {cameraOn ? (
            <div className="relative overflow-hidden rounded-xl bg-black">
              <video ref={videoRef} playsInline muted className="block w-full" />
              {/* 4-corner guide */}
              <div className="pointer-events-none absolute inset-[6%]">
                {["left-0 top-0 border-l-4 border-t-4", "right-0 top-0 border-r-4 border-t-4", "bottom-0 right-0 border-b-4 border-r-4", "bottom-0 left-0 border-b-4 border-l-4"].map((c) => (
                  <span key={c} className={cn("absolute h-10 w-10 rounded-sm", c, aligned ? "border-emerald-400" : "border-white/80")} />
                ))}
              </div>
              <p className="absolute inset-x-0 bottom-2 text-center text-sm font-semibold text-white drop-shadow">
                {aligned ? tr("Đã thấy 4 góc — giữ yên…", "Corners found — hold still…") : tr("Đưa 4 ô vuông đen vào 4 góc khung", "Fit the 4 black squares into the corners")}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              {tr("Đặt phiếu trên mặt phẳng, đủ sáng, chụp lọt cả 4 ô vuông đen ở góc.", "Lay the sheet flat in good light with all 4 corner squares visible.")}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {cameraOn ? (
              <>
                <Button variant="outline" className="h-12" onClick={stopCamera}>
                  <CameraOff className="h-4 w-4" /> {tr("Tắt", "Stop")}
                </Button>
                <Button className="h-12" onClick={() => void captureFrame()} disabled={processing}>
                  <Camera className="h-4 w-4" /> {tr("Chụp", "Capture")}
                </Button>
              </>
            ) : (
              <>
                <Button className="h-12" onClick={() => void startCamera()} disabled={processing}>
                  <Camera className="h-4 w-4" /> {tr("Mở camera", "Open camera")}
                </Button>
                <Button variant="outline" className="h-12" onClick={() => fileRef.current?.click()} disabled={processing}>
                  {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
                  {tr("Chọn ảnh", "Pick photo")}
                </Button>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            data-testid="omr-file-input"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </div>
      )}

      {pending && summary && grade && (
        <div className="space-y-3" data-testid="omr-review">
          <div className="stitch-card grid gap-3 p-4 sm:grid-cols-2">
            <div className="space-y-1 text-sm">
              <p>
                SBD: <span className="font-mono font-bold">{summary.answers.sbd ?? "—"}</span>
                {" · "}
                {tr("Mã đề", "Code")}: <span className="font-mono font-bold">{summary.answers.variantCode ?? "—"}</span>
              </p>
              <p data-testid="omr-matched-student">
                {matched ? (
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400">{matched.name}</span>
                ) : (
                  <span className="font-semibold text-amber-600">{tr("Không khớp học sinh nào", "No matching student")}</span>
                )}
              </p>
              <p className="text-2xl font-black text-[#3525CD] dark:text-indigo-300" data-testid="omr-preview-score">
                {grade.score}/{grade.maxScore}
              </p>
              {reviewCount > 0 ? (
                <p className="font-semibold text-amber-600" data-testid="omr-review-count">
                  {tr(`${reviewCount} ô tô mờ / tô 2 ô — chạm vào ô đúng để sửa`, `${reviewCount} faint / double marks — tap the right bubble`)}
                </p>
              ) : (
                <p className="text-emerald-600">{tr("Không có ô cần duyệt", "Nothing to review")}</p>
              )}
            </div>
            <div className="space-y-1">
              <label htmlFor="omr-student" className="text-xs font-semibold text-slate-500">
                {tr("Gán cho học sinh", "Assign to student")}
              </label>
              <select id="omr-student" className={SELECT_CLASS} value={studentOverride} onChange={(e) => setStudentOverride(e.target.value)}>
                <option value="">{matched ? `${tr("Tự động", "Auto")}: ${matched.name}` : tr("— Chọn học sinh —", "— Pick a student —")}</option>
                {data.roster.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.sbd})
                  </option>
                ))}
              </select>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="h-11 flex-1" onClick={discard}>
                  <RotateCcw className="h-4 w-4" /> {tr("Quét lại", "Rescan")}
                </Button>
                <Button className="h-11 flex-1" onClick={() => void save()} disabled={saving} data-testid="omr-save">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {tr("Lưu phiếu", "Save")}
                </Button>
              </div>
            </div>
          </div>
          <OmrLegend tr={tr} />
          <OmrScanOverlay
            imageUrl={pending.url}
            template={data.sheet.template}
            readings={pending.readings}
            perQuestion={grade.perQuestion}
            expected={expectedKey}
            reviewKeys={summary.reviewKeys}
            onPick={pick}
          />
        </div>
      )}
    </div>
  );
}
