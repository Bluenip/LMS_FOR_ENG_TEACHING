"use client";

import { useMemo, useState } from "react";
import { Check, Search, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { foldText } from "@/lib/text-search";

export interface ClassPickerOption {
  id: string;
  name: string;
  _count: { enrollments: number };
}

/**
 * Multi-select for classes that stays usable with 100+ classes:
 * selected classes show as removable chips, the rest sit in a scrollable checklist with
 * an accent-insensitive search and "select all results" / "clear".
 */
/** Up to this many classes are shown as cards; above it the picker adds search and chips. */
const COMPACT_LIMIT = 8;

export function ClassPicker({
  classes,
  value,
  onChange,
  locked,
}: {
  classes: ClassPickerOption[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** editing an existing assignment: the class cannot change */
  locked?: boolean;
}) {
  const { tr } = useI18n();
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(value), [value]);
  const selected = classes.filter((c) => selectedSet.has(c.id));

  const results = useMemo(() => {
    const needle = foldText(query.trim());
    return classes
      .filter((c) => !needle || foldText(c.name).includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name, "vi", { numeric: true }));
  }, [classes, query]);

  const allResultsSelected = results.length > 0 && results.every((c) => selectedSet.has(c.id));

  const toggle = (id: string) =>
    onChange(selectedSet.has(id) ? value.filter((x) => x !== id) : [...value, id]);

  if (locked) {
    return (
      <div className="flex flex-wrap gap-2">
        {selected.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#4F46E5] px-3.5 py-1.5 text-xs font-semibold text-white"
          >
            <Check className="h-3.5 w-3.5" />
            {c.name}
          </span>
        ))}
      </div>
    );
  }

  // Few classes: show them all as tappable cards (search would only add noise)
  if (classes.length <= COMPACT_LIMIT) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[...classes]
            .sort((a, b) => a.name.localeCompare(b.name, "vi", { numeric: true }))
            .map((c) => {
              const active = selectedSet.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left transition",
                    active
                      ? "border-[#4F46E5] bg-[#EEF2FF] ring-1 ring-[#4F46E5]"
                      : "border-slate-200 bg-white hover:border-indigo-300"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                      active ? "border-[#4F46E5] bg-[#4F46E5] text-white" : "border-slate-300 bg-white"
                    )}
                  >
                    {active && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#0B1C30]">{c.name}</span>
                    <span className="flex items-center gap-1 text-[11px] text-[#464555]">
                      <Users className="h-3 w-3" />
                      {tr(`${c._count.enrollments} học sinh`, `${c._count.enrollments} students`)}
                    </span>
                  </span>
                </button>
              );
            })}
        </div>
        {classes.length === 0 ? (
          <p className="text-sm text-[#464555]">{tr("Bạn chưa có lớp nào đang hoạt động.", "You have no active classes.")}</p>
        ) : classes.length > 1 ? (
          <button
            type="button"
            onClick={() => onChange(value.length === classes.length ? [] : classes.map((c) => c.id))}
            className="inline-flex min-h-9 items-center rounded-lg px-2 text-xs font-semibold text-[#3525CD] hover:bg-[#EFF4FF]"
          >
            {value.length === classes.length ? tr("Bỏ chọn tất cả", "Unselect all") : tr("Chọn tất cả", "Select all")}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label={tr("Lớp đã chọn", "Selected classes")}>
          {selected.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              className="inline-flex min-h-8 items-center gap-1 rounded-full bg-[#4F46E5] py-1 pl-3 pr-2 text-xs font-semibold text-white transition hover:bg-[#4338CA]"
              title={tr("Bỏ chọn", "Remove")}
            >
              {c.name}
              <X className="h-3.5 w-3.5 opacity-80" />
            </button>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-2.5 sm:flex-row sm:items-center">
          <label className="relative block flex-1">
            <span className="sr-only">{tr("Tìm lớp", "Search classes")}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr(`Tìm trong ${classes.length} lớp…`, `Search ${classes.length} classes…`)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-[#F8F9FF] pl-9 pr-3 text-base text-[#0B1C30] outline-none focus:border-[#4F46E5] sm:text-sm"
            />
          </label>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={results.length === 0}
              onClick={() =>
                onChange(
                  allResultsSelected
                    ? value.filter((id) => !results.some((c) => c.id === id))
                    : [...new Set([...value, ...results.map((c) => c.id)])]
                )
              }
              className="inline-flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-lg border border-slate-200 px-3 text-xs font-semibold text-[#3525CD] hover:bg-[#EFF4FF] disabled:opacity-50 sm:flex-none"
            >
              {allResultsSelected
                ? tr("Bỏ chọn kết quả", "Unselect results")
                : query.trim()
                  ? tr(`Chọn ${results.length} kết quả`, `Select ${results.length} results`)
                  : tr("Chọn tất cả", "Select all")}
            </button>
            {value.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-lg px-3 text-xs font-semibold text-[#464555] hover:bg-slate-100"
              >
                {tr("Bỏ hết", "Clear")}
              </button>
            )}
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto overscroll-contain p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-[#464555]">
              {classes.length === 0
                ? tr("Bạn chưa có lớp nào đang hoạt động.", "You have no active classes.")
                : tr("Không tìm thấy lớp nào.", "No classes found.")}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {results.map((c) => {
                const active = selectedSet.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    onClick={() => toggle(c.id)}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition",
                      active ? "border-[#4F46E5] bg-[#EEF2FF]" : "border-transparent hover:bg-[#F8F9FF]"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                        active ? "border-[#4F46E5] bg-[#4F46E5] text-white" : "border-slate-300 bg-white"
                      )}
                    >
                      {active && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#0B1C30]">{c.name}</span>
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[#464555]">
                      <Users className="h-3 w-3" />
                      {c._count.enrollments}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
