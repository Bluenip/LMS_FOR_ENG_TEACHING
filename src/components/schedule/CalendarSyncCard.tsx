"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarSync, Copy, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** "Sync to Google / Apple Calendar": personal secret .ics URL, shown once after (re)creating it. */
export function CalendarSyncCard() {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery<{ hasToken: boolean; rotatedAt: string | null }>({
    queryKey: ["calendar-token"],
    queryFn: () => apiFetchJson("/api/account/calendar-token"),
  });
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const res = await apiFetchJson<{ url: string }>("/api/account/calendar-token", { method: "POST" });
      setUrl(res.url);
      await qc.invalidateQueries({ queryKey: ["calendar-token"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setBusy(false);
    }
  };
  const revoke = async () => {
    await apiFetchJson("/api/account/calendar-token", { method: "DELETE" }).catch(() => undefined);
    setUrl(null);
    await qc.invalidateQueries({ queryKey: ["calendar-token"] });
    toast.success(tr("Đã thu hồi liên kết lịch", "Calendar link revoked"));
  };

  return (
    <div className="stitch-card space-y-3 p-4" data-testid="calendar-sync-card">
      <h3 className="flex items-center gap-2 text-sm font-bold text-[#0B1C30] dark:text-slate-100">
        <CalendarSync className="h-4 w-4 text-[#4F46E5]" /> {tr("Đồng bộ lịch Google / Apple Calendar (.ics)", "Sync to Google / Apple Calendar (.ics)")}
      </h3>
      <p className="text-xs text-slate-500">
        {tr(
          "Dán liên kết vào Google Calendar (Thêm lịch → Từ URL) hoặc Apple Calendar (Đăng ký lịch). Liên kết là bí mật: ai có nó sẽ xem được lịch học của bạn.",
          "Paste the link into Google Calendar (Add calendar → From URL) or Apple Calendar (New subscription). Keep it secret: anyone with it can see your schedule."
        )}
      </p>
      {url ? (
        <div className="flex gap-2">
          <Input readOnly value={url} className="font-mono text-xs" data-testid="calendar-url" onFocus={(e) => e.currentTarget.select()} />
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(url);
              toast.success(tr("Đã sao chép", "Copied"));
            }}
            aria-label={tr("Sao chép", "Copy")}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      ) : data?.hasToken ? (
        <p className="text-xs text-slate-500">{tr("Đã có liên kết đang hoạt động. Tạo lại để xem URL mới (URL cũ sẽ ngừng chạy).", "A link is active. Re-create it to see a new URL (the old one stops working).")}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void create()} disabled={busy} data-testid="calendar-create">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {data?.hasToken ? tr("Tạo lại liên kết", "Re-create link") : tr("Tạo liên kết lịch", "Create calendar link")}
        </Button>
        {data?.hasToken && (
          <Button size="sm" variant="ghost" onClick={() => void revoke()}>
            <Trash2 className="h-4 w-4" /> {tr("Thu hồi", "Revoke")}
          </Button>
        )}
      </div>
    </div>
  );
}
