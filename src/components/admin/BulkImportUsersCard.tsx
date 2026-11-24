"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@prisma/client";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PreviewRowError {
  code: string;
  message: string;
}

interface PreviewRow {
  rowNumber: number;
  name: string;
  email: string;
  roleRaw: string;
  role: Role | null;
  classRaw: string;
  classId: string | null;
  className: string | null;
  hasCustomPassword: boolean;
  valid: boolean;
  errors: PreviewRowError[];
}

interface PreviewResponse {
  totalRows: number;
  validCount: number;
  errorCount: number;
  rows: PreviewRow[];
}

interface CommitResponse {
  createdCount: number;
  enrolledCount: number;
  skippedErrorCount: number;
  generatedPasswordCount: number;
  credentialsExportId: string | null;
}

export function BulkImportUsersCard({ onImported }: { onImported: () => void }) {
  const { m, tr } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const [credentialsDownloaded, setCredentialsDownloaded] = useState(false);
  const [downloadingCreds, setDownloadingCreds] = useState(false);

  const rowErrorText = (err: PreviewRowError): string => {
    switch (err.code) {
      case "INVALID_NAME":
        return tr("Họ tên phải từ 2 đến 100 ký tự.", "Full name must be 2–100 characters.");
      case "INVALID_EMAIL":
        return tr("Email không hợp lệ.", "Invalid email address.");
      case "DUPLICATE_IN_FILE":
        return tr("Email bị trùng trong file Excel.", "Duplicate email in this Excel file.");
      case "EMAIL_EXISTS":
        return tr("Email này đã được đăng ký.", "This email is already registered.");
      case "EMAIL_IN_TRASH":
        return tr("Email thuộc tài khoản đang ở thùng rác.", "Email belongs to an account in the trash.");
      case "INVALID_ROLE":
        return tr(
          "Vai trò không hợp lệ (STUDENT / TEACHER / PARENT / ADMIN).",
          "Invalid role (use STUDENT / TEACHER / PARENT / ADMIN)."
        );
      case "PASSWORD_TOO_SHORT":
        return tr("Mật khẩu tuỳ chọn phải từ 6 đến 100 ký tự.", "Optional password must be 6–100 characters.");
      case "CLASS_ONLY_FOR_STUDENT":
        return tr("Chỉ tài khoản Học sinh mới gán được lớp.", "Only Student accounts can be assigned to a class.");
      case "CLASS_NOT_FOUND":
        return tr(err.message, `Active class not found.`);
      case "CLASS_AMBIGUOUS":
        return tr(err.message, "Several active classes share this name. Use the class code instead.");
      default:
        return err.message;
    }
  };

  const handleFilePicked = async (file: File | null) => {
    setSelectedFile(file);
    setPreview(null);
    setCommitResult(null);
    setCredentialsDownloaded(false);
    setShowOnlyErrors(false);
    if (!file) return;

    setLoadingPreview(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/users/bulk-import/preview", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? m.common.errorGeneric);
        return;
      }
      setPreview(json as PreviewResponse);
    } catch {
      toast.error(m.common.errorGeneric);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCommit = async () => {
    if (!selectedFile) return;
    setCommitting(true);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      const res = await fetch("/api/admin/users/bulk-import/commit", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? m.common.errorGeneric);
        return;
      }
      const result = json as CommitResponse;
      setCommitResult(result);
      setPreview(null);
      setConfirmOpen(false);
      toast.success(
        tr(
          `Đã tạo ${result.createdCount} tài khoản thành công!`,
          `Successfully created ${result.createdCount} account(s)!`
        )
      );
      onImported();
    } catch {
      toast.error(m.common.errorGeneric);
    } finally {
      setCommitting(false);
    }
  };

  const handleDownloadCredentials = async () => {
    if (!commitResult?.credentialsExportId || credentialsDownloaded) return;
    setDownloadingCreds(true);
    try {
      const res = await fetch(
        `/api/admin/users/bulk-import/credentials/${commitResult.credentialsExportId}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toast.error(json.error ?? m.common.errorGeneric);
        if (res.status === 410) setCredentialsDownloaded(true);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "engclass-temp-passwords.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setCredentialsDownloaded(true);
      toast.success(
        tr(
          "Đã tải file mật khẩu tạm. Liên kết tải đã tự huỷ để bảo mật.",
          "Temporary passwords downloaded. The one-time link is now expired."
        )
      );
    } catch {
      toast.error(m.common.errorGeneric);
    } finally {
      setDownloadingCreds(false);
    }
  };

  const visibleRows = preview
    ? showOnlyErrors
      ? preview.rows.filter((r) => !r.valid)
      : preview.rows
    : [];

  return (
    <section className="stitch-card p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-base font-bold text-[#0B1C30]">
            <FileSpreadsheet className="h-5 w-5 text-[#4F46E5]" />
            {tr("Nhập tài khoản hàng loạt từ Excel", "Bulk create accounts from Excel")}
          </h2>
          <p className="text-xs text-[#464555]">
            {tr(
              "Cột: Họ tên, Email, Vai trò (STUDENT / TEACHER / PARENT / ADMIN), Lớp (tuỳ chọn cho học sinh), Mật khẩu (tuỳ chọn). Bỏ trống mật khẩu để hệ thống tự sinh và tải file Excel một lần.",
              "Columns: Full name, Email, Role (STUDENT / TEACHER / PARENT / ADMIN), Class (optional for students), Password (optional). Leave password blank to auto-generate and download a one-time Excel file."
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/admin/users/bulk-import/template"
            download="engclass-users-template.xlsx"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0B1C30] transition hover:bg-slate-50"
          >
            <Download className="h-4 w-4 text-[#4F46E5]" />
            {tr("Tải file mẫu (.xlsx)", "Download template (.xlsx)")}
          </a>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              void handleFilePicked(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            size="sm"
            className="min-h-[40px]"
            disabled={loadingPreview}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {loadingPreview
              ? tr("Đang đọc file…", "Reading file…")
              : tr("Chọn file Excel để xem trước", "Upload Excel to preview")}
          </Button>
        </div>
      </div>

      {commitResult && (
        <div
          data-testid="bulk-import-result"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold text-emerald-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>
              {tr(
                `Đã tạo ${commitResult.createdCount} tài khoản (${commitResult.enrolledCount} lượt vào lớp, bỏ qua ${commitResult.skippedErrorCount} dòng lỗi).`,
                `Created ${commitResult.createdCount} account(s) (${commitResult.enrolledCount} class enrollment(s), skipped ${commitResult.skippedErrorCount} invalid row(s)).`
              )}
            </span>
          </div>

          {commitResult.credentialsExportId && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <span>
                {tr(
                  `Có ${commitResult.generatedPasswordCount} tài khoản được sinh mật khẩu tạm. File Excel mật khẩu tạm chỉ tải được MỘT LẦN DUY NHẤT.`,
                  `${commitResult.generatedPasswordCount} account(s) received generated temporary passwords. This Excel file can only be downloaded ONCE.`
                )}
              </span>
              <Button
                type="button"
                size="sm"
                className="min-h-[40px]"
                disabled={credentialsDownloaded || downloadingCreds}
                onClick={() => void handleDownloadCredentials()}
              >
                <Download className="h-4 w-4" />
                {credentialsDownloaded
                  ? tr("Đã tải (chỉ 1 lần)", "Downloaded (one-time)")
                  : downloadingCreds
                    ? tr("Đang tải…", "Downloading…")
                    : tr("Tải Excel mật khẩu tạm (1 lần)", "Download temp passwords (once)")}
              </Button>
            </div>
          )}
        </div>
      )}

      {preview && (
        <div data-testid="bulk-import-preview" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-[#F8F9FF] px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-[#0B1C30]">
                {selectedFile?.name}
              </span>
              <Badge variant="default" className="tabular-nums">
                {tr(`Tổng: ${preview.totalRows}`, `Total: ${preview.totalRows}`)}
              </Badge>
              <Badge variant="mint" className="tabular-nums">
                {tr(`Hợp lệ: ${preview.validCount}`, `Valid: ${preview.validCount}`)}
              </Badge>
              {preview.errorCount > 0 && (
                <Badge variant="danger" className="tabular-nums">
                  {tr(`Lỗi: ${preview.errorCount}`, `Errors: ${preview.errorCount}`)}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {preview.errorCount > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant={showOnlyErrors ? "secondary" : "outline"}
                  className="min-h-[40px]"
                  onClick={() => setShowOnlyErrors((v) => !v)}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {showOnlyErrors
                    ? tr("Hiện tất cả dòng", "Show all rows")
                    : tr(`Chỉ hiện ${preview.errorCount} dòng lỗi`, `Show ${preview.errorCount} error(s)`)}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                className="min-h-[40px]"
                disabled={preview.validCount === 0}
                onClick={() => setConfirmOpen(true)}
              >
                {tr(
                  `Tạo ${preview.validCount} tài khoản hợp lệ`,
                  `Create ${preview.validCount} valid account(s)`
                )}
              </Button>
            </div>
          </div>

          <div className="max-h-96 overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#F8F9FF] font-bold uppercase text-[#464555]">
                <tr>
                  <th className="px-3 py-2.5">{tr("Dòng", "Row")}</th>
                  <th className="px-3 py-2.5">{tr("Họ tên", "Name")}</th>
                  <th className="px-3 py-2.5">Email</th>
                  <th className="px-3 py-2.5">{tr("Vai trò", "Role")}</th>
                  <th className="px-3 py-2.5">{tr("Lớp", "Class")}</th>
                  <th className="px-3 py-2.5">{tr("Mật khẩu", "Password")}</th>
                  <th className="px-3 py-2.5">{tr("Trạng thái", "Status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => (
                  <tr
                    key={`${row.rowNumber}-${row.email}`}
                    className={row.valid ? "bg-white" : "bg-red-50/50"}
                  >
                    <td className="px-3 py-2 font-mono font-semibold text-slate-500 tabular-nums">
                      #{row.rowNumber}
                    </td>
                    <td className="px-3 py-2 font-semibold text-[#0B1C30]">
                      {row.name || "—"}
                    </td>
                    <td className="px-3 py-2 text-[#464555]">{row.email || "—"}</td>
                    <td className="px-3 py-2">
                      {row.role ? (
                        <Badge variant="default">{m.roles[row.role]}</Badge>
                      ) : (
                        <span className="text-red-600">{row.roleRaw || "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[#464555]">
                      {row.className ?? (row.classRaw || "—")}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {row.hasCustomPassword
                        ? tr("Tự đặt", "Custom")
                        : tr("Tự sinh (tạm)", "Auto-generated")}
                    </td>
                    <td className="px-3 py-2">
                      {row.valid ? (
                        <Badge variant="mint">{tr("Hợp lệ", "Valid")}</Badge>
                      ) : (
                        <ul className="space-y-0.5 text-red-700 font-medium">
                          {row.errors.map((e, i) => (
                            <li key={i}>• {rowErrorText(e)}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={(open) => !open && setConfirmOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tr("Xác nhận tạo tài khoản hàng loạt", "Confirm bulk account creation")}
            </DialogTitle>
            <DialogDescription>
              {preview &&
                tr(
                  `Hệ thống sẽ tạo ${preview.validCount} tài khoản hợp lệ${preview.errorCount > 0 ? ` và bỏ qua ${preview.errorCount} dòng lỗi` : ""}.`,
                  `The system will create ${preview.validCount} valid account(s)${preview.errorCount > 0 ? ` and skip ${preview.errorCount} invalid row(s)` : ""}.`
                )}
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-[#464555]">
            {tr(
              "Các tài khoản không có mật khẩu trong file sẽ được sinh mật khẩu tạm và bắt buộc đổi khi đăng nhập lần đầu. Bạn nhớ tải file Excel mật khẩu tạm ngay sau khi tạo (chỉ tải được một lần).",
              "Accounts without a password will receive a temporary password and must change it at first sign-in. Download the temporary passwords Excel immediately after creation (one-time download)."
            )}
          </p>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-[40px]"
              disabled={committing}
              onClick={() => setConfirmOpen(false)}
            >
              {m.common.cancel}
            </Button>
            <Button
              type="button"
              className="min-h-[40px]"
              disabled={committing}
              onClick={() => void handleCommit()}
            >
              {committing ? tr("Đang tạo…", "Creating…") : m.common.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
