"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Atom, Calculator, Eraser, Highlighter, PencilLine, Sigma, Volume2, Wrench, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { CalcError, evaluate, type AngleMode } from "@/lib/exam-tools/calculator";
import { findElement } from "@/lib/exam-tools/periodic-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MathText } from "./MathText";

export interface AllowedTools {
  calculator?: boolean;
  scratchpad?: boolean;
  periodicTable?: boolean;
  formulaSheet?: boolean;
  highlighter?: boolean;
  tts?: boolean;
}

type ToolId = "calculator" | "scratchpad" | "periodicTable" | "formulaSheet" | "tts";

const FORMULAS: Array<{ vi: string; en: string; f: string }> = [
  { vi: "Nghiệm PT bậc 2", en: "Quadratic roots", f: "$x=\\dfrac{-b\\pm\\sqrt{b^2-4ac}}{2a}$" },
  { vi: "Định lý Pytago", en: "Pythagoras", f: "$a^2+b^2=c^2$" },
  { vi: "Diện tích hình tròn", en: "Circle area", f: "$S=\\pi r^2$" },
  { vi: "Đạo hàm cơ bản", en: "Basic derivative", f: "$(x^n)'=nx^{n-1}$" },
  { vi: "Logarit", en: "Logarithm", f: "$\\log_a(bc)=\\log_a b+\\log_a c$" },
  { vi: "Vận tốc", en: "Velocity", f: "$v=\\dfrac{s}{t}$" },
  { vi: "Định luật II Newton", en: "Newton's 2nd law", f: "$F=ma$" },
  { vi: "Định luật Ôm", en: "Ohm's law", f: "$I=\\dfrac{U}{R}$" },
  { vi: "Số mol", en: "Moles", f: "$n=\\dfrac{m}{M}=\\dfrac{V}{22{,}4}$" },
  { vi: "Nồng độ mol", en: "Molarity", f: "$C_M=\\dfrac{n}{V}$" },
];

/**
 * Floating in-page tool drawer for the exam screen. Only the tools enabled by the teacher are shown,
 * and everything runs inside the page so students never have to switch tabs (anti-cheat friendly).
 */
