import { vi, type Messages } from "@/messages/vi";
import { en } from "@/messages/en";
import type { Locale } from "./config";

export function getMessagesFor(locale: Locale): Messages {
  return locale === "en" ? en : vi;
}
