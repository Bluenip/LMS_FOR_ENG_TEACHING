"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Input } from "@/components/ui/input";


const selectClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0B1C30] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30";

/**
 * Search box + class / month / sort controls for the teacher assignment list.
 * State lives in the URL (?q=&class=&month=&sort=) so the server page does the filtering.
 */
export function AssignmentListFilters({
  classes,
  months,
  shown,
  total,
}: {
  classes: Array<{ id: string; name: string }>;
  /** "YYYY-MM" values that have at least one assignment (newest first). */
  months: string[];
  shown: number;
  total: number;
}) {
  const { tr, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");
  const first = useRef(true);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  // debounce typing in the search box
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => update("q", q.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the typed text changes
  }, [q]);

  const monthLabel = (ym: string) => {
    const [y, mo] = ym.split("-");
    return locale === "en"
      ? new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : `Tháng ${Number(mo)}/${y}`;
  };

  const hasFilters = Boolean(params.get("q") || params.get("class") || params.get("month") || params.get("sort"));

  return (
    <div className="stitch-card space-y-3 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
        <label className="relative block">
          <span className="sr-only">{tr("Tìm bài tập", "Search assignments")}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr("Tìm theo tên bài, lớp, phiếu…", "Search by title, class, worksheet…")}
            className="h-10 pl-9"
          />
        </label>
        <select
          aria-label={tr("Lọc theo lớp", "Filter by class")}
          className={selectClass}
          value={params.get("class") ?? ""}
          onChange={(e) => update("class", e.target.value)}
        >
          <option value="">{tr("Tất cả lớp", "All classes")}</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label={tr("Lọc theo tháng giao", "Filter by month assigned")}
          className={selectClass}
          value={params.get("month") ?? ""}
          onChange={(e) => update("month", e.target.value)}
        >
          <option value="">{tr("Mọi thời gian", "Any time")}</option>
          {months.map((ym) => (
            <option key={ym} value={ym}>
              {monthLabel(ym)}
            </option>
          ))}
        </select>
        <select
          aria-label={tr("Sắp xếp", "Sort")}
          className={selectClass}
          value={params.get("sort") ?? "newest"}
          onChange={(e) => update("sort", e.target.value === "newest" ? "" : e.target.value)}
        >
          <option value="newest">{tr("Mới giao nhất", "Newest first")}</option>
          <option value="oldest">{tr("Cũ nhất", "Oldest first")}</option>
          <option value="due_asc">{tr("Hạn nộp gần nhất", "Due soonest")}</option>
          <option value="due_desc">{tr("Hạn nộp xa nhất", "Due latest")}</option>
          <option value="class">{tr("Theo lớp (A→Z)", "By class (A→Z)")}</option>
          <option value="title">{tr("Theo tên bài (A→Z)", "By title (A→Z)")}</option>
        </select>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#464555]">
        <span aria-live="polite">
          {pending
            ? tr("Đang lọc…", "Filtering…")
            : tr(`Hiển thị ${shown}/${total} bài tập`, `Showing ${shown} of ${total} assignments`)}
        </span>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setQ("");
              const next = new URLSearchParams();
              const teacher = params.get("teacher");
              if (teacher) next.set("teacher", teacher);
              const qs = next.toString();
              startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
            }}
            className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 font-semibold text-[#3525CD] hover:bg-[#EFF4FF]"
          >
            <X className="h-3.5 w-3.5" />
            {tr("Xoá bộ lọc", "Clear filters")}
          </button>
        )}
      </div>
    </div>
  );
}