export function ExamToolsDrawer({ tools }: { tools: AllowedTools | null | undefined }) {
  const { tr, locale } = useI18n();
  const enabled = useMemo<ToolId[]>(
    () => (["calculator", "scratchpad", "periodicTable", "formulaSheet", "tts"] as const).filter((t) => tools?.[t]),
    [tools]
  );
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ToolId | null>(null);
  const [highlighting, setHighlighting] = useState(false);
  const [fontScale, setFontScale] = useState(1);

  useEffect(() => {
    if (!tab && enabled[0]) setTab(enabled[0]);
  }, [enabled, tab]);

  // Font size for the whole exam area
  useEffect(() => {
    document.documentElement.style.setProperty("--exam-font-scale", String(fontScale));
    const main = document.querySelector<HTMLElement>("[data-exam-root]");
    if (main) main.style.fontSize = fontScale === 1 ? "" : `${fontScale}em`;
  }, [fontScale]);

  // Highlighter: wraps the selected text of a reading passage in <mark>
  useEffect(() => {
    if (!highlighting) return;
    const onUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const host = (range.commonAncestorContainer instanceof Element
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement
      )?.closest("[data-highlightable]");
      if (!host) return;
      try {
        const mark = document.createElement("mark");
        mark.className = "pivora-hl rounded bg-yellow-200 px-0.5 dark:bg-yellow-600/60";
        mark.dataset.testid = "exam-highlight";
        range.surroundContents(mark);
      } catch {
        // selection crosses element boundaries: highlight the text nodes only
        const text = range.toString();
        if (!text.trim()) return;
        const mark = document.createElement("mark");
        mark.className = "pivora-hl rounded bg-yellow-200 px-0.5 dark:bg-yellow-600/60";
        mark.textContent = text;
        range.deleteContents();
        range.insertNode(mark);
      }
      sel.removeAllRanges();
    };
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
    };
  }, [highlighting]);

  if (enabled.length === 0 && !tools?.highlighter) return null;

  const label = (t: ToolId) =>
    ({
      calculator: tr("Máy tính", "Calculator"),
      scratchpad: tr("Nháp", "Scratchpad"),
      periodicTable: tr("Bảng tuần hoàn", "Periodic table"),
      formulaSheet: tr("Công thức", "Formulas"),
      tts: tr("Đọc đề", "Read aloud"),
    })[t];
  const icon = (t: ToolId) =>
    ({
      calculator: <Calculator className="h-4 w-4" />,
      scratchpad: <PencilLine className="h-4 w-4" />,
      periodicTable: <Atom className="h-4 w-4" />,
      formulaSheet: <Sigma className="h-4 w-4" />,
      tts: <Volume2 className="h-4 w-4" />,
    })[t];

  return (
    <>
      <div className="fixed bottom-20 right-3 z-40 flex flex-col items-end gap-2 sm:bottom-6">
        {tools?.highlighter && (
          <button
            type="button"
            onClick={() => setHighlighting((v) => !v)}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full shadow-lg",
              highlighting ? "bg-yellow-400 text-slate-900" : "bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            )}
            aria-pressed={highlighting}
            title={tr("Bút dạ quang (tô đoạn đọc)", "Highlighter (reading passages)")}
            data-testid="exam-tool-highlighter"
          >
            <Highlighter className="h-5 w-5" />
          </button>
        )}
        {enabled.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex h-12 items-center gap-2 rounded-full bg-[#4F46E5] px-4 text-sm font-semibold text-white shadow-lg"
            data-testid="exam-tools-toggle"
          >
            <Wrench className="h-4 w-4" /> {tr("Công cụ", "Tools")}
          </button>
        )}
      </div>

      {open && (
        <div
          className="fixed inset-x-2 bottom-2 z-50 max-h-[75vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:inset-x-auto sm:right-4 sm:w-[380px]"
          data-testid="exam-tools-drawer"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {enabled.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex min-h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold",
                    tab === t ? "bg-[#4F46E5] text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  )}
                  data-testid={`exam-tool-tab-${t}`}
                >
                  {icon(t)} {label(t)}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={tr("Đóng", "Close")}>
              <X className="h-4 w-4" />
            </button>
          </div>
          {tab === "calculator" && <CalculatorPanel />}
          {tab === "scratchpad" && <ScratchPanel />}
          {tab === "periodicTable" && <PeriodicPanel locale={locale} />}
          {tab === "formulaSheet" && (
            <ul className="space-y-1.5 text-sm">
              {FORMULAS.map((f) => (
                <li key={f.en} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                  <span className="text-xs text-slate-500">{locale === "en" ? f.en : f.vi}</span>
                  <MathText text={f.f} />
                </li>
              ))}
            </ul>
          )}
          {tab === "tts" && <TtsPanel fontScale={fontScale} setFontScale={setFontScale} />}
        </div>
      )}
    </>
  );
}

