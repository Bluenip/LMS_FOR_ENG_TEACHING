import { Fragment } from "react";
import katex from "katex";
import { cn } from "@/lib/utils";

type MathSegment =
  | { kind: "text"; value: string }
  | { kind: "inline"; value: string }
  | { kind: "display"; value: string };

/**
 * Tokenizes plain text alongside LaTeX delimiters:
 *  - Display: $$...$$ or \[...\]
 *  - Inline: \(...\) or $...$ (single-line, no leading/trailing spaces inside $)
 * Escaped `\$` renders as a literal `$`.
 */
export function tokenizeMathText(input: string): MathSegment[] {
  const segments: MathSegment[] = [];
  let textBuf = "";
  let i = 0;

  const flushText = () => {
    if (textBuf) {
      segments.push({ kind: "text", value: textBuf });
      textBuf = "";
    }
  };

  while (i < input.length) {
    const ch = input[i]!;

    if (ch === "\\" && input[i + 1] === "$") {
      textBuf += "$";
      i += 2;
      continue;
    }

    if (input.startsWith("$$", i)) {
      const end = input.indexOf("$$", i + 2);
      if (end !== -1 && end > i + 2) {
        flushText();
        segments.push({ kind: "display", value: input.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
    }

    if (input.startsWith("\\[", i)) {
      const end = input.indexOf("\\]", i + 2);
      if (end !== -1 && end > i + 2) {
        flushText();
        segments.push({ kind: "display", value: input.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
    }

    if (input.startsWith("\\(", i)) {
      const end = input.indexOf("\\)", i + 2);
      if (end !== -1 && end > i + 2) {
        flushText();
        segments.push({ kind: "inline", value: input.slice(i + 2, end).trim() });
        i = end + 2;
        continue;
      }
    }

    if (ch === "$") {
      const next = input[i + 1];
      if (next && !/\s/.test(next) && next !== "$") {
        let j = i + 1;
        let foundEnd = -1;
        while (j < input.length) {
          const c = input[j]!;
          if (c === "\n") break;
          if (c === "\\" && input[j + 1] === "$") {
            j += 2;
            continue;
          }
          if (c === "$") {
            const prev = input[j - 1]!;
            if (!/\s/.test(prev) && input[j + 1] !== "$") {
              foundEnd = j;
            }
            break;
          }
          j++;
        }
        if (foundEnd > i + 1) {
          flushText();
          segments.push({ kind: "inline", value: input.slice(i + 1, foundEnd) });
          i = foundEnd + 1;
          continue;
        }
      }
    }

    textBuf += ch;
    i++;
  }

  flushText();
  return segments;
}

export function hasMathSyntax(text: string): boolean {
  return tokenizeMathText(text).some((s) => s.kind !== "text");
}

function renderKatexHtml(expr: string, displayMode: boolean): string {
  return katex.renderToString(expr, {
    displayMode,
    throwOnError: false,
    strict: false,
    trust: false,
  });
}

export function MathText({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const segments = tokenizeMathText(text);

  if (segments.length === 1 && segments[0]?.kind === "text") {
    return <span className={cn("whitespace-pre-wrap", className)}>{segments[0].value}</span>;
  }

  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {segments.map((seg, idx) => {
        if (seg.kind === "text") {
          return <Fragment key={idx}>{seg.value}</Fragment>;
        }
        const html = renderKatexHtml(seg.value, seg.kind === "display");
        return (
          <span
            key={idx}
            className={seg.kind === "display" ? "block my-1.5 overflow-x-auto" : "inline-block align-middle"}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      })}
    </span>
  );
}
