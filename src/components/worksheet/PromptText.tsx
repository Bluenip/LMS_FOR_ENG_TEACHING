import { cn } from "@/lib/utils";
import { MathText } from "./MathText";

/**
 * Renders a question prompt produced by the Word/text parser or rich math text.
 * Internal markers (kept unchanged in the data because Focus Mode relies on them):
 *  - `____ [3a] ____` = the blank this question asks about  -> highlighted chip "3a"
 *  - `________`        = another blank of the same sentence -> neutral underline
 */
const MARKER = /(____ \[[^\]]+\] ____|_{4,})/g;

export function PromptText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(MARKER);
  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {parts.map((part, i) => {
        const own = /^____ \[([^\]]+)\] ____$/.exec(part);
        if (own) {
          return (
            <span
              key={i}
              className="mx-0.5 inline-flex min-w-[3.5rem] items-end justify-center border-b-2 border-[#4F46E5] px-1 align-baseline"
            >
              <span className="rounded bg-[#EEF2FF] px-1 text-[10px] font-bold leading-4 text-[#3525CD]">
                {own[1]}
              </span>
            </span>
          );
        }
        if (/^_{4,}$/.test(part)) {
          return (
            <span
              key={i}
              aria-hidden
              className="mx-0.5 inline-block w-12 border-b-2 border-dashed border-slate-300 align-baseline"
            />
          );
        }
        return <MathText key={i} text={part} />;
      })}
    </span>
  );
}