function CalculatorPanel() {
  const { tr } = useI18n();
  const [expr, setExpr] = useState("");
  const [mode, setMode] = useState<AngleMode>("DEG");
  const [result, setResult] = useState<string>("");
  const keys = ["7", "8", "9", "/", "sin(", "4", "5", "6", "*", "cos(", "1", "2", "3", "-", "tan(", "0", ".", "(", ")", "+", "^", "sqrt(", "pi", "log(", "ln("];
  const run = () => {
    try {
      setResult(String(evaluate(expr, mode)));
    } catch (e) {
      setResult(e instanceof CalcError && e.code === "MATH" ? tr("Lỗi toán học", "Math error") : tr("Biểu thức không hợp lệ", "Invalid expression"));
    }
  };
  return (
    <div className="space-y-2">
      <Input
        value={expr}
        onChange={(e) => setExpr(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") run();
        }}
        className="h-11 font-mono"
        aria-label={tr("Biểu thức", "Expression")}
        data-testid="calc-input"
      />
      <div className="flex items-center justify-between">
        <button type="button" className="rounded-lg px-2 py-1 text-xs font-semibold text-[#4F46E5]" onClick={() => setMode((m) => (m === "DEG" ? "RAD" : "DEG"))}>
          {mode}
        </button>
        <span className="font-mono text-lg font-bold" data-testid="calc-result">
          {result}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {keys.map((k) => (
          <button key={k} type="button" onClick={() => setExpr((e) => e + k)} className="h-10 rounded-lg bg-slate-100 text-sm font-semibold hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700">
            {k.replace("(", "")}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Button variant="outline" onClick={() => {
          setExpr("");
          setResult("");
        }}>
          C
        </Button>
        <Button onClick={run} data-testid="calc-equals">=</Button>
      </div>
    </div>
  );
}

function ScratchPanel() {
  const { tr } = useI18n();
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = getComputedStyle(document.documentElement).colorScheme === "dark" ? "#e2e8f0" : "#0f172a";
  }, []);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * e.currentTarget.width) / r.width, y: ((e.clientY - r.top) * e.currentTarget.height) / r.height };
  };
  return (
    <div className="space-y-2">
      <canvas
        ref={ref}
        width={700}
        height={500}
        className="h-64 w-full touch-none rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
        onPointerDown={(e) => {
          drawing.current = true;
          const p = pos(e);
          const ctx = e.currentTarget.getContext("2d")!;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const p = pos(e);
          const ctx = e.currentTarget.getContext("2d")!;
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerLeave={() => (drawing.current = false)}
        data-testid="scratch-canvas"
      />
      <Button variant="outline" size="sm" onClick={() => ref.current?.getContext("2d")?.clearRect(0, 0, 700, 500)}>
        <Eraser className="h-4 w-4" /> {tr("Xoá nháp", "Clear")}
      </Button>
    </div>
  );
}

function PeriodicPanel({ locale }: { locale: string }) {
  const { tr } = useI18n();
  const [q, setQ] = useState("");
  const list = useMemo(() => findElement(q).slice(0, 30), [q]);
  return (
    <div className="space-y-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Ký hiệu, tên hoặc số hiệu", "Symbol, name or number")} data-testid="periodic-search" />
      <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
        {list.map((e) => (
          <li key={e.number} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-800">
            <span className="flex items-center gap-2">
              <span className="w-8 text-xs text-slate-500">{e.number}</span>
              <b className="w-8">{e.symbol}</b>
              <span>{locale === "en" ? e.nameEn : e.nameVi}</span>
            </span>
            <span className="font-mono text-xs">{e.mass}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TtsPanel({ fontScale, setFontScale }: { fontScale: number; setFontScale: (v: number) => void }) {
  const { tr, locale } = useI18n();
  const speak = () => {
    const text = window.getSelection()?.toString().trim() || document.querySelector<HTMLElement>("[data-exam-root]")?.innerText.slice(0, 1500) || "";
    if (!text || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(text) ? "vi-VN" : locale === "en" ? "en-US" : "vi-VN";
    window.speechSynthesis.speak(u);
  };
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-slate-500">{tr("Bôi đen đoạn cần nghe rồi bấm Đọc (không bôi đen sẽ đọc từ đầu trang).", "Select text then press Read (otherwise the page is read from the top).")}</p>
      <div className="flex gap-2">
        <Button onClick={speak}>
          <Volume2 className="h-4 w-4" /> {tr("Đọc", "Read")}
        </Button>
        <Button variant="outline" onClick={() => window.speechSynthesis?.cancel()}>
          {tr("Dừng", "Stop")}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs">{tr("Cỡ chữ", "Font size")}</span>
        {[1, 1.15, 1.3].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFontScale(s)}
            className={cn("h-9 min-w-10 rounded-lg border px-2 font-semibold", fontScale === s ? "border-[#4F46E5] bg-[#4F46E5] text-white" : "border-slate-300 dark:border-slate-600")}
          >
            {s === 1 ? "A" : s === 1.15 ? "A+" : "A++"}
          </button>
        ))}
      </div>
    </div>
  );
}
