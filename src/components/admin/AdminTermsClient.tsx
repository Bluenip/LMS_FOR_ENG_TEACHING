"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarRange, Loader2, Plus } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Term {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  isLocked: boolean;
  classCount: number;
}

/** /admin/terms — school terms; classes are attached to a term by id list. */
export function AdminTermsClient() {
  const { tr } = useI18n();
  const qc = useQueryClient();
  const { data } = useQuery<{ terms: Term[] }>({ queryKey: ["terms"], queryFn: () => apiFetchJson("/api/admin/terms") });
  const { data: classes } = useQuery<{ classes: Array<{ id: string; name: string }> }>({ queryKey: ["classes", "admin-terms"], queryFn: () => apiFetchJson("/api/classes") });
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const save = async (body: Record<string, unknown>, method: "POST" | "PATCH") => {
    setBusy(true);
    try {
      await apiFetchJson("/api/admin/terms", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      toast.success(tr("Đã lưu học kỳ", "Term saved"));
      await qc.invalidateQueries({ queryKey: ["terms"] });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Thao tác thất bại", "Action failed"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="admin-terms">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-[#0B1C30] dark:text-slate-100">
        <CalendarRange className="h-6 w-6 text-[#4F46E5]" /> {tr("Học kỳ", "Academic terms")}
      </h1>
      <div className="stitch-card space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="term-name">{tr("Tên học kỳ", "Term name")}</Label>
            <Input id="term-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="2026–2027 · HK1" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="term-start">{tr("Bắt đầu", "Starts")}</Label>
            <Input id="term-start" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="term-end">{tr("Kết thúc", "Ends")}</Label>
            <Input id="term-end" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        {classes && classes.classes.length > 0 && (
          <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
            {classes.classes.map((c) => (
              <label key={c.id} className="flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-2 text-xs dark:border-slate-700">
                <input type="checkbox" className="h-4 w-4" checked={picked.includes(c.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))} />
                {c.name}
              </label>
            ))}
          </div>
        )}
        <Button
          disabled={busy || name.trim().length < 2 || !startsAt || !endsAt}
          onClick={async () => {
            if (await save({ name, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), classIds: picked }, "POST")) {
              setName("");
              setPicked([]);
            }
          }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {tr("Tạo học kỳ", "Create term")}
        </Button>
      </div>
      <ul className="space-y-2">
        {data?.terms.map((t) => (
          <li key={t.id} className="stitch-card flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span>
              <b>{t.name}</b>{" "}
              <span className="text-xs text-slate-500">
                {formatDateTime(t.startsAt)} → {formatDateTime(t.endsAt)} · {t.classCount} {tr("lớp", "classes")}
              </span>
            </span>
            <span className="flex items-center gap-2">
              {t.isActive ? <Badge variant="mint">{tr("Đang dùng", "Active")}</Badge> : <Badge variant="neutral">{tr("Đã đóng", "Closed")}</Badge>}
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void save({ id: t.id, name: t.name, startsAt: t.startsAt, endsAt: t.endsAt, isActive: !t.isActive }, "PATCH")}>
                {t.isActive ? tr("Đóng học kỳ", "Close") : tr("Mở lại", "Reopen")}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
