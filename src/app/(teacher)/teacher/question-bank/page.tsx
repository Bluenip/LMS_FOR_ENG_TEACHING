"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetchJson } from "@/lib/api-client";
import {
  BookOpen,
  Edit3,
  Globe,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Wand2,
  FileUp,
} from "lucide-react";
import type { FieldType, SkillTag, WorksheetSubject } from "@prisma/client";
import { WORKSHEET_SUBJECTS, getSubjectMeta } from "@/lib/subjects";
import { useI18n } from "@/lib/i18n/client";
import { PromptText } from "@/components/worksheet/PromptText";
import { SubjectBadge, SubjectPicker } from "@/components/worksheet/SubjectPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StandardImportDialog } from "@/components/library/StandardImportDialog";

interface BankItemDTO {
  id: string;
  ownerId: string;
  subject: WorksheetSubject;
  type: FieldType;
  prompt: string;
  options: Array<{ id: string; text: string }> | null;
  answerKey: Record<string, unknown>;
  explanation: string | null;
  skillTag: SkillTag | null;
  topicTag: string | null;
  level: string | null;
  difficulty: number;
  tags: string[];
  isShared: boolean;
  updatedAt: string;
  owner: { id: string; name: string };
}

interface BankListResponse {
  items: BankItemDTO[];
  facets: {
    topicTags: string[];
    levels: string[];
    tags: string[];
  };
}

interface MatrixRowForm {
  subject: WorksheetSubject | "";
  type: FieldType | "";
  topicTag: string;
  difficultyMin: string;
  difficultyMax: string;
  count: number;
  points: number;
}

interface MatrixPreviewResponse {
  canGenerate: boolean;
  rowCounts: number[];
  shortages: Array<{ rowIndex: number; requested: number; available: number; availableUnique: number }>;
  totalRequested: number;
}

const SUPPORTED_BANK_TYPES: FieldType[] = [
  "MULTIPLE_CHOICE",
  "MULTI_SELECT",
  "TEXT",
  "NUMBER",
  "TRUE_FALSE",
  "ESSAY",
];

const SKILL_OPTIONS: SkillTag[] = [
  "GRAMMAR",
  "VOCABULARY",
  "READING",
  "LISTENING",
  "WRITING",
  "SPEAKING",
];

