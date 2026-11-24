"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, BookOpen, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@prisma/client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
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

export interface TransferOwnershipTarget {
  id: string;
  name: string;
  email: string;
}

interface OwnedContentPayload {
  user: { id: string; name: string; email: string; role: Role };
  classes: Array<{
    id: string;
    name: string;
    joinCode: string;
    archived: boolean;
    _count: { enrollments: number; assignments: number; lessons: number };
  }>;
  worksheets: Array<{
    id: string;
    title: string;
    isShared: boolean;
    _count: { fields: number; assignments: number };
  }>;
  eligibleRecipients: Array<{ id: string; name: string; email: string; role: Role }>;
}

export function TransferOwnershipDialog({
  target,
  onClose,
  onTransferred,
}: {
  target: TransferOwnershipTarget | null;
  onClose: () => void;
  onTransferred: () => void;
}) {
  const { m, tr } = useI18n();
  const [payload, setPayload] = useState<OwnedContentPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [toUserId, setToUserId] = useState("");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedWorksheetIds, setSelectedWorksheetIds] = useState<string[]>([]);
  const [confirmStep, setConfirmStep] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setPayload(null);
    setToUserId("");
    setSelectedClassIds([]);
    setSelectedWorksheetIds([]);
    setConfirmStep(false);
    setSubmitting(false);
    if (!target) return;

    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/users/${target.id}/owned-content`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? m.common.errorGeneric);
        return json as OwnedContentPayload;
      })
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        setSelectedClassIds(data.classes.map((c) => c.id));
        setSelectedWorksheetIds(data.worksheets.map((w) => w.id));
        if (data.eligibleRecipients.length === 1) {
          setToUserId(data.eligibleRecipients[0]!.id);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : m.common.errorGeneric);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target, m.common.errorGeneric]);

  const totalOwned = (payload?.classes.length ?? 0) + (payload?.worksheets.length ?? 0);
  const totalSelected = selectedClassIds.length + selectedWorksheetIds.length;
  const allSelected =
    totalOwned > 0 &&
    selectedClassIds.length === (payload?.classes.length ?? 0) &&
    selectedWorksheetIds.length === (payload?.worksheets.length ?? 0);

  const recipient = payload?.eligibleRecipients.find((r) => r.id === toUserId) ?? null;

  const toggleAll = () => {
    if (!payload) return;
    if (allSelected) {
      setSelectedClassIds([]);
      setSelectedWorksheetIds([]);
    } else {
      setSelectedClassIds(payload.classes.map((c) => c.id));
      setSelectedWorksheetIds(payload.worksheets.map((w) => w.id));
    }
  };

  const toggleClass = (id: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleWorksheet = (id: string) => {
    setSelectedWorksheetIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleConfirmTransfer = async () => {
    if (!target || !toUserId || totalSelected === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${target.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toUserId,
          transferAll: allSelected,
          classIds: selectedClassIds,
          worksheetIds: selectedWorksheetIds,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? m.common.errorGeneric);
        setConfirmStep(false);
        return;
      }
      toast.success(
        tr(
          `Đã chuyển ${json.transferredClasses} lớp và ${json.transferredWorksheets} worksheet sang ${recipient?.name ?? "giáo viên mới"}.`,
          `Transferred ${json.transferredClasses} class(es) and ${json.transferredWorksheets} worksheet(s) to ${recipient?.name ?? "the new teacher"}.`
        )
      );
      onTransferred();
      onClose();
    } catch {
      toast.error(m.common.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#0B1C30]">
            <ArrowRightLeft className="h-5 w-5 text-[#4F46E5]" />
            {tr("Chuyển quyền sở hữu dữ liệu", "Transfer data ownership")}
          </DialogTitle>
          {target && (
            <DialogDescription>
              {tr("Từ:", "From:")} {target.name} ({target.email})
            </DialogDescription>
          )}
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">{m.common.loading}</div>
        ) : !payload ? (
          <div className="py-6 text-center text-sm text-slate-400">{m.common.noData}</div>
        ) : totalOwned === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-[#F8F9FF] p-4 text-sm text-[#464555]">
            {tr(
              "Tài khoản này hiện không sở hữu lớp học hay worksheet nào.",
              "This account currently does not own any classes or worksheets."
            )}
          </div>
        ) : confirmStep ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-indigo-200 bg-[#EEF2FF] p-4 text-sm text-[#0B1C30] space-y-2">
              <p className="font-bold flex items-center gap-2 text-[#3525CD]">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {tr("Xác nhận chuyển quyền sở hữu", "Confirm ownership transfer")}
              </p>
              <p className="text-xs text-[#464555]">
                {tr(
                  `Chuyển ${selectedClassIds.length} lớp học và ${selectedWorksheetIds.length} worksheet từ ${payload.user.name} sang ${recipient?.name ?? ""} (${recipient?.email ?? ""}).`,
                  `Transfer ${selectedClassIds.length} class(es) and ${selectedWorksheetIds.length} worksheet(s) from ${payload.user.name} to ${recipient?.name ?? ""} (${recipient?.email ?? ""}).`
                )}
              </p>
              <p className="text-xs text-[#464555]">
                {tr(
                  "Bài đã giao, bài nộp và bài giảng của các lớp được chọn sẽ chuyển theo lớp. File trên Google Drive giữ nguyên vị trí và cập nhật chủ sở hữu trong hệ thống.",
                  "Assignments, submissions, and lessons of selected classes move with the class. Google Drive files remain in place and update owner metadata in the database."
                )}
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-[40px]"
                disabled={submitting}
                onClick={() => setConfirmStep(false)}
              >
                {m.common.back}
              </Button>
              <Button
                type="button"
                className="min-h-[40px]"
                disabled={submitting}
                onClick={() => void handleConfirmTransfer()}
              >
                {submitting
                  ? tr("Đang chuyển…", "Transferring…")
                  : tr("Xác nhận chuyển", "Confirm transfer")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="transfer-recipient" className="text-xs">
                {tr("Chuyển sang giáo viên / quản trị viên nhận", "Transfer to recipient teacher / admin")}
              </Label>
              <select
                id="transfer-recipient"
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#4F46E5]"
              >
                <option value="">
                  {tr("— Chọn người nhận —", "— Select recipient —")}
                </option>
                {payload.eligibleRecipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.email}) · {m.roles[r.role]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-[#F8F9FF] px-3.5 py-2.5">
              <span className="text-xs font-semibold text-[#0B1C30]">
                {tr(
                  `Đã chọn ${selectedClassIds.length}/${payload.classes.length} lớp · ${selectedWorksheetIds.length}/${payload.worksheets.length} worksheet`,
                  `Selected ${selectedClassIds.length}/${payload.classes.length} classes · ${selectedWorksheetIds.length}/${payload.worksheets.length} worksheets`
                )}
              </span>
              <Button
                type="button"
                size="sm"
                variant={allSelected ? "secondary" : "outline"}
                className="min-h-[40px]"
                onClick={toggleAll}
              >
                {allSelected
                  ? tr("Bỏ chọn tất cả", "Deselect all")
                  : tr("Chuyển tất cả", "Select all")}
              </Button>
            </div>

            {payload.classes.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-[#464555]">
                  <BookOpen className="h-3.5 w-3.5 text-[#4F46E5]" />
                  {tr("Lớp học", "Classes")} ({payload.classes.length})
                </p>
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {payload.classes.map((cls) => {
                    const checked = selectedClassIds.includes(cls.id);
                    return (
                      <label
                        key={cls.id}
                        className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleClass(cls.id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#4F46E5]"
                        />
                        <div className="min-w-0 flex-1 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-semibold text-[#0B1C30]">{cls.name}</span>
                            {cls.archived && <Badge variant="neutral">{m.classes.archived}</Badge>}
                          </div>
                          <p className="text-slate-500">
                            {cls.joinCode} · {cls._count.enrollments} {m.common.students} ·{" "}
                            {cls._count.assignments} {tr("bài giao", "assignments")}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {payload.worksheets.length > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-[#464555]">
                  <FileText className="h-3.5 w-3.5 text-[#F97316]" />
                  {tr("Worksheets", "Worksheets")} ({payload.worksheets.length})
                </p>
                <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {payload.worksheets.map((ws) => {
                    const checked = selectedWorksheetIds.includes(ws.id);
                    return (
                      <label
                        key={ws.id}
                        className="flex cursor-pointer items-start gap-2.5 rounded-lg p-2 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleWorksheet(ws.id)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-[#4F46E5]"
                        />
                        <div className="min-w-0 flex-1 text-xs">
                          <p className="font-semibold text-[#0B1C30]">{ws.title}</p>
                          <p className="text-slate-500">
                            {ws._count.fields} {m.common.questions} · {ws._count.assignments}{" "}
                            {tr("lần giao", "assignments")}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="min-h-[40px]" onClick={onClose}>
                {m.common.cancel}
              </Button>
              <Button
                type="button"
                className="min-h-[40px]"
                disabled={!toUserId || totalSelected === 0}
                onClick={() => setConfirmStep(true)}
              >
                <ArrowRightLeft className="h-4 w-4" />
                {tr("Tiếp tục xác nhận", "Review & confirm")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
