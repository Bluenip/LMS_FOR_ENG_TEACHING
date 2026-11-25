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
        iconOnly
          ? "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[#464555] hover:bg-[#EFF4FF] hover:text-[#3525CD]"
          : "inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[#4F46E5] hover:underline",
        className
      )}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" />
      {!iconOnly && <span className="truncate">{label}</span>}
    </Link>
  );
}
