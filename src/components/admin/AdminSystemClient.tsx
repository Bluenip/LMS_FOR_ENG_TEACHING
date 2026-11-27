"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HardDrive, Loader2, Megaphone, Server } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Health {
  disk: { totalBytes: number; freeBytes: number; usedPct: number } | null;
  database: { bytes: number | null; largestTables: Array<{ table: string; bytes: number }> };
  lastBackupAt: string | null;
  counts: { users: number; classes: number; submissions: number };
  node: { version: string; uptimeSec: number; rssBytes: number };
}

const mb = (b: number | null | undefined) => (b === null || b === undefined ? "—" : b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${(b / 1e6).toFixed(1)} MB`);

/** /admin/system — resources, database size, backups, system banner and maintenance switch. */
export function AdminSystemClient() {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const { data: health } = useQuery<Health>({ queryKey: ["system-health"], queryFn: () => apiFetchJson("/api/admin/system-health"), refetchInterval: 60_000 });
  const { data: bannerData } = useQuery<{ banner: { message: string; level: string; maintenanceMode: boolean; active: boolean } | null }>({
    queryKey: ["admin-banner"],
    queryFn: () => apiFetchJson("/api/admin/banner"),
  });
  const [message, setMessage] = useState("");
  const [level, setLevel] = useState("INFO");
  const [active, setActive] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const b = bannerData?.banner;
    if (b) {
      setMessage(b.message);
      setLevel(b.level);
      setActive(b.active);
      setMaintenance(b.maintenanceMode);
    }
  }, [bannerData]);

  const save = async () => {
    setSaving(true);
    try {
      await apiFetchJson("/api/admin/banner", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, level, active, maintenanceMode: maintenance }),
      });
      toast.success(tr("Đã lưu thông báo hệ thống", "System banner saved"));
      await qc.invalidateQueries({ queryKey: ["admin-banner"] });
      await qc.invalidateQueries({ queryKey: ["system-banner"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="admin-system">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-[#0B1C30] dark:text-slate-100">
        <Server className="h-6 w-6 text-[#4F46E5]" /> {tr("Hệ thống", "System")}
      </h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stitch-card p-4">
          <p className="flex items-center gap-1.5 text-xs text-slate-500"><HardDrive className="h-4 w-4" /> {tr("Ổ đĩa", "Disk")}</p>
          <p className="text-2xl font-bold">{health?.disk ? `${health.disk.usedPct}%` : "—"}</p>
          <p className="text-xs text-slate-500">{tr("Còn trống", "Free")} {mb(health?.disk?.freeBytes)}</p>
        </div>
        <div className="stitch-card p-4">
          <p className="text-xs text-slate-500">{tr("Cơ sở dữ liệu", "Database")}</p>
          <p className="text-2xl font-bold">{mb(health?.database.bytes)}</p>
        </div>
        <div className="stitch-card p-4">
          <p className="text-xs text-slate-500">{tr("Sao lưu gần nhất", "Last backup")}</p>
          <p className="text-sm font-semibold">{health?.lastBackupAt ? formatDateTime(health.lastBackupAt) : tr("Chưa có", "None")}</p>
        </div>
        <div className="stitch-card p-4">
          <p className="text-xs text-slate-500">Node {health?.node.version}</p>
          <p className="text-sm font-semibold">RAM {mb(health?.node.rssBytes)}</p>
          <p className="text-xs text-slate-500">
            {health?.counts.users} {tr("người dùng", "users")} · {health?.counts.classes} {tr("lớp", "classes")}
          </p>
        </div>
      </div>
      {health && health.database.largestTables.length > 0 && (
        <div className="stitch-card p-4">
          <p className="mb-2 text-sm font-semibold">{tr("Bảng lớn nhất", "Largest tables")}</p>
          <ul className="grid gap-1 text-xs sm:grid-cols-2">
            {health.database.largestTables.map((t) => (
              <li key={t.table} className="flex justify-between rounded bg-slate-50 px-2 py-1 dark:bg-slate-800">
                <span className="font-mono">{t.table}</span>
                <span>{mb(t.bytes)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="stitch-card space-y-3 p-4">
        <p className="flex items-center gap-2 text-sm font-bold"><Megaphone className="h-4 w-4 text-[#F97316]" /> {tr("Thông báo hệ thống & bảo trì", "System banner & maintenance")}</p>
        <Textarea rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={tr("Ví dụ: Hệ thống bảo trì 22:00–22:30", "e.g. Maintenance 22:00–22:30")} data-testid="banner-message" />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <select value={level} onChange={(e) => setLevel(e.target.value)} className="h-10 rounded-xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-900" aria-label={tr("Mức độ", "Level")}>
            <option value="INFO">{tr("Thông tin", "Info")}</option>
            <option value="WARNING">{tr("Cảnh báo", "Warning")}</option>
            <option value="CRITICAL">{tr("Khẩn cấp", "Critical")}</option>
          </select>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={active} onChange={(e) => setActive(e.target.checked)} data-testid="banner-active" />
            {tr("Hiển thị cho mọi người", "Show to everyone")}
          </label>
          <label className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
            <input type="checkbox" className="h-4 w-4" checked={maintenance} onChange={(e) => setMaintenance(e.target.checked)} data-testid="banner-maintenance" />
            {tr("Chế độ bảo trì (chặn mọi người trừ Admin)", "Maintenance mode (everyone but admins is blocked)")}
          </label>
        </div>
        <Button onClick={() => void save()} disabled={saving} data-testid="banner-save">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} {tr("Lưu", "Save")}
        </Button>
      </div>
    </div>
  );
}