export default function TeacherQuestionBankPage() {
  const { m: vi, tr, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Filter state
  const [scope, setScope] = useState<"all" | "mine" | "shared">("all");
  const [subject, setSubject] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [topicTag, setTopicTag] = useState<string>("");
  const [skillTag, setSkillTag] = useState<string>("");
  const [difficultyMin, setDifficultyMin] = useState<string>("");
  const [difficultyMax, setDifficultyMax] = useState<string>("");
  const [q, setQ] = useState<string>("");

  const queryStr = (() => {
    const p = new URLSearchParams({ scope });
    if (subject) p.set("subject", subject);
    if (type) p.set("type", type);
    if (topicTag) p.set("topicTag", topicTag);
    if (skillTag) p.set("skillTag", skillTag);
    if (difficultyMin) p.set("difficultyMin", difficultyMin);
    if (difficultyMax) p.set("difficultyMax", difficultyMax);
    if (q.trim()) p.set("q", q.trim());
    return p.toString();
  })();

  const { data, isLoading } = useQuery<BankListResponse>({
    queryKey: ["question-bank", queryStr],
    queryFn: () =>
      apiFetchJson<BankListResponse>(
        `/api/question-bank?${queryStr}`,
        undefined,
        tr("Không tải được ngân hàng câu hỏi", "Could not load question bank")
      ),
  });

  // Add / Edit modal state
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BankItemDTO | null>(null);
  const [formSubject, setFormSubject] = useState<WorksheetSubject>("ENGLISH");
  const [formType, setFormType] = useState<FieldType>("MULTIPLE_CHOICE");
  const [formPrompt, setFormPrompt] = useState("");
  const [formOptA, setFormOptA] = useState("");
  const [formOptB, setFormOptB] = useState("");
  const [formOptC, setFormOptC] = useState("");
  const [formOptD, setFormOptD] = useState("");
  const [formCorrectMC, setFormCorrectMC] = useState("A");
  const [formCorrectText, setFormCorrectText] = useState("");
  const [formCorrectTF, setFormCorrectTF] = useState<boolean>(true);
  const [formExplanation, setFormExplanation] = useState("");
  const [formTopicTag, setFormTopicTag] = useState("");
  const [formSkillTag, setFormSkillTag] = useState<SkillTag | "">("");
  const [formLevel, setFormLevel] = useState("");
  const [formDifficulty, setFormDifficulty] = useState<number>(3);
  const [formTags, setFormTags] = useState("");
  const [formShared, setFormShared] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  // Delete confirmation modal state
  const [deletingItem, setDeletingItem] = useState<BankItemDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Matrix Generator modal state
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [matrixTitle, setMatrixTitle] = useState("");
  const [matrixSubject, setMatrixSubject] = useState<WorksheetSubject>("ENGLISH");
  const [matrixIncludeShared, setMatrixIncludeShared] = useState(true);
  const [matrixRows, setMatrixRows] = useState<MatrixRowForm[]>([
    { subject: "ENGLISH", type: "", topicTag: "", difficultyMin: "1", difficultyMax: "5", count: 2, points: 1 },
  ]);
  const [matrixPreview, setMatrixPreview] = useState<MatrixPreviewResponse | null>(null);
  const [matrixGenerating, setMatrixGenerating] = useState(false);

  // Live preview matrix availability when matrix dialog is open
  useEffect(() => {
    if (!matrixOpen) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/question-bank/generate-worksheet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: matrixTitle.trim() || "Preview",
            subject: matrixSubject,
            includeShared: matrixIncludeShared,
            preview: true,
            rows: matrixRows.map((r) => ({
              ...(r.subject ? { subject: r.subject } : {}),
              ...(r.type ? { type: r.type } : {}),
              ...(r.topicTag.trim() ? { topicTag: r.topicTag.trim() } : {}),
              ...(r.difficultyMin ? { difficultyMin: Number(r.difficultyMin) } : {}),
              ...(r.difficultyMax ? { difficultyMax: Number(r.difficultyMax) } : {}),
              count: Math.max(1, Number(r.count) || 1),
              points: Math.max(0.25, Number(r.points) || 1),
            })),
          }),
        });
        if (res.ok && !cancelled) {
          setMatrixPreview((await res.json()) as MatrixPreviewResponse);
        }
      } catch {
        // ignore transient preview errors
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [matrixOpen, matrixTitle, matrixSubject, matrixIncludeShared, matrixRows]);

  const openCreateModal = () => {
    setEditingItem(null);
    setFormSubject("ENGLISH");
    setFormType("MULTIPLE_CHOICE");
    setFormPrompt("");
    setFormOptA("");
    setFormOptB("");
    setFormOptC("");
    setFormOptD("");
    setFormCorrectMC("A");
    setFormCorrectText("");
    setFormCorrectTF(true);
    setFormExplanation("");
    setFormTopicTag("");
    setFormSkillTag("");
    setFormLevel("");
    setFormDifficulty(3);
    setFormTags("");
    setFormShared(false);
    setItemDialogOpen(true);
  };

  const openEditModal = (it: BankItemDTO) => {
    setEditingItem(it);
    setFormSubject(it.subject);
    setFormType(it.type);
    setFormPrompt(it.prompt);
    const opts = Array.isArray(it.options) ? it.options : [];
    setFormOptA(opts.find((o) => o.id === "A")?.text ?? "");
    setFormOptB(opts.find((o) => o.id === "B")?.text ?? "");
    setFormOptC(opts.find((o) => o.id === "C")?.text ?? "");
    setFormOptD(opts.find((o) => o.id === "D")?.text ?? "");
    const ak = it.answerKey ?? {};
    setFormCorrectMC(typeof ak.correct === "string" ? ak.correct : "A");
    setFormCorrectText(
      Array.isArray(ak.accepted)
        ? ak.accepted.join("; ")
        : ak.value !== undefined
          ? String(ak.value)
          : ""
    );
    setFormCorrectTF(ak.correct !== false);
    setFormExplanation(it.explanation ?? "");
    setFormTopicTag(it.topicTag ?? "");
    setFormSkillTag(it.skillTag ?? "");
    setFormLevel(it.level ?? "");
    setFormDifficulty(it.difficulty);
    setFormTags(it.tags.join(", "));
    setFormShared(it.isShared);
    setItemDialogOpen(true);
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPrompt.trim()) return;
    setSavingItem(true);
    try {
      let options: Array<{ id: string; text: string }> | null = null;
      let answerKey: Record<string, unknown> = {};

      if (formType === "MULTIPLE_CHOICE" || formType === "MULTI_SELECT") {
        options = [
          { id: "A", text: formOptA.trim() || "A" },
          { id: "B", text: formOptB.trim() || "B" },
          ...(formOptC.trim() ? [{ id: "C", text: formOptC.trim() }] : []),
          ...(formOptD.trim() ? [{ id: "D", text: formOptD.trim() }] : []),
        ];
        answerKey =
          formType === "MULTI_SELECT"
            ? {
                correct: formCorrectMC
                  .split(",")
                  .map((s) => s.trim().toUpperCase())
                  .filter(Boolean),
              }
            : { correct: formCorrectMC };
      } else if (formType === "TEXT") {
        const accepted = formCorrectText
          .split(/[;|]/)
          .map((s) => s.trim())
          .filter(Boolean);
        answerKey = { accepted: accepted.length > 0 ? accepted : [""] };
      } else if (formType === "NUMBER") {
        answerKey = { value: Number(formCorrectText.replace(",", ".")) || 0 };
      } else if (formType === "TRUE_FALSE") {
        answerKey = { correct: formCorrectTF };
      } else {
        answerKey = {};
      }

      const payload = {
        subject: formSubject,
        type: formType,
        prompt: formPrompt.trim(),
        options,
        answerKey,
        explanation: formExplanation.trim() || null,
        topicTag: formTopicTag.trim() || null,
        skillTag: formSkillTag || null,
        level: formLevel.trim() || null,
        difficulty: formDifficulty,
        tags: formTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        isShared: formShared,
      };

      const res = await fetch(
        editingItem ? `/api/question-bank/${editingItem.id}` : "/api/question-bank",
        {
          method: editingItem ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Lưu câu hỏi thất bại", "Could not save item"));

      toast.success(
        editingItem
          ? tr("Đã cập nhật câu hỏi!", "Question updated!")
          : tr("Đã thêm vào ngân hàng câu hỏi!", "Question added to bank!")
      );
      setItemDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["question-bank"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setSavingItem(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/question-bank/${deletingItem.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Xoá thất bại", "Delete failed"));
      toast.success(tr("Đã xoá câu hỏi khỏi ngân hàng.", "Question deleted from bank."));
      setDeletingItem(null);
      await queryClient.invalidateQueries({ queryKey: ["question-bank"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerateWorksheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matrixTitle.trim() || matrixRows.length === 0) return;
    setMatrixGenerating(true);
    try {
      const res = await fetch("/api/question-bank/generate-worksheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: matrixTitle.trim(),
          subject: matrixSubject,
          includeShared: matrixIncludeShared,
          preview: false,
          rows: matrixRows.map((r) => ({
            ...(r.subject ? { subject: r.subject } : {}),
            ...(r.type ? { type: r.type } : {}),
            ...(r.topicTag.trim() ? { topicTag: r.topicTag.trim() } : {}),
            ...(r.difficultyMin ? { difficultyMin: Number(r.difficultyMin) } : {}),
            ...(r.difficultyMax ? { difficultyMax: Number(r.difficultyMax) } : {}),
            count: Math.max(1, Number(r.count) || 1),
            points: Math.max(0.25, Number(r.points) || 1),
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? tr("Không thể tạo đề từ ma trận", "Matrix generation failed"));
      }
      toast.success(
        tr(
          `Đã tạo đề "${json.worksheet.title}" với ${json.fieldCount} câu hỏi!`,
          `Generated "${json.worksheet.title}" with ${json.fieldCount} questions!`
        )
      );
      setMatrixOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["teacher-worksheets"] });
      router.push(`/teacher/worksheets/${json.worksheet.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setMatrixGenerating(false);
    }
  };

  const items = data?.items ?? [];
  const topicOptions = data?.facets.topicTags ?? [];

  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#0B1C30] dark:text-slate-100">
            {tr("Ngân hàng câu hỏi", "Question Bank")}
          </h1>
          <p className="mt-1 text-sm text-[#464555] dark:text-slate-400">
            {tr(
              "Quản lý câu hỏi theo chủ đề, độ khó và sinh đề thi ngẫu nhiên theo ma trận.",
              "Manage reusable questions by topic and difficulty, and generate randomized exams from matrices."
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button type="button" variant="outline" className="min-h-10" data-testid="open-standard-import" onClick={() => setImportOpen(true)}>
            <FileUp className="h-4 w-4 text-[#4F46E5]" />
            {tr("Nhập Aiken / Moodle / Quizizz", "Import Aiken / Moodle / Quizizz")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-10"
            data-testid="open-matrix-btn"
            onClick={() => setMatrixOpen(true)}
          >
            <Wand2 className="h-4 w-4 text-[#4F46E5]" />
            {tr("Tạo đề từ ma trận", "Generate from matrix")}
          </Button>
          <Button
            type="button"
            variant="accent"
            className="min-h-10"
            data-testid="add-bank-item-btn"
            onClick={openCreateModal}
          >
            <Plus className="h-4 w-4" />
            {tr("Thêm câu hỏi", "Add question")}
          </Button>
        </div>
      </div>

      {/* Multi-dimensional Filters */}
      <div className="stitch-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "all", label: tr("Tất cả khả dụng", "All accessible") },
              { id: "mine", label: tr("Câu của tôi", "My questions") },
              { id: "shared", label: tr("Được chia sẻ", "Shared") },
            ] as const
          ).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScope(s.id)}
              className={`min-h-10 rounded-xl border px-3.5 text-xs font-semibold transition ${
                scope === s.id
                  ? "border-[#4F46E5] bg-[#EEF2FF] text-[#3525CD] dark:bg-indigo-950/60 dark:text-indigo-300"
                  : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-7">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr("Tìm nội dung, chủ đề…", "Search prompt, topic…")}
              className="pl-9 h-10 text-xs"
            />
          </div>

          <select
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            aria-label={tr("Môn học", "Subject")}
            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs outline-none focus:border-[#4F46E5]"
          >
            <option value="">{tr("Tất cả môn", "All subjects")}</option>
            {WORKSHEET_SUBJECTS.map((s) => {
              const meta = getSubjectMeta(s);
              return (
                <option key={s} value={s}>
                  {locale === "en" ? meta.labelEn : meta.labelVi}
                </option>
              );
            })}
          </select>

          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label={tr("Loại câu", "Type")}
            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs outline-none focus:border-[#4F46E5]"
          >
            <option value="">{tr("Tất cả dạng câu", "All types")}</option>
            {SUPPORTED_BANK_TYPES.map((t) => (
              <option key={t} value={t}>
                {vi.worksheets.tools[t] ?? t}
              </option>
            ))}
          </select>

          <select
            value={topicTag}
            onChange={(e) => setTopicTag(e.target.value)}
            aria-label={tr("Chủ đề", "Topic")}
            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs outline-none focus:border-[#4F46E5]"
          >
            <option value="">{tr("Tất cả chủ đề", "All topics")}</option>
            {topicOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            value={skillTag}
            onChange={(e) => setSkillTag(e.target.value)}
            aria-label={tr("Kỹ năng", "Skill")}
            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs outline-none focus:border-[#4F46E5]"
          >
            <option value="">{tr("Mọi kỹ năng", "All skills")}</option>
            {SKILL_OPTIONS.map((sk) => (
              <option key={sk} value={sk}>
                {vi.skills[sk]}
              </option>
            ))}
          </select>

          <select
            value={difficultyMin && difficultyMax ? `${difficultyMin}-${difficultyMax}` : ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                setDifficultyMin("");
                setDifficultyMax("");
              } else {
                const [lo, hi] = v.split("-");
                setDifficultyMin(lo ?? "");
                setDifficultyMax(hi ?? "");
              }
            }}
            aria-label={tr("Độ khó", "Difficulty")}
            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-xs outline-none focus:border-[#4F46E5]"
          >
            <option value="">{tr("Mọi độ khó", "All difficulties")}</option>
            <option value="1-2">{tr("1–2★ Nhận biết / Thông hiểu", "1–2★ Easy")}</option>
            <option value="3-3">{tr("3★ Vận dụng", "3★ Medium")}</option>
            <option value="4-5">{tr("4–5★ Vận dụng cao", "4–5★ Hard")}</option>
          </select>
        </div>
      </div>

      {/* Question Bank List */}
      {isLoading ? (
        <div className="stitch-card flex items-center justify-center gap-2 py-12 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {vi.common.loading}
        </div>
      ) : items.length === 0 ? (
        <div className="stitch-card p-12 text-center space-y-3">
          <BookOpen className="mx-auto h-10 w-10 text-slate-300" />
          <p className="text-sm font-semibold text-[#0B1C30] dark:text-slate-100">
            {tr("Chưa có câu hỏi nào phù hợp bộ lọc.", "No questions match the current filters.")}
          </p>
        </div>
      ) : (
        <div className="space-y-3" data-testid="question-bank-list">
          {items.map((it) => (
            <div
              key={it.id}
              data-testid={`bank-item-${it.id}`}
              className="stitch-card p-4 sm:p-5 flex flex-wrap items-start justify-between gap-4"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <SubjectBadge subject={it.subject} />
                  <Badge variant="indigo">{vi.worksheets.tools[it.type] ?? it.type}</Badge>
                  {it.topicTag && <Badge variant="neutral">{it.topicTag}</Badge>}
                  {it.level && <Badge variant="sky">{it.level}</Badge>}
                  <Badge variant="orange" className="gap-0.5 tabular-nums">
                    {Array.from({ length: it.difficulty }).map((_, i) => (
                      <Star key={i} className="h-2.5 w-2.5 fill-current" />
                    ))}
                  </Badge>
                  {it.isShared && (
                    <Badge variant="mint" className="gap-1">
                      <Globe className="h-3 w-3" />
                      {tr("Chia sẻ", "Shared")}
                    </Badge>
                  )}
                </div>

                <PromptText
                  text={it.prompt}
                  className="text-sm font-semibold text-[#0B1C30] dark:text-slate-100"
                />

                {Array.isArray(it.options) && it.options.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    {it.options.map((o) => (
                      <span
                        key={o.id}
                        className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-0.5"
                      >
                        <strong>{o.id}.</strong> {o.text}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span>{tr("Tác giả:", "Author:")} {it.owner.name}</span>
                  {it.tags.map((tag) => (
                    <span key={tag} className="rounded bg-indigo-50 dark:bg-indigo-950/40 px-1.5 py-0.5 text-[#3525CD] dark:text-indigo-300">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-10"
                  onClick={() => openEditModal(it)}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  {tr("Sửa", "Edit")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-10 text-red-600 hover:bg-red-50"
                  onClick={() => setDeletingItem(it)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Question Bank Item Dialog */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent
          data-testid="bank-item-dialog"
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              {editingItem
                ? tr("Sửa câu hỏi trong ngân hàng", "Edit Bank Question")
                : tr("Thêm câu hỏi vào ngân hàng", "Add Question to Bank")}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveItem} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{tr("Môn học", "Subject")}</Label>
                <SubjectPicker value={formSubject} onChange={setFormSubject} />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Dạng câu hỏi", "Question type")}</Label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as FieldType)}
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                >
                  {SUPPORTED_BANK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {vi.worksheets.tools[t] ?? t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{tr("Nội dung câu hỏi (hỗ trợ KaTeX $...$)", "Prompt (supports KaTeX $...$)")}</Label>
              <Textarea
                required
                rows={3}
                data-testid="bank-item-prompt-input"
                value={formPrompt}
                onChange={(e) => setFormPrompt(e.target.value)}
              />
            </div>

            {(formType === "MULTIPLE_CHOICE" || formType === "MULTI_SELECT") && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                <Input value={formOptA} onChange={(e) => setFormOptA(e.target.value)} placeholder="A..." />
                <Input value={formOptB} onChange={(e) => setFormOptB(e.target.value)} placeholder="B..." />
                <Input value={formOptC} onChange={(e) => setFormOptC(e.target.value)} placeholder="C..." />
                <Input value={formOptD} onChange={(e) => setFormOptD(e.target.value)} placeholder="D..." />
                <div className="sm:col-span-2 flex items-center gap-2 pt-1">
                  <Label className="text-xs">{tr("Đáp án đúng:", "Correct option:")}</Label>
                  <Input
                    value={formCorrectMC}
                    onChange={(e) => setFormCorrectMC(e.target.value)}
                    placeholder={formType === "MULTI_SELECT" ? "A,C" : "A"}
                    className="h-9 w-32 text-xs uppercase"
                  />
                </div>
              </div>
            )}

            {(formType === "TEXT" || formType === "NUMBER") && (
              <div className="space-y-1.5">
                <Label>
                  {formType === "TEXT"
                    ? tr("Đáp án chấp nhận (cách nhau bởi dấu ;)", "Accepted answers (separated by ;)")
                    : tr("Giá trị số đúng", "Numeric answer")}
                </Label>
                <Input
                  value={formCorrectText}
                  onChange={(e) => setFormCorrectText(e.target.value)}
                  placeholder={formType === "TEXT" ? "has lived; have lived" : "42"}
                />
              </div>
            )}

            {formType === "TRUE_FALSE" && (
              <div className="flex items-center gap-3">
                <Label>{tr("Đáp án Đúng/Sai:", "True/False answer:")}</Label>
                <select
                  value={formCorrectTF ? "true" : "false"}
                  onChange={(e) => setFormCorrectTF(e.target.value === "true")}
                  className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                >
                  <option value="true">{tr("Đúng (True)", "True")}</option>
                  <option value="false">{tr("Sai (False)", "False")}</option>
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>{tr("Chủ đề kiến thức", "Topic tag")}</Label>
                <Input
                  value={formTopicTag}
                  onChange={(e) => setFormTopicTag(e.target.value)}
                  placeholder={tr("VD: Ngữ pháp", "e.g. Grammar")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Trình độ", "Level")}</Label>
                <Input
                  value={formLevel}
                  onChange={(e) => setFormLevel(e.target.value)}
                  placeholder="B1 / THPT"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Độ khó (1–5)", "Difficulty (1–5)")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  step={1}
                  value={formDifficulty}
                  onChange={(e) =>
                    setFormDifficulty(Math.max(1, Math.min(5, Math.floor(Number(e.target.value) || 3))))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{tr("Kỹ năng (tuỳ chọn)", "Skill (optional)")}</Label>
                <select
                  value={formSkillTag}
                  onChange={(e) => setFormSkillTag(e.target.value as SkillTag | "")}
                  className="h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm"
                >
                  <option value="">{tr("Không gắn", "None")}</option>
                  {SKILL_OPTIONS.map((sk) => (
                    <option key={sk} value={sk}>
                      {vi.skills[sk]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Thẻ (cách bởi dấu phẩy)", "Tags (comma-separated)")}</Label>
                <Input
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="tenses, grade12"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{tr("Giải thích đáp án (tuỳ chọn)", "Explanation (optional)")}</Label>
              <Input
                value={formExplanation}
                onChange={(e) => setFormExplanation(e.target.value)}
              />
            </div>

            <label className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <div>
                <p className="text-sm font-semibold">{tr("Chia sẻ cho giáo viên khác", "Share with other teachers")}</p>
                <p className="text-xs text-slate-400">
                  {tr("Cho phép đồng nghiệp xem và bốc vào ma trận đề.", "Allows colleagues to browse and pick in matrices.")}
                </p>
              </div>
              <Switch checked={formShared} onCheckedChange={setFormShared} />
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-10" onClick={() => setItemDialogOpen(false)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" variant="accent" className="min-h-10" disabled={savingItem}>
                {savingItem ? tr("Đang lưu…", "Saving…") : tr("Lưu câu hỏi", "Save question")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deletingItem)} onOpenChange={(o) => !o && setDeletingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Xoá câu hỏi khỏi ngân hàng?", "Delete question from bank?")}</DialogTitle>
            <DialogDescription>
              {tr("Thao tác này ẩn câu hỏi khỏi ngân hàng câu hỏi (không ảnh hưởng đề đã giao).", "Removes the question from the bank without affecting existing worksheets.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-10" onClick={() => setDeletingItem(null)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button type="button" variant="destructive" className="min-h-10" disabled={deleting} onClick={() => void handleConfirmDelete()}>
              {deleting ? tr("Đang xoá…", "Deleting…") : tr("Xoá", "Delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Matrix Generator Dialog */}
      <Dialog open={matrixOpen} onOpenChange={setMatrixOpen}>
        <DialogContent
          data-testid="matrix-generator-dialog"
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#4F46E5]" />
              {tr("Tạo đề ngẫu nhiên từ Ma trận", "Generate Worksheet from Exam Matrix")}
            </DialogTitle>
            <DialogDescription>
              {tr(
                "Chọn tiêu chí cho từng dòng ma trận. Hệ thống bốc ngẫu nhiên không trùng lặp và tạo thành Phiếu bài tập mới.",
                "Specify criteria per matrix row. The engine draws non-overlapping random questions into a new worksheet."
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleGenerateWorksheet} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="matrix-ws-title">{tr("Tên phiếu bài tập mới", "New worksheet title")}</Label>
                <Input
                  id="matrix-ws-title"
                  data-testid="matrix-ws-title"
                  required
                  value={matrixTitle}
                  onChange={(e) => setMatrixTitle(e.target.value)}
                  placeholder={tr("VD: Đề kiểm tra 15p Tiếng Anh", "e.g. English 15-min Quiz")}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Môn học của đề", "Worksheet subject")}</Label>
                <SubjectPicker value={matrixSubject} onChange={setMatrixSubject} />
              </div>
            </div>

            <label className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 py-2.5 text-xs">
              <span className="font-semibold">{tr("Gồm cả câu hỏi được chia sẻ từ đồng nghiệp", "Include shared questions from colleagues")}</span>
              <Switch checked={matrixIncludeShared} onCheckedChange={setMatrixIncludeShared} />
            </label>

            <div className="space-y-2.5">
              {matrixRows.map((row, idx) => {
                const avail = matrixPreview?.rowCounts[idx];
                const insufficient =
                  avail !== undefined && avail < row.count;
                return (
                  <div
                    key={idx}
                    data-testid={`matrix-row-${idx}`}
                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8F9FF] dark:bg-slate-800/40 p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-[#3525CD] dark:text-indigo-300">
                        {tr(`Dòng ma trận #${idx + 1}`, `Matrix Row #${idx + 1}`)}
                      </span>
                      <div className="flex items-center gap-2">
                        {avail !== undefined && (
                          <Badge variant={insufficient ? "danger" : "mint"}>
                            {tr("Khả dụng:", "Available:")} {avail}
                          </Badge>
                        )}
                        {matrixRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setMatrixRows((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-slate-400 hover:text-red-500"
                            aria-label={tr("Xoá dòng", "Remove row")}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                      <select
                        value={row.subject}
                        onChange={(e) =>
                          setMatrixRows((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, subject: e.target.value as WorksheetSubject | "" } : r
                            )
                          )
                        }
                        className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
                      >
                        <option value="">{tr("Mọi môn", "Any subj")}</option>
                        {WORKSHEET_SUBJECTS.map((s) => {
                          const meta = getSubjectMeta(s);
                          return (
                            <option key={s} value={s}>
                              {locale === "en" ? meta.labelEn : meta.labelVi}
                            </option>
                          );
                        })}
                      </select>

                      <select
                        value={row.type}
                        onChange={(e) =>
                          setMatrixRows((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, type: e.target.value as FieldType | "" } : r
                            )
                          )
                        }
                        className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs"
                      >
                        <option value="">{tr("Mọi dạng", "Any type")}</option>
                        {SUPPORTED_BANK_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {vi.worksheets.tools[t] ?? t}
                          </option>
                        ))}
                      </select>

                      <Input
                        value={row.topicTag}
                        onChange={(e) =>
                          setMatrixRows((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, topicTag: e.target.value } : r))
                          )
                        }
                        placeholder={tr("Chủ đề (vd: Ngữ pháp)", "Topic tag")}
                        className="h-9 text-xs sm:col-span-2"
                        data-testid={`matrix-row-topic-${idx}`}
                      />

                      <Input
                        type="number"
                        min={1}
                        max={100}
                        step={1}
                        value={row.count}
                        onChange={(e) =>
                          setMatrixRows((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, count: Math.max(1, Math.floor(Number(e.target.value) || 1)) } : r
                            )
                          )
                        }
                        placeholder={tr("Số câu", "Count")}
                        className="h-9 text-xs"
                        data-testid={`matrix-row-count-${idx}`}
                      />

                      <Input
                        type="number"
                        min={0.5}
                        max={100}
                        step={0.5}
                        value={row.points}
                        onChange={(e) =>
                          setMatrixRows((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, points: Math.max(0.5, Number(e.target.value) || 1) } : r
                            )
                          )
                        }
                        placeholder={tr("Điểm/câu", "Pts")}
                        className="h-9 text-xs"
                      />
                    </div>
                  </div>
                );
              })}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10"
                data-testid="matrix-add-row-btn"
                onClick={() =>
                  setMatrixRows((prev) => [
                    ...prev,
                    {
                      subject: matrixSubject,
                      type: "",
                      topicTag: "",
                      difficultyMin: "1",
                      difficultyMax: "5",
                      count: 2,
                      points: 1,
                    },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                {tr("Thêm dòng ma trận", "Add matrix row")}
              </Button>
            </div>

            {matrixPreview && !matrixPreview.canGenerate && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                {tr(
                  "Kho câu hỏi chưa đủ câu cho ma trận hiện tại (chú ý các dòng không trùng câu).",
                  "Not enough unique questions in the bank to satisfy every matrix row."
                )}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" className="min-h-10" onClick={() => setMatrixOpen(false)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button
                type="submit"
                variant="accent"
                className="min-h-10"
                data-testid="matrix-generate-submit"
                disabled={matrixGenerating || !matrixTitle.trim() || (matrixPreview !== null && !matrixPreview.canGenerate)}
              >
                {matrixGenerating ? tr("Đang tạo đề…", "Generating…") : tr("Tạo đề từ ma trận", "Generate worksheet")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <StandardImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        target="BANK"
        onDone={() => void queryClient.invalidateQueries({ queryKey: ["question-bank"] })}
      />
    </div>
  );
}
