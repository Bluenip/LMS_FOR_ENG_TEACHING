"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, FileText, Headphones, Search, Users } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { foldText } from "@/lib/text-search";

export interface WorksheetPickerOption {
  id: string;
  title: string;
  updatedAt?: string;
  owner?: { name: string };
  _count: { fields: number; audios?: number; assignments?: number };
}

/**
 * Searchable worksheet chooser: a button showing the current choice that opens a panel with
 * an accent-insensitive search box and two groups (mine / shared), most recently updated first.
 * Scales to hundreds of worksheets, unlike a native <select>.
 */
export function WorksheetPicker({
  mine,
  shared,
  value,
  onChange,
  disabled,
}: {
  mine: WorksheetPickerOption[];
  shared: WorksheetPickerOption[];
  value: string;
  onChange: (ws: WorksheetPickerOption) => void;
  disabled?: boolean;
}) {
  const { tr, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => [...mine, ...shared].find((w) => w.id === value) ?? null,
    [mine, shared, value]
  );

  const groups = useMemo(() => {
    const needle = foldText(query.trim());
    const prep = (rows: WorksheetPickerOption[]) =>
      rows
        .filter((w) => !needle || foldText(`${w.title} ${w.owner?.name ?? ""}`).includes(needle))
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return [
      { key: "mine", label: tr("Phiếu của tôi", "My worksheets"), rows: prep(mine) },
      { key: "shared", label: tr("Giáo viên khác chia sẻ", "Shared by colleagues"), rows: prep(shared) },
    ].filter((g) => g.rows.length > 0);
  }, [mine, shared, query, tr]);

  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDown);
      clearTimeout(t);
    };
  }, [open]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const choose = (w: WorksheetPickerOption) => {
    onChange(w);
    setOpen(false);
    setQuery("");
  };

  let index = -1;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="worksheet-picker"
        className={cn(
          "flex min-h-14 w-full items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left transition",
          open ? "border-[#4F46E5] ring-2 ring-[#4F46E5]/15" : "border-slate-200 hover:border-indigo-300",
          disabled && "cursor-not-allowed opacity-70"
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EEF2FF] text-[#4F46E5]">
          <FileText className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="block truncate text-sm font-semibold text-[#0B1C30]">{selected.title}</span>
              <span className="block truncate text-xs text-[#464555]">
                {selected._count.fields} {tr("câu hỏi", selected._count.fields === 1 ? "question" : "questions")}
                {(selected._count.audios ?? 0) > 0 && ` · ${selected._count.audios} ${tr("file nghe", "audio")}`}
                {selected.owner?.name && ` · ${selected.owner.name}`}
              </span>
            </>
          ) : (
            <span className="text-sm text-[#464555]">{tr("Chọn phiếu bài tập…", "Choose a worksheet…")}</span>
          )}
        </span>
        {!disabled && <ChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition", open && "rotate-180")} />}
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-indigo-950/10">
          <div className="border-b border-slate-100 p-2.5">
            <label className="relative block">
              <span className="sr-only">{tr("Tìm phiếu", "Search worksheets")}</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setCursor((c) => Math.min(flat.length - 1, c + 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setCursor((c) => Math.max(0, c - 1));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    const w = flat[cursor];
                    if (w) choose(w);
                  } else if (e.key === "Escape") {
                    setOpen(false);
                  }
                }}
                placeholder={tr("Gõ tên phiếu (không cần dấu)…", "Type a worksheet title…")}
                className="h-10 w-full rounded-lg border border-slate-200 bg-[#F8F9FF] pl-9 pr-3 text-base text-[#0B1C30] outline-none focus:border-[#4F46E5] sm:text-sm"
              />
            </label>
          </div>
          <div ref={listRef} role="listbox" className="max-h-80 overflow-y-auto overscroll-contain p-1.5">
            {flat.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-[#464555]">
                {tr("Không tìm thấy phiếu nào.", "No worksheets found.")}
              </p>
            ) : (
              groups.map((g) => (
                <div key={g.key} className="py-1">
                  <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-[#464555]">
                    {g.key === "shared" && <Users className="h-3 w-3" />}
                    {g.label} ({g.rows.length})
                  </p>
                  {g.rows.map((w) => {
                    index += 1;
                    const i = index;
                    const active = w.id === value;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        data-index={i}
                        onMouseEnter={() => setCursor(i)}
                        onClick={() => choose(w)}
                        className={cn(
                          "flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left",
                          i === cursor ? "bg-[#EFF4FF]" : "hover:bg-[#F8F9FF]"
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[#0B1C30]">{w.title}</span>
                          <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-[#464555]">
                            <span>
                              {w._count.fields} {tr("câu", w._count.fields === 1 ? "question" : "questions")}
                            </span>
                            {(w._count.audios ?? 0) > 0 && (
                              <span className="inline-flex items-center gap-0.5">
                                <Headphones className="h-3 w-3" /> {w._count.audios}
                              </span>
                            )}
                            {w.owner?.name && <span>{w.owner.name}</span>}
                            {w.updatedAt && (
                              <span>
                                {tr("Sửa", "Updated")} {formatDateTime(w.updatedAt, locale)}
                              </span>
                            )}
                          </span>
                        </span>
                        {active && <Check className="h-4 w-4 shrink-0 text-[#4F46E5]" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
