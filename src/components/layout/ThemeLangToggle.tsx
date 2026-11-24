"use client";

import { Languages, Moon, Sun } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { useTheme } from "@/lib/theme/client";
import { cn } from "@/lib/utils";

export function ThemeLangToggle({ className }: { className?: string }) {
  const { locale, setLocale, tr } = useI18n();
  const { resolved, toggle } = useTheme();
  const nextLocale = locale === "vi" ? "en" : "vi";

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={() => setLocale(nextLocale)}
        aria-label={tr("Chuyển sang tiếng Anh", "Switch to Vietnamese")}
        title={tr("Chuyển sang tiếng Anh", "Switch to Vietnamese")}
        className="flex h-9 items-center gap-1 rounded-full px-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Languages className="h-4 w-4" />
        {locale.toUpperCase()}
      </button>
      <button
        type="button"
        onClick={toggle}
        aria-label={resolved === "dark" ? tr("Giao diện sáng", "Light mode") : tr("Giao diện tối", "Dark mode")}
        title={resolved === "dark" ? tr("Giao diện sáng", "Light mode") : tr("Giao diện tối", "Dark mode")}
        className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  );
}
