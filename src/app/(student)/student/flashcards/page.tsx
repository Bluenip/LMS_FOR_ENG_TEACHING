"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import { ArrowLeft, CheckCircle2, Loader2, RotateCcw, Volume2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlashcardDeckManager } from "@/components/flashcards/FlashcardDeckManager";

interface StudyCardDTO {
  id: string;
  front: string;
  back: string;
  phonetic: string | null;
  example: string | null;
  isDue: boolean;
  srs: {
    easeFactor: number;
    intervalDays: number;
    repetitions: number;
    nextReviewAt: string;
  } | null;
}

interface ReviewQueuePayload {
  deck: {
    id: string;
    title: string;
    description: string | null;
    className: string | null;
  };
  cards: StudyCardDTO[];
  dueCards: StudyCardDTO[];
}

export default function StudentFlashcardsPage() {
  const { tr } = useI18n();
  const queryClient = useQueryClient();
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [cardIdx, setCardIdx] = useState(0);
  const [studyAll, setStudyAll] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data, isLoading } = useQuery<ReviewQueuePayload>({
    queryKey: ["flashcard-review-queue", selectedDeckId],
    enabled: Boolean(selectedDeckId),
    queryFn: () =>
      apiFetchJson<ReviewQueuePayload>(
        `/api/flashcards/${selectedDeckId}/review`,
        undefined,
        tr("Không tải được thẻ ôn tập", "Could not load cards")
      ),
  });

  const activeList = data
    ? studyAll || data.dueCards.length === 0
      ? data.cards
      : data.dueCards
    : [];
  const currentCard = activeList[cardIdx] ?? null;

  const speakWord = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 0.92;
    window.speechSynthesis.speak(u);
  };

  const rateCard = async (quality: 0 | 3 | 4 | 5) => {
    if (!selectedDeckId || !currentCard) return;
    setSubmitting(true);
    try {
      const res = await apiFetchJson<{
        review: { intervalDays: number; nextReviewAt: string };
      }>(`/api/flashcards/${selectedDeckId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flashcardId: currentCard.id, quality }),
      });
      toast.success(
        tr(
          `Đã lưu! Ôn lại sau ${res.review.intervalDays} ngày.`,
          `Saved! Next review in ${res.review.intervalDays} day(s).`
        )
      );
      setFlipped(false);
      if (cardIdx + 1 < activeList.length) {
        setCardIdx((i) => i + 1);
      } else {
        setCardIdx(0);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["flashcard-review-queue", selectedDeckId] }),
          queryClient.invalidateQueries({ queryKey: ["flashcard-decks"] }),
        ]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Lỗi lưu SRS", "Error"));
    } finally {
      setSubmitting(false);
    }
  };

  if (!selectedDeckId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-[#0B1C30] dark:text-slate-100">
            {tr("Học Flashcard (Spaced Repetition)", "Flashcards (Spaced Repetition)")}
          </h1>
          <p className="text-sm text-[#464555] dark:text-slate-400">
            {tr(
              "Ôn tập từ vựng theo thuật toán SM-2: hệ thống tự hẹn ngày ôn lại dựa trên mức độ ghi nhớ của bạn.",
              "Review vocabulary with SM-2 spaced repetition intervals tailored to recall difficulty."
            )}
          </p>
        </div>

        <FlashcardDeckManager
          mode="STUDENT"
          onSelectDeck={(id) => {
            setSelectedDeckId(id);
            setCardIdx(0);
            setFlipped(false);
            setStudyAll(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-9"
          onClick={() => setSelectedDeckId(null)}
        >
          <ArrowLeft className="h-4 w-4" />
          {tr("Tất cả bộ thẻ", "All decks")}
        </Button>

        {data && (
          <div className="flex items-center gap-2">
            <Badge variant="indigo">
              {data.dueCards.length} {tr("cần ôn hôm nay", "due today")}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setStudyAll((v) => !v);
                setCardIdx(0);
                setFlipped(false);
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {studyAll ? tr("Chỉ thẻ đến hạn", "Due only") : tr("Ôn lại tất cả", "Study all")}
            </Button>
          </div>
        )}
      </div>

      {isLoading || !data ? (
        <div className="stitch-card flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tr("Đang tải bộ thẻ…", "Loading deck…")}
        </div>
      ) : activeList.length === 0 || !currentCard ? (
        <div className="stitch-card p-10 text-center space-y-3">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="text-base font-bold text-[#0B1C30] dark:text-slate-100">
            {tr("Bạn đã hoàn thành hết thẻ hôm nay!", "All due cards completed!")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>{data.deck.title}</span>
            <span className="tabular-nums">
              {cardIdx + 1} / {activeList.length}
            </span>
          </div>

          {/* 3D Flip Card */}
          <div
            role="button"
            tabIndex={0}
            data-testid="flashcard-flip-card"
            onClick={() => setFlipped((f) => !f)}
            onKeyDown={(e) => {
              if (e.key === " " || e.key === "Enter") {
                e.preventDefault();
                setFlipped((f) => !f);
              }
            }}
            className="stitch-card min-h-[260px] cursor-pointer p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-3 select-none transition-transform duration-300"
          >
            {!flipped ? (
              <>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {tr("Nhấn để lật xem nghĩa", "Tap to reveal answer")}
                </span>
                <p className="text-2xl sm:text-3xl font-extrabold text-[#0B1C30] dark:text-slate-100 break-words max-w-full">
                  {currentCard.front}
                </p>
                {currentCard.phonetic && (
                  <p className="font-mono text-sm text-[#4F46E5]">{currentCard.phonetic}</p>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    speakWord(currentCard.front);
                  }}
                  aria-label={tr("Phát âm", "Pronounce")}
                  className="mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-[#EEF2FF] px-3 py-1.5 text-xs font-semibold text-[#3525CD] hover:bg-[#E2DFFF]"
                >
                  <Volume2 className="h-4 w-4" />
                  {tr("Nghe phát âm", "Listen")}
                </button>
              </>
            ) : (
              <>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                  {tr("Nghĩa / Đáp án", "Meaning / Answer")}
                </span>
                <p className="text-xl sm:text-2xl font-bold text-[#0B1C30] dark:text-slate-100 break-words max-w-full">
                  {currentCard.back}
                </p>
                {currentCard.example && (
                  <p className="rounded-xl bg-[#F8F9FF] dark:bg-slate-800 px-4 py-2.5 text-xs italic text-slate-600 dark:text-slate-300">
                    &ldquo;{currentCard.example}&rdquo;
                  </p>
                )}
              </>
            )}
          </div>

          {/* 4 SM-2 Buttons */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              data-testid="srs-btn-0"
              className="min-h-11 border-red-200 text-red-700 hover:bg-red-50"
              onClick={() => void rateCard(0)}
            >
              {tr("Lại (1 ngày)", "Again (1d)")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              data-testid="srs-btn-3"
              className="min-h-11 border-amber-200 text-amber-700 hover:bg-amber-50"
              onClick={() => void rateCard(3)}
            >
              {tr("Khó", "Hard")}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              data-testid="srs-btn-4"
              className="min-h-11 border-indigo-200 text-[#3525CD] hover:bg-indigo-50"
              onClick={() => void rateCard(4)}
            >
              {tr("Tốt", "Good")}
            </Button>
            <Button
              type="button"
              variant="accent"
              disabled={submitting}
              data-testid="srs-btn-5"
              className="min-h-11"
              onClick={() => void rateCard(5)}
            >
              {tr("Dễ", "Easy")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
