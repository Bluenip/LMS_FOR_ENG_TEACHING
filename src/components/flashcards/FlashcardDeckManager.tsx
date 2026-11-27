"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import { BookOpen, Download, Layers, Loader2, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface FlashcardDeckSummaryDTO {
  id: string;
  ownerId: string;
  ownerName: string;
  classId: string | null;
  className: string | null;
  title: string;
  description: string | null;
  cardCount: number;
  dueCount: number;
  masteredCount: number;
  updatedAt: string;
}

interface CardDraft {
  front: string;
  back: string;
  phonetic: string;
  example: string;
}

export function FlashcardDeckManager({
  mode,
  currentUserId,
  onSelectDeck,
}: {
  mode: "TEACHER" | "STUDENT";
  currentUserId?: string;
  onSelectDeck?: (deckId: string) => void;
}) {
  const { tr } = useI18n();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ decks: FlashcardDeckSummaryDTO[] }>({
    queryKey: ["flashcard-decks"],
    queryFn: () =>
      apiFetchJson<{ decks: FlashcardDeckSummaryDTO[] }>(
        "/api/flashcards",
        undefined,
        tr("Không tải được bộ thẻ Flashcard", "Could not load flashcard decks")
      ),
  });

  const { data: teacherClassesData } = useQuery<{ classes: Array<{ id: string; name: string }> }>({
    queryKey: ["teacher-classes-for-flashcards"],
    enabled: mode === "TEACHER",
    queryFn: () => apiFetchJson("/api/classes"),
  });

  const { data: teacherWsData } = useQuery<{
    worksheets: Array<{ id: string; title: string }>;
  }>({
    queryKey: ["teacher-worksheets-for-flashcards"],
    enabled: mode === "TEACHER",
    queryFn: () => apiFetchJson("/api/worksheets"),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classId, setClassId] = useState("");
  const [cards, setCards] = useState<CardDraft[]>([
    { front: "", back: "", phonetic: "", example: "" },
    { front: "", back: "", phonetic: "", example: "" },
  ]);
  const [saving, setSaving] = useState(false);

  const [extractOpen, setExtractOpen] = useState(false);
  const [extWorksheetId, setExtWorksheetId] = useState("");
  const [extClassId, setExtClassId] = useState("");
  const [extTitle, setExtTitle] = useState("");
  const [extracting, setExtracting] = useState(false);

  const [deletingDeck, setDeletingDeck] = useState<FlashcardDeckSummaryDTO | null>(null);

  const decks = data?.decks ?? [];
  const classes = teacherClassesData?.classes ?? [];
  const worksheets = teacherWsData?.worksheets ?? [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const validCards = cards.filter((c) => c.front.trim() && c.back.trim());
    if (validCards.length === 0) {
      toast.error(tr("Vui lòng nhập ít nhất 1 thẻ có đủ 2 mặt.", "Add at least 1 card."));
      return;
    }
    setSaving(true);
    try {
      await apiFetchJson(
        "/api/flashcards",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || null,
            classId: mode === "TEACHER" ? classId || null : null,
            cards: validCards.map((c) => ({
              front: c.front.trim(),
              back: c.back.trim(),
              phonetic: c.phonetic.trim() || null,
              example: c.example.trim() || null,
            })),
          }),
        },
        tr("Không tạo được bộ thẻ", "Could not create deck")
      );
      toast.success(tr("Đã tạo bộ thẻ Flashcard!", "Flashcard deck created!"));
      setCreateOpen(false);
      setTitle("");
      setDescription("");
      setCards([{ front: "", back: "", phonetic: "", example: "" }]);
      await queryClient.invalidateQueries({ queryKey: ["flashcard-decks"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lỗi tạo bộ thẻ", "Failed"));
    } finally {
      setSaving(false);
    }
  };

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extWorksheetId) return;
    setExtracting(true);
    try {
      await apiFetchJson(
        "/api/flashcards/from-worksheet",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            worksheetId: extWorksheetId,
            classId: extClassId || null,
            title: extTitle.trim() || undefined,
          }),
        },
        tr("Không trích xuất được thẻ từ worksheet", "Could not extract cards")
      );
      toast.success(tr("Đã tạo bộ thẻ từ Worksheet!", "Deck extracted from worksheet!"));
      setExtractOpen(false);
      setExtTitle("");
      await queryClient.invalidateQueries({ queryKey: ["flashcard-decks"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lỗi trích xuất", "Failed"));
    } finally {
      setExtracting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingDeck) return;
    try {
      await apiFetchJson(
        `/api/flashcards?id=${encodeURIComponent(deletingDeck.id)}`,
        { method: "DELETE" },
        tr("Không xoá được bộ thẻ", "Could not delete deck")
      );
      toast.success(tr("Đã xoá bộ thẻ.", "Deck deleted."));
      setDeletingDeck(null);
      await queryClient.invalidateQueries({ queryKey: ["flashcard-decks"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lỗi xoá", "Failed"));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#0B1C30] dark:text-slate-100">
            {tr("Bộ thẻ Flashcard (SM-2)", "Flashcard Decks (SM-2)")}
          </h2>
          <p className="text-xs text-slate-500">
            {mode === "TEACHER"
              ? tr(
                  "Tạo bộ từ vựng cho lớp học hoặc trích xuất trực tiếp từ câu hỏi trên Worksheet.",
                  "Create class vocabulary decks or extract cards directly from existing worksheets."
                )
              : tr(
                  "Chọn bộ thẻ từ giáo viên hoặc tự tạo bộ thẻ cá nhân để ôn tập theo lịch lặp ngắt quãng.",
                  "Pick a class deck or create personal decks for spaced-repetition review."
                )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {mode === "TEACHER" && worksheets.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="min-h-10"
              data-testid="extract-flashcard-btn"
              onClick={() => {
                setExtWorksheetId(worksheets[0]!.id);
                setExtractOpen(true);
              }}
            >
              <Sparkles className="h-4 w-4 text-[#4F46E5]" />
              {tr("Trích từ Worksheet", "Extract from worksheet")}
            </Button>
          )}
          <Button
            type="button"
            variant="accent"
            className="min-h-10"
            data-testid="create-flashcard-deck-btn"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            {tr("Tạo bộ thẻ mới", "Create deck")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="stitch-card flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tr("Đang tải bộ thẻ…", "Loading decks…")}
        </div>
      ) : decks.length === 0 ? (
        <div className="stitch-card p-10 text-center space-y-2">
          <Layers className="mx-auto h-10 w-10 text-slate-300" />
          <p className="text-sm font-semibold text-[#0B1C30] dark:text-slate-100">
            {tr("Chưa có bộ thẻ nào.", "No flashcard decks yet.")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="flashcard-deck-grid">
          {decks.map((d) => {
            const canDelete = mode === "TEACHER" || d.ownerId === currentUserId;
            return (
              <div
                key={d.id}
                data-testid={`flashcard-deck-${d.id}`}
                className="stitch-card p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {d.className ? (
                      <Badge variant="indigo">{d.className}</Badge>
                    ) : (
                      <Badge variant="neutral">{tr("Cá nhân", "Personal")}</Badge>
                    )}
                    <Badge variant="mint">{d.cardCount} {tr("thẻ", "cards")}</Badge>
                    {mode === "STUDENT" && d.dueCount > 0 && (
                      <Badge variant="orange">{d.dueCount} {tr("cần ôn", "due")}</Badge>
                    )}
                  </div>
                  <h3 className="text-base font-bold text-[#0B1C30] dark:text-slate-100">
                    {d.title}
                  </h3>
                  {d.description && (
                    <p className="text-xs text-slate-500 line-clamp-2">{d.description}</p>
                  )}
                  <p className="text-[11px] text-slate-400">
                    {tr("Tác giả:", "Author:")} {d.ownerName} • {formatDateTime(d.updatedAt)}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {onSelectDeck ? (
                    <Button
                      type="button"
                      variant="accent"
                      size="sm"
                      className="min-h-10 flex-1"
                      data-testid={`study-deck-${d.id}`}
                      onClick={() => onSelectDeck(d.id)}
                    >
                      <BookOpen className="h-4 w-4" />
                      {tr("Học ngay", "Study now")}
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-400">
                      {d.cardCount} {tr("thẻ từ vựng", "cards")}
                    </span>
                  )}
                  <Button type="button" variant="ghost" size="sm" className="min-h-9" asChild>
                    <a href={`/api/flashcards/${d.id}/anki-csv`} download title={tr("Xuất Anki", "Export to Anki")} data-testid={`anki-export-${d.id}`}>
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                  {canDelete && (
                    <label className="inline-flex min-h-9 cursor-pointer items-center rounded-lg px-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800" title={tr("Nhập thẻ từ Anki (.txt/.csv)", "Import Anki notes (.txt/.csv)")}>
                      <Upload className="h-4 w-4" />
                      <input
                        type="file"
                        accept=".txt,.csv,.tsv,text/plain,text/csv"
                        className="hidden"
                        data-testid={`anki-import-${d.id}`}
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            const res = await apiFetchJson<{ imported: number }>(`/api/flashcards/${d.id}/anki-csv`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ content: await f.text() }),
                            });
                            toast.success(tr(`Đã nhập ${res.imported} thẻ`, `Imported ${res.imported} cards`));
                            void queryClient.invalidateQueries();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : tr("Nhập thất bại", "Import failed"));
                          } finally {
                            e.target.value = "";
                          }
                        }}
                      />
                    </label>
                  )}
                  {canDelete && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-9 text-red-600 hover:bg-red-50"
                      onClick={() => setDeletingDeck(d)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Deck Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="create-deck-dialog">
          <DialogHeader>
            <DialogTitle>{tr("Tạo bộ thẻ Flashcard mới", "Create Flashcard Deck")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{tr("Tên bộ thẻ", "Deck title")}</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="Unit 8 — Environment Vocabulary"
                />
              </div>
              {mode === "TEACHER" && (
                <div className="space-y-1.5">
                  <Label>{tr("Gắn cho lớp (tuỳ chọn)", "Assign to class (optional)")}</Label>
                  <select
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                  >
                    <option value="">{tr("Chỉ cá nhân tôi", "Personal only")}</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{tr("Mô tả ngắn (tuỳ chọn)", "Description (optional)")}</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Label>{tr("Danh sách thẻ", "Cards")}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setCards((prev) => [...prev, { front: "", back: "", phonetic: "", example: "" }])
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  {tr("Thêm thẻ", "Add card")}
                </Button>
              </div>
              {cards.map((c, idx) => (
                <div key={idx} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3 sm:grid-cols-2">
                  <Input
                    value={c.front}
                    onChange={(e) =>
                      setCards((prev) => prev.map((x, i) => (i === idx ? { ...x, front: e.target.value } : x)))
                    }
                    placeholder={tr(`Mặt trước #${idx + 1} (Từ / Thuật ngữ)`, `Front #${idx + 1}`)}
                  />
                  <Input
                    value={c.back}
                    onChange={(e) =>
                      setCards((prev) => prev.map((x, i) => (i === idx ? { ...x, back: e.target.value } : x)))
                    }
                    placeholder={tr(`Mặt sau #${idx + 1} (Nghĩa / Đáp án)`, `Back #${idx + 1}`)}
                  />
                  <Input
                    value={c.phonetic}
                    onChange={(e) =>
                      setCards((prev) => prev.map((x, i) => (i === idx ? { ...x, phonetic: e.target.value } : x)))
                    }
                    placeholder={tr("Phiên âm (VD: /ˈɪn.fər/)", "Phonetic (optional)")}
                  />
                  <Input
                    value={c.example}
                    onChange={(e) =>
                      setCards((prev) => prev.map((x, i) => (i === idx ? { ...x, example: e.target.value } : x)))
                    }
                    placeholder={tr("Câu ví dụ (tuỳ chọn)", "Example sentence (optional)")}
                  />
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-10" onClick={() => setCreateOpen(false)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" variant="accent" className="min-h-10" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {tr("Lưu bộ thẻ", "Save deck")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Extract from Worksheet Dialog */}
      {mode === "TEACHER" && (
        <Dialog open={extractOpen} onOpenChange={setExtractOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{tr("Trích xuất Flashcard từ Worksheet", "Extract Flashcards from Worksheet")}</DialogTitle>
              <DialogDescription>
                {tr(
                  "Tự động tạo bộ thẻ từ các câu hỏi điền từ / trắc nghiệm có sẵn đáp án trong phiếu.",
                  "Automatically creates cards from existing text and multiple-choice questions."
                )}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleExtract} className="space-y-4">
              <div className="space-y-1.5">
                <Label>{tr("Chọn Worksheet", "Select worksheet")}</Label>
                <select
                  value={extWorksheetId}
                  onChange={(e) => setExtWorksheetId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                >
                  {worksheets.map((w) => (
                    <option key={w.id} value={w.id}>{w.title}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Gắn cho lớp", "Assign to class")}</Label>
                <select
                  value={extClassId}
                  onChange={(e) => setExtClassId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                >
                  <option value="">{tr("Chỉ cá nhân tôi", "Personal only")}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Tên bộ thẻ (tuỳ chọn)", "Custom deck title")}</Label>
                <Input
                  value={extTitle}
                  onChange={(e) => setExtTitle(e.target.value)}
                  placeholder={tr("Để trống để lấy theo tên Worksheet", "Leave blank to use worksheet title")}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" className="min-h-10" onClick={() => setExtractOpen(false)}>
                  {tr("Huỷ", "Cancel")}
                </Button>
                <Button type="submit" variant="accent" className="min-h-10" disabled={extracting}>
                  {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {tr("Trích xuất ngay", "Extract deck")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirm Dialog */}
      <Dialog open={Boolean(deletingDeck)} onOpenChange={(o) => !o && setDeletingDeck(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Xoá bộ thẻ Flashcard?", "Delete flashcard deck?")}</DialogTitle>
            <DialogDescription>
              {deletingDeck ? `"${deletingDeck.title}"` : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-10" onClick={() => setDeletingDeck(null)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button type="button" variant="destructive" className="min-h-10" onClick={() => void handleDelete()}>
              {tr("Xoá", "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
