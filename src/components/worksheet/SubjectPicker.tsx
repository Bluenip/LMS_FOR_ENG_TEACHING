"use client";

import type { WorksheetSubject } from "@prisma/client";
import {
  Atom,
  BookOpen,
  Calculator,
  Check,
  Code2,
  Dna,
  FlaskConical,
  Globe,
  Landmark,
  Languages,
  Layers,
  Scale,
} from "lucide-react";
import { getSubjectMeta, WORKSHEET_SUBJECTS } from "@/lib/subjects";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

function SubjectIcon({ subject, className }: { subject: WorksheetSubject; className?: string }) {
  switch (subject) {
    case "ENGLISH":
      return <Languages className={className} />;
    case "MATH":
      return <Calculator className={className} />;
    case "PHYSICS":
      return <Atom className={className} />;
    case "CHEMISTRY":
      return <FlaskConical className={className} />;
    case "BIOLOGY":
      return <Dna className={className} />;
    case "LITERATURE":
      return <BookOpen className={className} />;
    case "HISTORY":
      return <Landmark className={className} />;
    case "GEOGRAPHY":
      return <Globe className={className} />;
    case "CIVICS":
      return <Scale className={className} />;
    case "INFORMATICS":
      return <Code2 className={className} />;
    default:
      return <Layers className={className} />;
  }
}

export function SubjectBadge({
  subject,
  className,
}: {
  subject?: WorksheetSubject | string | null;
  className?: string;
}) {
  const { locale } = useI18n();
  const meta = getSubjectMeta(subject);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        meta.badgeClass,
        className
      )}
    >
      <SubjectIcon subject={meta.id} className="h-3 w-3 shrink-0" />
      {locale === "en" ? meta.shortEn : meta.shortVi}
    </span>
  );
}

interface SubjectPickerProps {
  value: WorksheetSubject | null;
  onChange: (subject: WorksheetSubject) => void;
}

export function SubjectPicker({ value, onChange }: SubjectPickerProps) {
  const { locale, tr } = useI18n();
  const selectedMeta = value ? getSubjectMeta(value) : null;

  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {WORKSHEET_SUBJECTS.map((subj) => {
          const meta = getSubjectMeta(subj);
          const active = value === subj;
          return (
            <button
              key={subj}
              type="button"
              onClick={() => onChange(subj)}
              data-testid={`subject-option-${subj}`}
              aria-pressed={active}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition",
                active
                  ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD] ring-2 ring-indigo-200"
                  : "border-slate-200 bg-white text-[#0B1C30] hover:border-indigo-300"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                  active ? "bg-[#4F46E5] text-white" : meta.badgeClass
                )}
              >
                <SubjectIcon subject={subj} className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1 truncate">
                {locale === "en" ? meta.labelEn : meta.labelVi}
              </span>
              {active && <Check className="h-3.5 w-3.5 shrink-0 text-[#4F46E5]" />}
            </button>
          );
        })}
      </div>

      {selectedMeta ? (
        <p className="rounded-xl bg-[#F8F9FF] px-3 py-2 text-xs text-[#464555]">
          <span className="font-semibold text-[#3525CD]">
            {tr("Giao diện biên tập:", "Editor setup:")}
          </span>{" "}
          {locale === "en" ? selectedMeta.descriptionEn : selectedMeta.descriptionVi}
        </p>
      ) : (
        <p className="text-xs font-medium text-[#EA580C]">
          {tr(
            "Vui lòng chọn môn học để hiển thị đúng công cụ soạn bài.",
            "Please select a subject to tailor the editor tools."
          )}
        </p>
      )}
    </div>
  );
}
