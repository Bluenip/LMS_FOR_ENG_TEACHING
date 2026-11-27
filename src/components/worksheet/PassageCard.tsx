"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import type { WorksheetPassageDTO } from "./types";
import { MathText } from "./MathText";
import { useI18n } from "@/lib/i18n/client";

export function PassageCard({
  passage,
  defaultOpen = true,
}: {
  passage: WorksheetPassageDTO;
  defaultOpen?: boolean;
}) {
  const { tr } = useI18n();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      data-passage-id={passage.id}
      className="rounded-2xl border border-indigo-100 bg-[#F8F9FF] overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition hover:bg-[#EFF4FF]"
      >
        <span className="inline-flex items-center gap-2 text-xs font-bold text-[#3525CD]">
          <BookOpen className="h-3.5 w-3.5 shrink-0" />
          <span>{passage.title || tr("Đoạn đọc / Ngữ liệu dùng chung", "Shared reading passage")}</span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-[#464555]" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-[#464555]" />
        )}
      </button>
      {open && passage.content && (
        <div data-highlightable className="border-t border-indigo-100 bg-white px-4 py-3 text-sm leading-relaxed text-[#0B1C30]">
          <MathText text={passage.content} />
        </div>
      )}
    </div>
  );
}
