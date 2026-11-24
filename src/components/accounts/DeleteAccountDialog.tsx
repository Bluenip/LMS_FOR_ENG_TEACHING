"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
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

export interface DeleteAccountTarget {
  id: string;
  name: string;
  email: string;
}

interface ImpactCounts {
  classesTaught: number;
  worksheets: number;
  submissions: number;
  enrollments: number;
  parentLinksAsParent: number;
  parentLinksAsChild: number;
}

export function DeleteAccountDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: DeleteAccountTarget | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { m, tr } = useI18n();
  const [counts, setCounts] = useState<ImpactCounts | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setConfirmEmail("");
    setCounts(null);
    setDeleting(false);
    if (!target) return;

    let cancelled = false;
    setLoadingImpact(true);
    fetch(`/api/admin/users/${target.id}/impact`)
      .then((r) => r.json())
      .then((json) => {
        if (!cancelled && json.user?._count) {
          setCounts(json.user._count as ImpactCounts);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoadingImpact(false);
      });

    return () => {
      cancelled = true;
    };
  }, [target]);

  const emailMatches =
    Boolean(target) &&
    confirmEmail.trim().toLowerCase() === target!.email.toLowerCase();

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || !emailMatches) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/users/${target.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: confirmEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? m.common.errorGeneric);
        return;
      }
      toast.success(tr("Đã xoá tài khoản.", "Account deleted."));
      onDeleted();
      onClose();
    } catch {
      toast.error(m.common.errorGeneric);
    } finally {
      setDeleting(false);
    }
  };

  const parentLinksTotal =
    (counts?.parentLinksAsParent ?? 0) + (counts?.parentLinksAsChild ?? 0);

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            {tr("Xoá vĩnh viễn tài khoản", "Permanently delete account")}
          </DialogTitle>
          {target && (
            <DialogDescription>
              {target.name} ({target.email})
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={handleDelete} className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 space-y-2">
            <p className="font-semibold">
              {tr(
                "Hành động này không thể hoàn tác. Dữ liệu sau sẽ bị xoá theo tài khoản:",
                "This action cannot be undone. The following linked data will also be removed:"
              )}
            </p>
            {loadingImpact ? (
              <p className="opacity-75">{m.common.loading}</p>
            ) : (
              <ul className="grid grid-cols-2 gap-1.5 font-medium tabular-nums">
                <li>
                  • {counts?.classesTaught ?? 0} {tr("lớp giảng dạy", "classes taught")}
                </li>
                <li>
                  • {counts?.worksheets ?? 0} {tr("phiếu bài tập", "worksheets")}
                </li>
                <li>
                  • {counts?.submissions ?? 0} {tr("bài nộp", "submissions")}
                </li>
                <li>
                  • {counts?.enrollments ?? 0} {tr("lớp đang học", "enrollments")}
                </li>
                <li className="col-span-2">
                  • {parentLinksTotal} {tr("liên kết phụ huynh", "parent links")}
                </li>
              </ul>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-delete-email" className="text-xs">
              {tr("Gõ lại email để xác nhận:", "Type the email to confirm:")}{" "}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-[#0B1C30]">
                {target?.email}
              </code>
            </Label>
            <Input
              id="confirm-delete-email"
              type="email"
              autoComplete="off"
              placeholder={target?.email ?? ""}
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={deleting}>
              {m.common.cancel}
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={deleting || !emailMatches}
            >
              <Trash2 className="h-4 w-4" />
              {deleting
                ? tr("Đang xoá…", "Deleting…")
                : tr("Xoá tài khoản", "Delete account")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
