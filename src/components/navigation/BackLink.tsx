"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { canGoBackInApp } from "@/lib/navigation-history";

/**
 * "Back" that returns to the page the user actually came from (keeping its filters and tab),
 * or to `fallbackHref` when the page was opened directly (new tab, shared link, after login).
 * It stays a real link to `fallbackHref`, so middle-click / "open in new tab" still work.
 */
export function BackLink({
  fallbackHref,
  label,
  className,
  iconOnly = false,
  title,
}: {
  fallbackHref: string;
  label: string;
  className?: string;
  iconOnly?: boolean;
  title?: string;
}) {
  const router = useRouter();
  return (
    <Link
      href={fallbackHref}
      title={title ?? label}
      aria-label={iconOnly ? label : undefined}
      data-testid="back-link"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (canGoBackInApp()) {
          e.preventDefault();
          router.back();
        }
      }}
      className={cn(
        "group inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-white text-[#0B1C30] shadow-sm transition hover:border-indigo-200 hover:bg-[#EFF4FF] hover:text-[#3525CD] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4F46E5]/40",
        iconOnly ? "h-10 w-10 justify-center" : "h-10 max-w-full gap-2 py-1 pl-1 pr-4 text-sm font-semibold",
        className
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full text-[#4F46E5] transition-transform group-hover:-translate-x-0.5",
          iconOnly ? "h-8 w-8" : "h-8 w-8 bg-[#EEF2FF]"
        )}
      >
        <ArrowLeft className="h-4 w-4" />
      </span>
      {!iconOnly && <span className="min-w-0 truncate">{label}</span>}
    </Link>
  );
}
