"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Messages } from "@/messages/vi";
import { LOCALE_COOKIE, makeTr, type Locale, type Translate } from "./config";
import { getMessagesFor } from "./messages";

interface I18nContextValue {
  locale: Locale;
  m: Messages;
  tr: Translate;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      setLocaleState(next);
      router.refresh(); // re-render Server Components (layouts, metadata) in the new language
    },
    [router]
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, m: getMessagesFor(locale), tr: makeTr(locale), setLocale }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
