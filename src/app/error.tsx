"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { tr } = useI18n();

  useEffect(() => {
    void fetch("/api/errors/client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        message: error.message || "React render error",
        stack: error.stack ?? null,
        path: typeof window !== "undefined" ? window.location.pathname : null,
        level: "FATAL",
        meta: error.digest ? { digest: error.digest } : undefined,
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
      <div className="stitch-card max-w-md space-y-4 p-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-[#0B1C30]">
          {tr("Đã xảy ra lỗi ngoài ý muốn", "Something went wrong")}
        </h1>
        <p className="text-sm text-[#464555]">
          {tr(
            "Lỗi đã được tự động ghi nhận để quản trị viên kiểm tra. Bạn có thể tải lại trang để thử lại.",
            "The error was automatically logged for administrators to review. You can try reloading."
          )}
        </p>
        <div className="flex justify-center gap-2 pt-1">
          <Button type="button" className="min-h-[40px]" onClick={() => reset()}>
            <RotateCcw className="h-4 w-4" />
            {tr("Thử lại", "Try again")}
          </Button>
        </div>
      </div>
    </div>
  );
}
