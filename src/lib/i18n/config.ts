export type Locale = "vi" | "en";
export const LOCALES: Locale[] = ["vi", "en"];
export const DEFAULT_LOCALE: Locale = "vi";
export const LOCALE_COOKIE = "lang";

export function normalizeLocale(value: string | undefined | null): Locale {
  return value === "en" ? "en" : "vi";
}

/** Inline bilingual helper: `tr("Xin chào", "Hello")` */
export type Translate = (viText: string, enText: string) => string;
export function makeTr(locale: Locale): Translate {
  return (viText, enText) => (locale === "en" ? enText : viText);
}
