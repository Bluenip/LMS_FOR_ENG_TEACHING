import { cookies } from "next/headers";
import { LOCALE_COOKIE, makeTr, normalizeLocale, type Locale } from "./config";
import { getMessagesFor } from "./messages";

/** For Server Components / layouts: reads the locale cookie. */
export async function getI18n() {
  const store = await cookies();
  const locale: Locale = normalizeLocale(store.get(LOCALE_COOKIE)?.value);
  return { locale, m: getMessagesFor(locale), tr: makeTr(locale) };
}
