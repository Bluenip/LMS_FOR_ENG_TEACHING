"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, ScanLine } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils";
import { OMR_TEMPLATE_IDS, type OmrTemplateId } from "@/lib/omr/templates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OMR_TEMPLATE_LABELS } from "./types";

const SELECT_CLASS =
  "h-10 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 text-sm";

interface SheetRow {
  id: string;
  title: string;
  template: OmrTemplateId;
  scanCount: number;
  synced: boolean;
  createdAt: string;
}

export function OmrSheetList({ classId }: { classId: string }) {
  const { tr } = useI18n();
  const router = useRouter();
  const { data, isLoading, error } = useQuery<{ sheets: SheetRow[] }>({
    queryKey: ["omr-sheets", classId],
    queryFn: () => apiFetchJson(`/api/omr/sheets?classId=${encodeURIComponent(classId)}`),
  });
  const { data: classData } = useQuery<{ class: { name: string; assignments: Array<{ id: string; title: string }> } }>({
    queryKey: ["class-detail-lite", classId],
    queryFn: () => apiFetchJson(`/api/classes/${classId}`),
  });
  const { data: wsData } = useQuery<{ worksheets: Array<{ id: string; title: string }> }>({
    queryKey: ["worksheets", "omr-picker"],
    queryFn: () => apiFetchJson("/api/worksheets"),
  });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState<OmrTemplateId>("MC_20");
  const [source, setSource] = useState<"manual" | "assignment" | "worksheet">("manual");
  const [sourceId, setSourceId] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      const res = await apiFetchJson<{ id: string }>("/api/omr/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classId,
          title,
          template,
          assignmentId: source === "assignment" ? sourceId || null : null,
          worksheetId: source === "worksheet" ? sourceId || null : null,
        }),
      });
      router.push(`/teacher/omr/${res.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Không tạo được", "Could not create"));
      setCreating(false);
    }
  };

  return (
    <div className="space-y-5" data-testid="omr-sheet-list">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/teacher/classes/${classId}`} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
            <ArrowLeft className="h-4 w-4" /> {classData?.class.name ?? tr("Lớp học", "Class")}
          </Link>
          <h1 className="text-2xl font-bold text-[#0B1C30] dark:text-slate-100">{tr("Chấm phiếu tô giấy", "Paper bubble sheets")}</h1>
          <p className="text-sm text-slate-500">
            {tr("In phiếu, cho HS tô, rồi chụp bằng điện thoại để chấm.", "Print sheets, let students fill them, then grade with your phone camera.")}
          </p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="omr-create-open">
          <Plus className="h-4 w-4" /> {tr("Tạo bài chấm", "New sheet")}
        </Button>
      </div>

      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
      ) : error instanceof Error ? (
        <p className="text-sm text-red-600">{error.message}</p>
      ) : data && data.sheets.length === 0 ? (
        <div className="stitch-card p-10 text-center text-sm text-slate-500">
          <ScanLine className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          {tr("Chưa có bài chấm phiếu tô nào.", "No bubble-sheet exams yet.")}
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data?.sheets.map((s) => (
            <li key={s.id}>
              <Link href={`/teacher/omr/${s.id}`} className="stitch-card block space-y-1 p-4 hover:border-indigo-300">
                <p className="font-semibold text-[#0B1C30] dark:text-slate-100">{s.title}</p>
                <p className="text-xs text-slate-500">{tr(OMR_TEMPLATE_LABELS[s.template].vi, OMR_TEMPLATE_LABELS[s.template].en)}</p>
                <p className="flex items-center gap-2 text-xs text-slate-500">
                  {s.scanCount} {tr("phiếu", "scans")} · {formatDateTime(s.createdAt)}
                  {s.synced && <Badge variant="mint">{tr("Đã vào sổ", "In gradebook")}</Badge>}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="omr-create-dialog">
          <DialogHeader>
            <DialogTitle>{tr("Tạo bài chấm phiếu tô", "New bubble-sheet exam")}</DialogTitle>
            <DialogDescription>
              {tr("Đáp án lấy tự động từ bài đã giao / phiếu bài tập, hoặc nhập tay sau.", "Take the key from an assignment / worksheet, or type it in afterwards.")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="omr-title">{tr("Tiêu đề", "Title")}</Label>
              <Input id="omr-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} data-testid="omr-title-input" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="omr-template">{tr("Mẫu phiếu", "Sheet layout")}</Label>
              <select id="omr-template" className={SELECT_CLASS} value={template} onChange={(e) => setTemplate(e.target.value as OmrTemplateId)} data-testid="omr-template-select">
                {OMR_TEMPLATE_IDS.map((id) => (
                  <option key={id} value={id}>
                    {tr(OMR_TEMPLATE_LABELS[id].vi, OMR_TEMPLATE_LABELS[id].en)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="omr-source">{tr("Lấy đáp án từ", "Answer key from")}</Label>
              <select
                id="omr-source"
                className={SELECT_CLASS}
                value={source}
                onChange={(e) => {
                  setSource(e.target.value as typeof source);
                  setSourceId("");
                }}
              >
                <option value="manual">{tr("Nhập tay", "Type it in")}</option>
                <option value="assignment">{tr("Bài đã giao của lớp (kèm mã đề)", "Class assignment (with exam codes)")}</option>
                <option value="worksheet">{tr("Phiếu bài tập", "Worksheet")}</option>
              </select>
            </div>
            {source !== "manual" && (
              <select className={SELECT_CLASS} value={sourceId} onChange={(e) => setSourceId(e.target.value)} aria-label={tr("Nguồn đáp án", "Key source")}>
                <option value="">{tr("— Chọn —", "— Pick —")}</option>
                {(source === "assignment" ? classData?.class.assignments ?? [] : wsData?.worksheets ?? []).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {tr("Huỷ", "Cancel")}
            </Button>
            <Button onClick={() => void create()} disabled={creating || !title.trim() || (source !== "manual" && !sourceId)} data-testid="omr-create-submit">
              {creating && <Loader2 className="h-4 w-4 animate-spin" />}
              {tr("Tạo", "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
