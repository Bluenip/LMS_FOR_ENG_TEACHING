"use client";

import { BookOpen, Plus, Trash2 } from "lucide-react";
import type { WorksheetPassageDTO } from "./types";
import { hasMathSyntax, MathText } from "./MathText";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface PassagesEditorPanelProps {
  passages: WorksheetPassageDTO[];
  onChange: (next: WorksheetPassageDTO[]) => void;
  titleLabel?: string;
}

export function PassagesEditorPanel({
  passages,
  onChange,
  titleLabel,
}: PassagesEditorPanelProps) {
  const { tr } = useI18n();

  const addPassage = () => {
    const nextIdx = passages.length + 1;
    const next: WorksheetPassageDTO = {
      id: `psg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: tr(`Đoạn đọc / Ngữ liệu ${nextIdx}`, `Passage ${nextIdx}`),
      content: "",
      order: passages.length,
    };
    onChange([...passages, next]);
  };

  const updatePassage = (id: string, patch: Partial<WorksheetPassageDTO>) => {
    onChange(passages.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const removePassage = (id: string) => {
    onChange(passages.filter((p) => p.id !== id).map((p, i) => ({ ...p, order: i })));
  };

  return (
    <div
      data-testid="passages-editor-panel"
      className="rounded-xl border border-indigo-100 bg-[#F8F9FF] p-3.5 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-[#4F46E5]" />
          <span className="text-xs font-bold text-[#0B1C30]">
            {titleLabel || tr("Đoạn đọc / Ngữ liệu dùng chung", "Shared reading / stimulus passages")} ({passages.length})
          </span>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addPassage} data-testid="add-passage-btn">
          <Plus className="h-3.5 w-3.5" />
          {tr("Thêm đoạn đọc", "Add passage")}
        </Button>
      </div>

      {passages.length === 0 ? (
        <p className="text-xs text-[#464555]">
          {tr(
            "Tạo đoạn văn / bài đọc / tình huống dùng chung rồi gắn từng câu hỏi vào đoạn tương ứng ở bảng thuộc tính bên phải.",
            "Add a shared text passage or case scenario, then link questions to it from the right-hand inspector."
          )}
        </p>
      ) : (
        <div className="space-y-3">
          {passages.map((p, idx) => (
            <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-[#EEF2FF] px-2 py-0.5 text-[11px] font-bold text-[#3525CD]">
                  #{idx + 1}
                </span>
                <Input
                  value={p.title}
                  onChange={(e) => updatePassage(p.id, { title: e.target.value })}
                  placeholder={tr("Tiêu đề đoạn đọc (VD: Đọc hiểu văn bản 1)", "Passage title")}
                  className="h-8 flex-1 text-xs font-semibold"
                />
                <button
                  type="button"
                  onClick={() => removePassage(p.id)}
                  className="p-1 text-slate-400 hover:text-red-500"
                  title={tr("Xoá đoạn đọc", "Delete passage")}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Textarea
                rows={4}
                value={p.content}
                onChange={(e) => updatePassage(p.id, { content: e.target.value })}
                placeholder={tr(
                  "Dán hoặc nhập đoạn văn, bài thơ, nguồn tư liệu… (hỗ trợ công thức $...$).",
                  "Paste or type passage text… (supports $...$ formulas)."
                )}
                className="text-xs leading-relaxed"
              />
              {p.content && hasMathSyntax(p.content) && (
                <div className="rounded-lg border border-indigo-100 bg-[#F8F9FF] px-3 py-2 text-xs text-[#0B1C30]">
                  <MathText text={p.content} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
