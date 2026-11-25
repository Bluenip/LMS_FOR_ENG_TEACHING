"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { recordNavigation } from "@/lib/navigation-history";

function Tracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  useEffect(() => {
    if (pathname) recordNavigation(pathname, query ? `${pathname}?${query}` : pathname);
  }, [pathname, query]);
  return null;
}

/** Feeds the in-app history used by <BackLink> (mounted once in the app providers). */
export function NavigationTracker() {
  return (
    <Suspense fallback={null}>
      <Tracker />
    </Suspense>
  );
}
