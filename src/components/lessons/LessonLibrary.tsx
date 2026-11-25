"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Film,
  Headphones,
  Pencil,
  Plus,
  Search,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import type { LessonItemType } from "@prisma/client";
import { apiFetchJson } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { foldText } from "@/lib/text-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClassPicker, type ClassPickerOption } from "@/components/assignments/ClassPicker";
import type { LibraryLesson } from "./types";

type LessonSort = "updated" | "title" | "most_classes";

const ITEM_ICON: Record<LessonItemType, React.ReactNode> = {
  PDF: <FileText className="h-4 w-4" />,
  VIDEO: <Film className="h-4 w-4" />,
  AUDIO: <Headphones className="h-4 w-4" />,
  LINK: <ExternalLink className="h-4 w-4" />,
};

/**
 * Library › Lessons: chapters with materials that can be shown in many classes at once.
 * Editing here updates every class; deleting here removes the lesson from all of them.
 */
export function LessonLibrary({ isAdmin }: { isAdmin: boolean }) {
  const { m: vi, tr, locale } = useI18n();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LessonSort>("updated");

  // create / edit
  const [editing, setEditing] = useState<LibraryLesson | "new" | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [savingLesson, setSavingLesson] = useState(false);

  // materials
  const [addingTo, setAddingTo] = useState<LibraryLesson | null>(null);
  const [itemTitle, setItemTitle] = useState("");
  const [itemType, setItemType] = useState<LessonItemType>("PDF");
  const [itemUrl, setItemUrl] = useState("");
  const [itemFile, setItemFile] = useState<File | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  // classes
  const [assigning, setAssigning] = useState<LibraryLesson | null>(null);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [savingAssign, setSavingAssign] = useState(false);

  // delete
  const [deleting, setDeleting] = useState<LibraryLesson | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["lesson-library"],
    queryFn: () =>
      apiFetchJson<{ lessons: LibraryLesson[] }>(
        "/api/lessons",
        undefined,
        tr("Không tải được kho bài giảng", "Could not load the lesson library")
      ),
  });
  const { data: clsData } = useQuery({
    queryKey: ["teacher-classes"],
    queryFn: () => apiFetchJson<{ classes: ClassPickerOption[] }>("/api/classes"),
  });

  const lessons = useMemo(() => data?.lessons ?? [], [data]);
  const visible = useMemo(() => {
    const needle = foldText(query.trim());
    const rows = lessons.filter(
      (l) =>
        !needle ||
        foldText(`${l.title} ${l.description ?? ""} ${l.owner?.name ?? ""} ${l.classLinks.map((c) => c.class.name).join(" ")}`).includes(needle)
    );
    return [...rows].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "vi", { numeric: true });
      if (sort === "most_classes") return b.classLinks.length - a.classLinks.length;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [lessons, query, sort]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["lesson-library"] });

  const openEdit = (lesson: LibraryLesson | "new") => {
    setEditing(lesson);
    setFormTitle(lesson === "new" ? "" : lesson.title);
    setFormDesc(lesson === "new" ? "" : (lesson.description ?? ""));
  };

  const saveLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || formTitle.trim().length < 2) return;
    setSavingLesson(true);
    try {
      const isNew = editing === "new";
      const res = await fetch(isNew ? "/api/lessons" : `/api/lessons/${editing.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: formTitle.trim(), description: formDesc.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Không lưu được bài giảng", "Could not save the lesson"));
      toast.success(isNew ? tr("Đã tạo bài giảng.", "Lesson created.") : tr("Đã lưu thay đổi.", "Changes saved."));
      setEditing(null);
      await refresh();
      if (isNew) {
        // next natural step: add the first material
        setAddingTo(json.lesson as LibraryLesson);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setSavingLesson(false);
    }
  };

  const saveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addingTo || itemTitle.trim().length < 2) return;
    setSavingItem(true);
    try {
      const fd = new FormData();
      fd.append("title", itemTitle.trim());
      fd.append("type", itemType);
      if (itemUrl.trim()) fd.append("url", itemUrl.trim());
      if (itemFile) fd.append("file", itemFile);
      const res = await fetch(`/api/lessons/${addingTo.id}/items`, { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Không thêm được tài liệu", "Could not add the material"));
      toast.success(tr("Đã thêm tài liệu.", "Material added."));
      setAddingTo(null);
      setItemTitle("");
      setItemUrl("");
      setItemFile(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setSavingItem(false);
    }
  };

  const deleteItem = async (lessonId: string, itemId: string) => {
    const res = await fetch(`/api/lessons/${lessonId}/items/${itemId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(tr("Đã xoá tài liệu.", "Material deleted."));
      await refresh();
    } else {
      toast.error(tr("Không xoá được tài liệu.", "Could not delete the material."));
    }
  };

  const openAssign = (lesson: LibraryLesson) => {
    setAssigning(lesson);
    setAssignIds(lesson.classLinks.map((c) => c.class.id));
  };

  const saveAssign = async () => {
    if (!assigning) return;
    setSavingAssign(true);
    try {
      const res = await fetch(`/api/lessons/${assigning.id}/classes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classIds: assignIds }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? tr("Không cập nhật được lớp", "Could not update classes"));
      toast.success(
        tr(
          `Đã cập nhật: thêm ${json.added} lớp, gỡ ${json.removed} lớp.`,
          `Updated: added ${json.added}, removed ${json.removed} class(es).`
        )
      );
      setAssigning(null);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : vi.common.errorGeneric);
    } finally {
      setSavingAssign(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const res = await fetch(`/api/lessons/${deleting.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success(tr("Đã xoá bài giảng khỏi kho và mọi lớp.", "Lesson deleted from the library and all classes."));
      setDeleting(null);
      setDeleteConfirm("");
      await refresh();
    } else {
      toast.error(tr("Không xoá được bài giảng.", "Could not delete the lesson."));
    }
  };

  // classes the actor manages (assigning only touches these)
  const classOptions = clsData?.classes ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block flex-1">
          <span className="sr-only">{tr("Tìm bài giảng", "Search lessons")}</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Tìm theo tên chương, mô tả, lớp…", "Search by title, description, class…")}
            className="h-10 pl-9"
          />
        </label>
        <select
          aria-label={tr("Sắp xếp bài giảng", "Sort lessons")}
          value={sort}
          onChange={(e) => setSort(e.target.value as LessonSort)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0B1C30] focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 sm:w-52"
        >
          <option value="updated">{tr("Cập nhật mới nhất", "Recently updated")}</option>
          <option value="title">{tr("Tên (A→Z)", "Title (A→Z)")}</option>
          <option value="most_classes">{tr("Dùng ở nhiều lớp nhất", "Used in most classes")}</option>
        </select>
        <Button variant="accent" onClick={() => openEdit("new")} className="min-h-10">
          <Plus className="h-4 w-4" />
          {tr("Tạo bài giảng", "New lesson")}
        </Button>
      </div>

      {isLoading ? (
        <div className="stitch-card p-12 text-center text-sm text-slate-400">{vi.common.loading}</div>
      ) : lessons.length === 0 ? (
        <div className="stitch-card space-y-3 p-12 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-indigo-300" />
          <p className="text-sm text-slate-500">
            {tr(
              "Chưa có bài giảng nào. Tạo một chương (PDF, video, file nghe, liên kết) rồi giao cho bao nhiêu lớp cũng được.",
              "No lessons yet. Create a chapter (PDF, video, audio, links) and give it to as many classes as you like."
            )}
          </p>
          <Button variant="accent" onClick={() => openEdit("new")}>
            <Plus className="h-4 w-4" />
            {tr("Tạo bài giảng đầu tiên", "Create your first lesson")}
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="stitch-card p-10 text-center text-sm text-slate-500">
          {tr("Không có bài giảng nào khớp từ khoá.", "No lessons match your search.")}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map((lesson) => (
            <article key={lesson.id} className="stitch-card-hover flex flex-col gap-4 p-5" data-testid="library-lesson">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-[#0B1C30]">{lesson.title}</h3>
                  {lesson.description && <p className="mt-0.5 text-xs text-[#464555]">{lesson.description}</p>}
                  <p className="mt-1 text-[11px] text-slate-500">
                    {isAdmin && lesson.owner && `${lesson.owner.name} · `}
                    {tr("Cập nhật", "Updated")} {formatDateTime(lesson.updatedAt, locale)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={tr("Sửa tên bài giảng", "Rename lesson")}
                    onClick={() => openEdit(lesson)}
                  >
                    <Pencil className="h-4 w-4 text-slate-500" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={tr("Xoá bài giảng", "Delete lesson")}
                    onClick={() => {
                      setDeleting(lesson);
                      setDeleteConfirm("");
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-slate-400" />
                  </Button>
                </div>
              </div>

              {lesson.items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs text-[#464555]">
                  {tr("Chưa có tài liệu.", "No materials yet.")}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {lesson.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex min-h-11 items-center gap-2.5 rounded-lg border border-slate-200/80 bg-[#F8F9FF] px-2.5 py-1.5"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#EEF2FF] text-[#4F46E5]">
                        {ITEM_ICON[item.type]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-[#0B1C30]">{item.title}</span>
                        <span className="text-[11px] text-slate-500">{vi.lessons.types[item.type]}</span>
                      </span>
                      {(item.fileKey || item.url) && (
                        <a
                          href={item.fileKey ? `/api/files/${item.fileKey}` : (item.url ?? "#")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-[#3525CD]"
                          aria-label={tr("Mở tài liệu", "Open material")}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => void deleteItem(lesson.id, item.id)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-white hover:text-red-600"
                        aria-label={tr("Xoá tài liệu", "Delete material")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                {lesson.classLinks.length === 0 ? (
                  <span className="text-xs text-[#464555]">{tr("Chưa giao cho lớp nào", "Not given to any class")}</span>
                ) : (
                  lesson.classLinks.map((c) => (
                    <Badge key={c.class.id} variant={c.class.archived ? "neutral" : "default"}>
                      {c.class.name}
                    </Badge>
                  ))
                )}
              </div>

              <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <Button size="sm" variant="outline" onClick={() => setAddingTo(lesson)}>
                  <Plus className="h-3.5 w-3.5" />
                  {vi.lessons.addItem}
                </Button>
                <Button size="sm" onClick={() => openAssign(lesson)}>
                  <Send className="h-3.5 w-3.5" />
                  {tr("Giao cho lớp", "Give to classes")}
                  {lesson.classLinks.length > 0 && ` (${lesson.classLinks.length})`}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Create / rename */}
      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? tr("Tạo bài giảng mới", "New lesson") : tr("Sửa bài giảng", "Edit lesson")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveLesson} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-title">{tr("Tên chương", "Chapter title")}</Label>
              <Input
                id="lesson-title"
                required
                minLength={2}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={tr("VD: Chương 2: Passive Voice & Reading", "e.g. Chapter 2: Passive Voice & Reading")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lesson-desc">{tr("Mô tả ngắn (tuỳ chọn)", "Short description (optional)")}</Label>
              <Input id="lesson-desc" value={formDesc} onChange={(e) => setFormDesc(e.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" disabled={savingLesson || formTitle.trim().length < 2}>
                {savingLesson ? tr("Đang lưu…", "Saving…") : tr("Lưu", "Save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add material */}
      <Dialog open={Boolean(addingTo)} onOpenChange={(o) => !o && setAddingTo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {vi.lessons.addItem}: {addingTo?.title}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={saveItem} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="item-title">{vi.lessons.itemTitle}</Label>
              <Input
                id="item-title"
                required
                minLength={2}
                value={itemTitle}
                onChange={(e) => setItemTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-type">{vi.lessons.itemType}</Label>
              <select
                id="item-type"
                value={itemType}
                onChange={(e) => setItemType(e.target.value as LessonItemType)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0B1C30]"
              >
                <option value="PDF">{vi.lessons.types.PDF}</option>
                <option value="VIDEO">{vi.lessons.types.VIDEO}</option>
                <option value="AUDIO">{vi.lessons.types.AUDIO}</option>
                <option value="LINK">{vi.lessons.types.LINK}</option>
              </select>
            </div>
            {itemType !== "LINK" && (
              <div className="space-y-1.5">
                <Label htmlFor="item-file">{tr("Tải file lên", "Upload a file")}</Label>
                <input
                  id="item-file"
                  type="file"
                  accept={
                    itemType === "PDF" ? "application/pdf" : itemType === "VIDEO" ? "video/mp4,video/webm" : "audio/*"
                  }
                  onChange={(e) => setItemFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-[#464555] file:mr-3 file:min-h-9 file:rounded-lg file:border-0 file:bg-[#EEF2FF] file:px-3 file:text-xs file:font-semibold file:text-[#3525CD]"
                />
                {itemType === "VIDEO" && (
                  <p className="text-[11px] text-[#464555]">
                    {tr(
                      "Video lớn nên dán link YouTube / Google Drive bên dưới, hoặc tải lên từ trang lớp (có tải thẳng lên Drive).",
                      "For large videos paste a YouTube / Google Drive link below, or upload from the class page (direct Drive upload)."
                    )}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="item-url">
                {itemType === "LINK" ? tr("Đường dẫn", "URL") : tr("Hoặc đường dẫn (tuỳ chọn)", "Or a URL (optional)")}
              </Label>
              <Input
                id="item-url"
                type="url"
                value={itemUrl}
                onChange={(e) => setItemUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddingTo(null)}>
                {tr("Huỷ", "Cancel")}
              </Button>
              <Button type="submit" disabled={savingItem || itemTitle.trim().length < 2 || (!itemFile && !itemUrl.trim())}>
                {savingItem ? tr("Đang tải lên…", "Uploading…") : tr("Thêm tài liệu", "Add material")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Give to classes */}
      <Dialog open={Boolean(assigning)} onOpenChange={(o) => !o && setAssigning(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {tr("Giao bài giảng cho lớp", "Give lesson to classes")}: {assigning?.title}
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[#464555]">
            {tr(
              "Tích các lớp sẽ thấy bài giảng này; bỏ tích để gỡ khỏi lớp. Sửa bài giảng sau này sẽ tự cập nhật ở mọi lớp.",
              "Tick the classes that should see this lesson; untick to remove it. Later edits update every class."
            )}
          </p>
          <ClassPicker classes={classOptions} value={assignIds} onChange={setAssignIds} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigning(null)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button onClick={saveAssign} disabled={savingAssign}>
              {savingAssign ? tr("Đang lưu…", "Saving…") : tr(`Lưu (${assignIds.length} lớp)`, `Save (${assignIds.length} classes)`)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete everywhere: type the title to confirm */}
      <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tr("Xoá bài giảng?", "Delete lesson?")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[#464555]">
            {deleting && deleting.classLinks.length > 0
              ? tr(
                  `Bài giảng sẽ bị xoá khỏi kho và khỏi ${deleting.classLinks.length} lớp đang dùng, kèm toàn bộ file. Không thể hoàn tác.`,
                  `The lesson and all its files will be deleted from the library and from ${deleting.classLinks.length} class(es). This cannot be undone.`
                )
              : tr("Bài giảng và toàn bộ file sẽ bị xoá. Không thể hoàn tác.", "The lesson and all its files will be deleted. This cannot be undone.")}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="delete-confirm">{tr("Gõ lại tên bài giảng để xác nhận", "Type the lesson title to confirm")}</Label>
            <Input
              id="delete-confirm"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={deleting?.title}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={!deleting || deleteConfirm.trim() !== deleting.title.trim()}
              onClick={confirmDelete}
            >
              {tr("Xoá vĩnh viễn", "Delete permanently")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
