"use client";

import { useState } from "react";
import { Sigma } from "lucide-react";
import { FORMULA_SNIPPET_GROUPS } from "@/lib/worksheet/formula-snippets";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { MathText } from "./MathText";

interface FormulaToolbarProps {
  onInsert: (latexSnippet: string) => void;
  compact?: boolean;
}

export function FormulaToolbar({ onInsert, compact = false }: FormulaToolbarProps) {
  const { locale, tr } = useI18n();
  const [open, setOpen] = useState(false);
  const [activeGroup, setActiveGroup] = useState(FORMULA_SNIPPET_GROUPS[0]!.id);

  const currentGroup =
    FORMULA_SNIPPET_GROUPS.find((g) => g.id === activeGroup) ?? FORMULA_SNIPPET_GROUPS[0]!;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid="formula-toolbar-toggle"
        className={cn(
          "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition",
          open
            ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD]"
            : "border-slate-200 bg-white text-[#464555] hover:border-indigo-300"
        )}
      >
        <Sigma className="h-3.5 w-3.5 text-[#4F46E5]" />
        {tr("Chèn công thức Toán / Hoá", "Insert Math / Chem formula")}
      </button>

      {open && (
        <div
          data-testid="formula-toolbar"
          className={cn(
            "rounded-xl border border-indigo-100 bg-[#F8F9FF] p-2.5 space-y-2",
            compact ? "text-xs" : "text-sm"
          )}
        >
          <div className="flex flex-wrap gap-1">
            {FORMULA_SNIPPET_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveGroup(g.id)}
                data-testid={`formula-group-${g.id}`}
                className={cn(
                  "rounded-lg px-2 py-1 text-[11px] font-bold transition",
                  activeGroup === g.id
                    ? "bg-[#4F46E5] text-white"
                    : "bg-white text-[#464555] hover:bg-indigo-50"
                )}
              >
                {locale === "en" ? g.titleEn : g.titleVi}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {currentGroup.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onInsert(item.insert)}
                title={`${locale === "en" ? item.labelEn : item.labelVi} (${item.insert})`}
                data-testid={`formula-snippet-${item.id}`}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-[#0B1C30] hover:border-[#4F46E5] hover:bg-[#EEF2FF]"
              >
                <MathText text={item.insert} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
