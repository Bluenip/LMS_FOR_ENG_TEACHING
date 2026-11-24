"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ClipboardList, Filter, RotateCcw } from "lucide-react";
import type { Role } from "@prisma/client";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AuditLogItem {
  id: string;
  actorId: string | null;
  actor: { id: string; name: string; email: string; role: Role } | null;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  summaryEn: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

interface AuditLogResponse {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  actors: Array<{ id: string; name: string; email: string; role: Role }>;
  availableActions: string[];
}

function getActionBadgeVariant(action: string): BadgeProps["variant"] {
  if (action.includes("DELETED") || action.includes("PURGED") || action.includes("TRASHED") || action === "USER_LOCKED") {
    return "danger";
  }
  if (action.includes("CREATED") || action.includes("RESTORED") || action === "USER_UNLOCKED" || action === "TOTP_ENABLED") {
    return "mint";
  }
  if (action === "OWNERSHIP_TRANSFERRED" || action === "USER_ROLE_CHANGED") {
    return "purple";
  }
  if (action.includes("PASSWORD") || action.includes("ARCHIVED") || action === "TOTP_DISABLED") {
    return "orange";
  }
  return "sky";
}

export default function AdminAuditPage() {
  const { m, tr } = useI18n();
  const [actorId, setActorId] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const actionLabel = (code: string): string => {
    const map: Record<string, [string, string]> = {
      USER_CREATED: ["Tạo tài khoản", "Account created"],
      USERS_BULK_IMPORTED: ["Nhập tài khoản từ Excel", "Bulk user import"],
      USER_TRASHED: ["Chuyển tài khoản vào thùng rác", "Account moved to trash"],
      USER_RESTORED: ["Khôi phục tài khoản", "Account restored"],
      USER_PURGED: ["Xoá vĩnh viễn tài khoản", "Account permanently deleted"],
      USER_ROLE_CHANGED: ["Đổi vai trò", "Role changed"],
      USER_LOCKED: ["Khoá tài khoản", "Account locked"],
      USER_UNLOCKED: ["Mở khoá tài khoản", "Account unlocked"],
      USER_PASSWORD_RESET: ["Đặt lại mật khẩu", "Password reset"],
      OWNERSHIP_TRANSFERRED: ["Chuyển quyền sở hữu", "Ownership transferred"],
      ASSIGNMENT_UPDATED: ["Sửa bài đã giao", "Assignment updated"],
      CLASS_ARCHIVED: ["Lưu trữ lớp", "Class archived"],
      CLASS_UNARCHIVED: ["Mở lại lớp", "Class restored"],
      CLASS_DELETED: ["Xoá lớp", "Class deleted"],
      WORKSHEET_DELETED: ["Xoá worksheet", "Worksheet deleted"],
      TOTP_ENABLED: ["Bật xác thực 2 bước (2FA)", "2FA enabled"],
      TOTP_DISABLED: ["Tắt xác thực 2 bước (2FA)", "2FA disabled"],
    };
    const pair = map[code];
    return pair ? tr(pair[0], pair[1]) : code;
  };

  const { data, isLoading, isFetching } = useQuery<AuditLogResponse>({
    queryKey: ["admin-audit", actorId, action, from, to, q, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (actorId) params.set("actorId", actorId);
      if (action) params.set("action", action);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (q.trim()) params.set("q", q.trim());
      params.set("page", String(page));
      params.set("pageSize", "20");
      return apiFetchJson<AuditLogResponse>(
        `/api/admin/audit?${params.toString()}`,
        undefined,
        tr("Không tải được nhật ký hoạt động", "Could not load audit log")
      );
    },
  });

  const resetFilters = () => {
    setActorId("");
    setAction("");
    setFrom("");
    setTo("");
    setQ("");
    setPage(1);
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#4F46E5] text-white">
            <ClipboardList className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[#0B1C30]">
              {tr("Nhật ký hoạt động", "Audit log")}
            </h1>
            <p className="text-sm text-[#464555]">
              {tr(
                "Theo dõi mọi thao tác quản trị tài khoản, chuyển dữ liệu, sửa bài tập, lớp học và bảo mật.",
                "Track account management, ownership transfers, assignment edits, class changes, and security actions."
              )}
            </p>
          </div>
        </div>
        {data && (
          <Badge variant="default" className="tabular-nums">
            {data.total} {tr("bản ghi", "entries")}
          </Badge>
        )}
      </div>

      {/* Filters */}
      <section className="stitch-card p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase text-[#464555]">
            <Filter className="h-3.5 w-3.5 text-[#4F46E5]" />
            {tr("Bộ lọc", "Filters")}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-[40px]"
            onClick={resetFilters}
          >
            <RotateCcw className="h-3.5 w-3.5" /> {tr("Đặt lại", "Reset")}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="audit-actor" className="text-xs">
              {tr("Người thực hiện", "Actor")}
            </Label>
            <select
              id="audit-actor"
              value={actorId}
              onChange={(e) => {
                setActorId(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#4F46E5]"
            >
              <option value="">{tr("Tất cả người thực hiện", "All actors")}</option>
              {(data?.actors ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.email})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="audit-action" className="text-xs">
              {tr("Loại hành động", "Action")}
            </Label>
            <select
              id="audit-action"
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#4F46E5]"
            >
              <option value="">{tr("Tất cả hành động", "All actions")}</option>
              {(data?.availableActions ?? []).map((act) => (
                <option key={act} value={act}>
                  {actionLabel(act)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="audit-from" className="text-xs">
              {tr("Từ ngày", "From date")}
            </Label>
            <Input
              id="audit-from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
              className="h-10"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="audit-to" className="text-xs">
              {tr("Đến ngày", "To date")}
            </Label>
            <Input
              id="audit-to"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
              className="h-10"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="audit-search" className="text-xs">
              {tr("Tìm kiếm", "Search")}
            </Label>
            <Input
              id="audit-search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder={tr("Mô tả, email, ID…", "Summary, email, ID…")}
              className="h-10"
            />
          </div>
        </div>
      </section>

      {/* Results */}
      <section className="stitch-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-slate-400">{m.common.loading}</div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            {tr("Không có bản ghi nhật ký nào khớp bộ lọc.", "No audit entries match the current filters.")}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.items.map((item) => {
              const isOpen = expandedId === item.id;
              const hasMeta = item.meta && Object.keys(item.meta).length > 0;
              return (
                <div key={item.id} className="px-4 py-3.5 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={getActionBadgeVariant(item.action)}>
                          {actionLabel(item.action)}
                        </Badge>
                        <span className="text-xs font-medium text-slate-500">
                          {item.targetType}
                          {item.targetId ? ` · ${item.targetId.slice(0, 12)}` : ""}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-[#0B1C30] break-words">
                        {tr(item.summary, item.summaryEn ?? item.summary)}
                      </p>
                      <p className="text-xs text-[#464555]">
                        {tr("Người thực hiện:", "Actor:")}{" "}
                        <span className="font-semibold text-[#0B1C30]">
                          {item.actor
                            ? `${item.actor.name} (${item.actor.email})`
                            : tr("Hệ thống / đã xoá", "System / removed")}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-xs text-slate-500 tabular-nums">
                        {formatDateTime(item.createdAt)}
                      </span>
                      {hasMeta && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-[40px]"
                          onClick={() => setExpandedId(isOpen ? null : item.id)}
                        >
                          {isOpen ? tr("Ẩn chi tiết", "Hide details") : tr("Chi tiết", "Details")}
                        </Button>
                      )}
                    </div>
                  </div>
                  {isOpen && hasMeta && (
                    <pre className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-[#F8F9FF] p-3 text-xs text-[#0B1C30]">
                      {JSON.stringify(item.meta, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-6">
            <span className="text-xs text-[#464555] tabular-nums">
              {tr(
                `Trang ${data.page} / ${data.totalPages} (${data.total} bản ghi)`,
                `Page ${data.page} of ${data.totalPages} (${data.total} entries)`
              )}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[40px]"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> {tr("Trước", "Previous")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[40px]"
                disabled={page >= data.totalPages || isFetching}
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              >
                {tr("Sau", "Next")} <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
