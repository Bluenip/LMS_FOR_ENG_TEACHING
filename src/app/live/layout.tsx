import type { Metadata } from "next";

export const metadata: Metadata = { title: "Live Quiz" };

export default function LiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-[#F8F9FF] px-4 py-6 dark:bg-slate-950 sm:py-10">
      {children}
    </main>
  );
}
