"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** System-wide notice set by an admin in /admin/system. */
export function SystemBanner() {
  const [hidden, setHidden] = useState(false);
  const { data } = useQuery<{ banner: { message: string; level: string } | null }>({
    queryKey: ["system-banner"],
    queryFn: async () => (await fetch("/api/system/banner")).json(),
    refetchInterval: 60_000,
  });
  const b = data?.banner;
  if (!b || hidden) return null;
  return (
    <div
      role="status"
      data-testid="system-banner"
      className={cn(
        "flex items-start justify-between gap-3 px-4 py-2 text-sm",
        b.level === "CRITICAL"
          ? "bg-rose-600 text-white"
          : b.level === "WARNING"
            ? "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100"
            : "bg-indigo-50 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100"
      )}
    >
      <span className="flex items-start gap-2">
        {b.level === "INFO" ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
        {b.message}
      </span>
      <button type="button" onClick={() => setHidden(true)} className="rounded p-0.5 opacity-70 hover:opacity-100" aria-label="Đóng / Close">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
