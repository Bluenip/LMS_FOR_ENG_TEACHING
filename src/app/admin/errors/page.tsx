"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertOctagon, Bug, RefreshCw, Server, Smartphone } from "lucide-react";
import type { Role } from "@prisma/client";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ErrorLogItem {
  id: string;
  source: "SERVER" | "CLIENT";
  level: "ERROR" | "WARN" | "FATAL";
  message: string;
  stack: string | null;
  path: string | null;
  method: string | null;
  statusCode: number | null;
  userId: string | null;
  user: { id: string; name: string; email: string; role: Role } | null;
  userAgent: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

interface ErrorLogResponse {
  items: ErrorLogItem[];
  counts: { total: number; server: number; client: number };
  sentryEnabled: boolean;
}

export default function AdminErrorsPage() {
  const { m, tr } = useI18n();
  const [source, setSource] = useState<"" | "SERVER" | "CLIENT">("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery<ErrorLogResponse>({
    queryKey: ["admin-errors", source],
    queryFn: () => {
      const params = new URLSearchParams();
      if (source) params.set("source", source);
      params.set("limit", "100");
      return apiFetchJson<ErrorLogResponse>(
        `/api/admin/errors?${params.toString()}`,
        undefined,
        tr("Không tải được nhật ký lỗi", "Could not load error log")
      );
    },
  });

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-white">
            <AlertOctagon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-[#0B1C30]">
              {tr("Nhật ký lỗi hệ thống", "System error log")}
            </h1>
            <p className="text-sm text-[#464555]">
              {tr(
                "Hiển thị tối đa 100 lỗi máy chủ (Server) và trình duyệt (Client) gần nhất.",
                "Displays up to 100 most recent server and browser client errors."
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {data?.sentryEnabled && (
            <Badge variant="mint">Sentry: {tr("Đang bật", "Connected")}</Badge>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-[40px]"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            {tr("Làm mới", "Refresh")}
          </Button>
        </div>
      </div>

      {/* Summary & Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="min-h-[40px]"
          variant={source === "" ? "default" : "outline"}
          onClick={() => setSource("")}
        >
          <Bug className="h-4 w-4" />
          {tr("Tất cả", "All")} ({data?.counts.total ?? 0})
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-[40px]"
          variant={source === "SERVER" ? "default" : "outline"}
          onClick={() => setSource("SERVER")}
        >
          <Server className="h-4 w-4" />
          Server ({data?.counts.server ?? 0})
        </Button>
        <Button
          type="button"
          size="sm"
          className="min-h-[40px]"
          variant={source === "CLIENT" ? "default" : "outline"}
          onClick={() => setSource("CLIENT")}
        >
          <Smartphone className="h-4 w-4" />
          Client ({data?.counts.client ?? 0})
        </Button>
      </div>

      {/* Error List */}
      <section className="stitch-card overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-slate-400">{m.common.loading}</div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            {tr("Chưa có lỗi nào được ghi nhận.", "No errors have been logged.")}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.items.map((item) => {
              const isOpen = expandedId === item.id;
              const hasDetails =
                Boolean(item.stack) ||
                Boolean(item.userAgent) ||
                (item.meta && Object.keys(item.meta).length > 0);
              return (
                <div key={item.id} className="px-4 py-3.5 sm:px-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant={item.source === "SERVER" ? "purple" : "sky"}>
                          {item.source}
                        </Badge>
                        <Badge
                          variant={
                            item.level === "WARN"
                              ? "orange"
                              : "danger"
                          }
                        >
                          {item.level}
                        </Badge>
                        {item.statusCode && (
                          <Badge variant="neutral" className="tabular-nums">
                            HTTP {item.statusCode}
                          </Badge>
                        )}
                        {item.path && (
                          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-[#0B1C30] break-all">
                            {item.method ? `${item.method} ` : ""}
                            {item.path}
                          </code>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-[#0B1C30] break-words">
                        {item.message}
                      </p>
                      <p className="text-xs text-[#464555]">
                        {tr("Người dùng:", "User:")}{" "}
                        <span className="font-semibold text-[#0B1C30]">
                          {item.user
                            ? `${item.user.name} (${item.user.email})`
                            : tr("Ẩn danh / hệ thống", "Anonymous / system")}
                        </span>
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-xs text-slate-500 tabular-nums">
                        {formatDateTime(item.createdAt)}
                      </span>
                      {hasDetails && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-[40px]"
                          onClick={() => setExpandedId(isOpen ? null : item.id)}
                        >
                          {isOpen ? tr("Ẩn stack", "Hide details") : tr("Xem chi tiết", "View details")}
                        </Button>
                      )}
                    </div>
                  </div>

                  {isOpen && hasDetails && (
                    <div className="mt-3 space-y-2">
                      {item.userAgent && (
                        <p className="text-xs text-[#464555] break-all">
                          <strong>User-Agent:</strong> {item.userAgent}
                        </p>
                      )}
                      {item.stack && (
                        <pre className="overflow-x-auto rounded-xl border border-red-200 bg-red-50/40 p-3 text-xs text-[#0B1C30]">
                          {item.stack}
                        </pre>
                      )}
                      {item.meta && Object.keys(item.meta).length > 0 && (
                        <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-[#F8F9FF] p-3 text-xs text-[#0B1C30]">
                          {JSON.stringify(item.meta, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
