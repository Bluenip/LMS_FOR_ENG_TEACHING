/**
 * Minimal RFC 5545 iCalendar writer for class sessions and assignment deadlines.
 * - TEXT values escaped (\\ ; , and newlines)
 * - content lines folded at 75 octets (UTF-8 aware) with CRLF + space
 * - all times in UTC (…Z)
 */
export interface IcsEvent {
  uid: string;
  start: Date;
  end: Date;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  /** Unix ms of last change (DTSTAMP); defaults to now */
  stamp?: Date;
}

export function escapeIcsText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function formatIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Folds one content line so no physical line exceeds 75 octets (never splitting a UTF-8 character). */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74; // continuation lines start with one space
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

export function buildIcsCalendar(events: IcsEvent[], opts: { name: string; prodId?: string } = { name: "Pivora" }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${opts.prodId ?? "-//Pivora//LMS Calendar//VI"}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(opts.name)}`,
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${formatIcsDate(e.stamp ?? new Date())}`,
      `DTSTART:${formatIcsDate(e.start)}`,
      `DTEND:${formatIcsDate(e.end > e.start ? e.end : new Date(e.start.getTime() + 15 * 60_000))}`,
      `SUMMARY:${escapeIcsText(e.summary)}`
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeIcsText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
