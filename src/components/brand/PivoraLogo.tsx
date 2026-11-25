import { cn } from "@/lib/utils";

/**
 * Pivora brand mark, redrawn as SVG from the Canva logo (design DAHb4Q_Vbq0).
 * Strokes use `currentColor` via the `.pivora-ink` / `.pivora-accent` classes in globals.css,
 * so the mark stays readable in dark mode.
 *
 * Geometry is in the coordinate space of the 1024px export; the viewBox crops to the mark.
 */
export const PIVORA_MARK_VIEWBOX = "86 328 350 346";
export const PIVORA_INK = "#08143D";
export const PIVORA_ACCENT = "#1F5EFD";

const NAVY_LINES: Array<[number, number, number, number]> = [
  [201, 415, 328, 455], // top edge → blue node
  [201, 415, 95, 504], // top-left edge
  [201, 415, 216, 498], // top → centre
  [95, 504, 216, 498], // left → centre
  [216, 498, 328, 455], // centre → blue node
  [95, 504, 125, 626], // left edge → dot
  [216, 498, 135, 627], // centre → dot
  [216, 498, 274, 584], // centre → inner bend
  [286, 592, 356, 609], // inner bend → right
  [331, 468, 356, 609], // right edge
  [356, 609, 275, 664], // bottom-right edge
  [275, 664, 141, 646], // bottom edge → dot
];

export function PivoraMark({
  className,
  title,
  ink = "currentColor",
  accent,
  size,
}: {
  className?: string;
  /** Explicit pixel size (needed by next/og ImageResponse, which ignores CSS classes). */
  size?: number;
  title?: string;
  /** Override colours (e.g. for next/og ImageResponse, which has no CSS classes). */
  ink?: string;
  accent?: string;
}) {
  const accentStroke = accent ?? "var(--pivora-accent, #1F5EFD)";
  return (
    <svg
      viewBox={PIVORA_MARK_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("pivora-ink", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      fill="none"
      width={size}
      height={size}
    >
      {title ? <title>{title}</title> : null}
      <g stroke={ink} strokeWidth={7.5} strokeLinecap="round" strokeLinejoin="round">
        {NAVY_LINES.map(([x1, y1, x2, y2], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
      <g stroke={accentStroke} strokeWidth={7.5} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="129,640 282,590 328,455" />
        <line x1={327} y1={421} x2={327} y2={440} />
        <path d="M380 413 L416 413 Q428 413 428 401 L428 350 Q428 338 416 338 L337 338 Q325 338 325 350 L325 401 Q325 413 337 413 L345 413 L345 441 Z" />
      </g>
      <circle cx={129} cy={640} r={15} fill={accentStroke} />
      <circle cx={328} cy={455} r={6} fill={accentStroke} />
    </svg>
  );
}

/** Mark + wordmark, used in the navbar and on the sign-in page. */
export function PivoraLogo({
  name,
  className,
  markClassName,
  textClassName,
}: {
  name: string;
  className?: string;
  markClassName?: string;
  textClassName?: string;
}) {
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <PivoraMark className={cn("h-9 w-9 shrink-0", markClassName)} />
      <span className={cn("pivora-ink truncate font-semibold tracking-tight", textClassName)}>{name}</span>
    </span>
  );
}
