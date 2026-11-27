"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Battery, Camera, CheckCircle2, Globe, Loader2, Mic, Wifi, XCircle } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";

interface Result {
  pingMs: number | null;
  cameraOk: boolean;
  micOk: boolean;
  batteryPct: number | null;
  browserInfo: string;
}

async function measurePing(): Promise<number | null> {
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    const ok = await fetch(`/api/system/banner?ping=${Date.now()}`, { cache: "no-store" }).then((r) => r.ok).catch(() => false);
    if (ok) samples.push(performance.now() - t);
  }
  return samples.length ? Math.round(samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)]!) : null;
}

async function testMedia(kind: "video" | "audio"): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(kind === "video" ? { video: true } : { audio: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch {
    return false;
  }
}

/** Student self-check before an exam: network ping, camera, microphone, browser, battery. */
export function PreCheckClient({ assignmentId }: { assignmentId: string | null }) {
  const { tr } = useI18n();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [passed, setPassed] = useState<boolean | null>(null);

  const run = async () => {
    setRunning(true);
    try {
      const [pingMs, cameraOk, micOk] = await Promise.all([measurePing(), testMedia("video"), testMedia("audio")]);
      let batteryPct: number | null = null;
      const nav = navigator as Navigator & { getBattery?: () => Promise<{ level: number; charging: boolean }> };
      if (nav.getBattery) {
        const b = await nav.getBattery().catch(() => null);
        if (b && !b.charging) batteryPct = Math.round(b.level * 100);
      }
      const r = { pingMs, cameraOk, micOk, batteryPct, browserInfo: navigator.userAgent.slice(0, 300) };
      setResult(r);
      const saved = await apiFetchJson<{ passed: boolean }>("/api/precheck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...r, assignmentId }),
      });
      setPassed(saved.passed);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Kiểm tra thất bại", "Check failed"));
    } finally {
      setRunning(false);
    }
  };

  const row = (icon: React.ReactNode, label: string, ok: boolean | null, detail?: string) => (
    <li className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm dark:bg-slate-800">
      <span className="flex items-center gap-2">
        {icon} {label}
      </span>
      <span className="flex items-center gap-1.5 text-xs">
        {detail}
        {ok === null ? null : ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-rose-600" />}
      </span>
    </li>
  );

  return (
    <div className="mx-auto max-w-md space-y-4" data-testid="precheck-page">
      <div className="stitch-card space-y-3 p-5">
        <h1 className="text-xl font-bold text-[#0B1C30] dark:text-slate-100">{tr("Kiểm tra thiết bị trước giờ thi", "Pre-exam device check")}</h1>
        <p className="text-sm text-slate-500">
          {tr("Trình duyệt sẽ xin quyền camera và micro để thử. Không có hình ảnh hay âm thanh nào được lưu lại.", "Your browser asks for camera and microphone access to test them. Nothing is recorded.")}
        </p>
        <Button className="h-12 w-full" onClick={() => void run()} disabled={running} data-testid="precheck-run">
          {running && <Loader2 className="h-4 w-4 animate-spin" />} {tr("Bắt đầu kiểm tra", "Run the check")}
        </Button>
      </div>
      {result && (
        <ul className="stitch-card space-y-2 p-4">
          {row(<Wifi className="h-4 w-4" />, tr("Mạng", "Network"), result.pingMs !== null && result.pingMs <= 800, result.pingMs !== null ? `${result.pingMs} ms` : "—")}
          {row(<Camera className="h-4 w-4" />, "Camera", result.cameraOk)}
          {row(<Mic className="h-4 w-4" />, "Micro", result.micOk)}
          {row(<Battery className="h-4 w-4" />, tr("Pin", "Battery"), result.batteryPct === null || result.batteryPct >= 20, result.batteryPct === null ? tr("đang sạc / không rõ", "charging / n/a") : `${result.batteryPct}%`)}
          {row(<Globe className="h-4 w-4" />, tr("Trình duyệt", "Browser"), true, result.browserInfo.split(") ").pop()?.slice(0, 30))}
        </ul>
      )}
      {passed !== null && (
        <p className={`text-center font-semibold ${passed ? "text-emerald-600" : "text-rose-600"}`} data-testid="precheck-verdict">
          {passed ? tr("Thiết bị sẵn sàng!", "Your device is ready!") : tr("Thiết bị chưa đạt yêu cầu của bài thi.", "Your device does not meet the exam requirements.")}
        </p>
      )}
      {assignmentId && (
        <Link href={`/student/assignments/${assignmentId}/rules`} className="block text-center text-sm font-semibold text-[#4F46E5] hover:underline">
          {tr("Quay lại nội quy phòng thi", "Back to exam rules")}
        </Link>
      )}
    </div>
  );
}
