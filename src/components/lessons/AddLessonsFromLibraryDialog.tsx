"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Search } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { foldText } from "@/lib/text-search";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { LibraryLesson } from "./types";

/** Class page: pick lessons from the teacher's library to show in this class. */
export function AddLessonsFromLibraryDialog({
  open,
  onOpenChange,
  classId,
  existingLessonIds,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  existingLessonIds: string[];
  onAdded: () => Promise<void> | void;
}) {
  const { tr } = useI18n();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["lesson-library"],
    enabled: open,
    queryFn: () =>
      apiFetchJson<{ lessons: LibraryLesson[] }>(
        "/api/lessons",
        undefined,
        tr("Không tải được kho bài giảng", "Could not load the lesson library")
      ),
  });

  const available = useMemo(() => {
    const existing = new Set(existingLessonIds);
    const needle = foldText(query.trim());
    return (data?.lessons ?? [])
      .filter((l) => !existing.has(l.id))
      .filter((l) => !needle || foldText(`${l.title} ${l.description ?? ""}`).includes(needle));
  }, [data, existingLessonIds, query]);

  const close = (next: boolean) => {
    if (!next) {
      setPicked([]);
      setQuery("");
    }
    onOpenChange(next);
  };

  const submit = async () => {
    if (picked.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/classes/${classId}/lessons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonIds: picked }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Không thêm được bài giảng", "Could not add lessons"));
      toast.success(tr(`Đã thêm ${json.added} bài giảng vào lớp.`, `Added ${json.added} lesson(s) to the class.`));
      await queryClient.invalidateQueries({ queryKey: ["lesson-library"] });
      await onAdded();
      close(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Có lỗi xảy ra", "Something went wrong"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tr("Thêm bài giảng từ kho", "Add lessons from the library")}</DialogTitle>
        </DialogHeader>
        <label className="relative block">
          <span className="sr-only">{tr("Tìm bài giảng", "Search lessons")}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Tìm theo tên chương…", "Search by chapter title…")}
            className="h-10 w-full rounded-lg border border-slate-200 bg-[#F8F9FF] pl-9 pr-3 text-base text-[#0B1C30] outline-none focus:border-[#4F46E5] sm:text-sm"
          />
        </label>
        <div className="max-h-80 space-y-1 overflow-y-auto overscroll-contain">
          {isLoading ? (
            <p className="py-6 text-center text-sm text-[#464555]">{tr("Đang tải…", "Loading…")}</p>
          ) : available.length === 0 ? (
            <div className="space-y-2 py-6 text-center text-sm text-[#464555]">
              <p>
                {(data?.lessons.length ?? 0) === 0
                  ? tr("Kho bài giảng của bạn đang trống.", "Your lesson library is empty.")
                  : tr("Không còn bài giảng nào để thêm.", "No more lessons to add.")}
              </p>
              <Link href="/teacher/worksheets?tab=lessons" className="font-semibold text-[#3525CD] hover:underline">
                {tr("Mở kho bài giảng", "Open the lesson library")}
              </Link>
            </div>
          ) : (
            available.map((l) => {
              const active = picked.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  role="checkbox"
                  aria-checked={active}
                  onClick={() =>
                    setPicked((prev) => (active ? prev.filter((x) => x !== l.id) : [...prev, l.id]))
                  }
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition",
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
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[#0B1C30]">{l.title}</span>
                    <span className="block truncate text-[11px] text-[#464555]">
                      {tr(`${l.items.length} tài liệu`, `${l.items.length} material(s)`)} ·{" "}
                      {l.classLinks.length > 0
                        ? tr(`đang dùng ở ${l.classLinks.length} lớp`, `used in ${l.classLinks.length} class(es)`)
                        : tr("chưa giao lớp nào", "not in any class")}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            {tr("Huỷ", "Cancel")}
          </Button>
          <Button onClick={submit} disabled={picked.length === 0 || saving}>
            {saving
              ? tr("Đang thêm…", "Adding…")
              : tr(`Thêm ${picked.length} bài giảng`, `Add ${picked.length} lesson(s)`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
