"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MessageSquarePlus, Plus, X } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CommentPreset {
  id: string;
  content: string;
  category: string | null;
}

interface CommentPresetBarProps {
  onInsert: (text: string) => void;
  compact?: boolean;
}

export function CommentPresetBar({ onInsert, compact = false }: CommentPresetBarProps) {
  const { tr } = useI18n();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);

  const { data } = useQuery<{ presets: CommentPreset[] }>({
    queryKey: ["teacher-comment-presets"],
    queryFn: () =>
      apiFetchJson<{ presets: CommentPreset[] }>(
        "/api/teacher/comment-presets",
        undefined,
        tr("Không tải được câu nhận xét mẫu", "Could not load comment presets")
      ),
  });

  const presets = data?.presets ?? [];

  const handleCreate = async () => {
    const content = newContent.trim();
    if (!content) return;
    setSaving(true);
    try {
      await apiFetchJson("/api/teacher/comment-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      setNewContent("");
      setAdding(false);
      await queryClient.invalidateQueries({ queryKey: ["teacher-comment-presets"] });
      toast.success(tr("Đã lưu câu nhận xét mẫu.", "Comment preset saved."));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lưu thất bại", "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetchJson(`/api/teacher/comment-presets/${id}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["teacher-comment-presets"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Xoá thất bại", "Delete failed"));
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-[#F8F9FF] p-2.5" data-testid="comment-preset-bar">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#3525CD]">
          <MessageSquarePlus className="h-3.5 w-3.5" />
          {tr("Nhận xét mẫu (bấm để chèn)", "Quick comment presets")}
        </span>
        {!compact && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold text-[#4F46E5] hover:bg-[#EEF2FF]"
            data-testid="toggle-add-preset-btn"
          >
            <Plus className="h-3 w-3" />
            {tr("Lưu mẫu mới", "New preset")}
          </button>
        )}
      </div>

      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <div
              key={p.id}
              className="group inline-flex max-w-full items-center gap-1 rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-medium text-[#0B1C30]"
            >
              <button
                type="button"
                onClick={() => onInsert(p.content)}
                className="truncate text-left hover:text-[#3525CD]"
                data-testid={`insert-preset-${p.id}`}
              >
                {p.content}
              </button>
              {!compact && (
                <button
                  type="button"
                  onClick={() => void handleDelete(p.id)}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  title={tr("Xoá mẫu này", "Delete preset")}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400">
          {tr("Chưa có câu nhận xét mẫu nào.", "No saved comment presets yet.")}
        </p>
      )}

      {adding && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Input
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder={tr("VD: Bài làm tốt, chú ý thêm ngữ pháp thì hiện tại hoàn thành.", "e.g. Good structure, review verb tenses.")}
            className="h-8 flex-1 text-xs"
            data-testid="new-preset-input"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => void handleCreate()}
            disabled={saving || !newContent.trim()}
            data-testid="save-new-preset-btn"
          >
            {tr("Lưu", "Save")}
          </Button>
        </div>
      )}
    </div>
  );
}
