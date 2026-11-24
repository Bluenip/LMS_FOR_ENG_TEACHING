import { cookies } from "next/headers";
import { LOCALE_COOKIE, makeTr, normalizeLocale, type Locale } from "./config";
import { getMessagesFor } from "./messages";

/** Safe helper usable inside Route Handlers, Server Components, and services (falls back to "vi" outside request scope). */
export async function getRequestLocale(): Promise<Locale> {
  try {
    const store = await cookies();
    return normalizeLocale(store.get(LOCALE_COOKIE)?.value);
  } catch {
    return "vi";
  }
}

/** For Server Components / layouts: reads the locale cookie. */
export async function getI18n() {
  const locale = await getRequestLocale();
  return { locale, m: getMessagesFor(locale), tr: makeTr(locale) };
}
