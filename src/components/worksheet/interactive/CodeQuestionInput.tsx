"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Terminal } from "lucide-react";
import {
  isCodeAnswer,
  type AnswerValue,
  type CodeAnswerValue,
  type CodeOptions,
} from "@/lib/grading/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";

interface CodeQuestionInputProps {
  fieldId: string;
  options: CodeOptions;
  value: AnswerValue;
  onChange: (val: CodeAnswerValue) => void;
  disabled?: boolean;
}

const JS_WORKER_SRC = `
self.onmessage = function(e) {
  const logs = [];
  const fmt = (v) => {
    if (typeof v === "string") return v;
    try { return JSON.stringify(v); } catch { return String(v); }
  };
  const fakeConsole = {
    log: (...args) => logs.push(args.map(fmt).join(" ")),
    info: (...args) => logs.push(args.map(fmt).join(" ")),
    warn: (...args) => logs.push("[warn] " + args.map(fmt).join(" ")),
    error: (...args) => logs.push("[error] " + args.map(fmt).join(" ")),
  };
  try {
    const INPUT = e.data.sampleInput || "";
    const fn = new Function("console", "INPUT", e.data.code);
    const ret = fn(fakeConsole, INPUT);
    if (ret !== undefined && logs.length === 0) logs.push(fmt(ret));
    self.postMessage({ ok: true, output: logs.join("\\n") });
  } catch (err) {
    self.postMessage({
      ok: false,
      output: (logs.length ? logs.join("\\n") + "\\n" : "") + "Error: " + (err && err.message ? err.message : String(err)),
    });
  }
};
`;

export function CodeQuestionInput({
  fieldId,
  options,
  value,
  onChange,
  disabled = false,
}: CodeQuestionInputProps) {
  const { tr } = useI18n();
  const [running, setRunning] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  const language = options.language ?? "javascript";
  const current: CodeAnswerValue = isCodeAnswer(value)
    ? value
    : { code: typeof options.starterCode === "string" ? options.starterCode : "" };

  const lineCount = Math.max(4, current.code.split("\n").length);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const handleRunJs = () => {
    if (disabled || running || language !== "javascript") return;
    setRunning(true);
    let url = "";
    try {
      const blob = new Blob([JS_WORKER_SRC], { type: "application/javascript" });
      url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      workerRef.current = worker;

      const timer = window.setTimeout(() => {
        worker.terminate();
        workerRef.current = null;
        URL.revokeObjectURL(url);
        setRunning(false);
        onChange({
          code: current.code,
          lastOutput: tr("Quá thời gian chạy (tối đa 2 giây).", "Execution timed out (2s limit)."),
        });
      }, 2000);

      worker.onmessage = (ev: MessageEvent<{ ok: boolean; output: string }>) => {
        window.clearTimeout(timer);
        worker.terminate();
        workerRef.current = null;
        URL.revokeObjectURL(url);
        setRunning(false);
        onChange({
          code: current.code,
          lastOutput: ev.data?.output ?? "",
        });
      };

      worker.onerror = (err) => {
        window.clearTimeout(timer);
        worker.terminate();
        workerRef.current = null;
        URL.revokeObjectURL(url);
        setRunning(false);
        onChange({
          code: current.code,
          lastOutput: `Error: ${err.message || "Worker execution error"}`,
        });
      };

      worker.postMessage({
        code: current.code,
        sampleInput: options.sampleInput ?? "",
      });
    } catch {
      if (url) URL.revokeObjectURL(url);
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2" data-testid={`code-input-${fieldId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="purple" className="uppercase">
            {language}
          </Badge>
          {options.sampleInput && (
            <span className="text-[11px] font-mono text-[#464555]">
              Input: {options.sampleInput}
            </span>
          )}
          {options.sampleOutput && (
            <span className="text-[11px] font-mono text-emerald-700">
              Expected: {options.sampleOutput}
            </span>
          )}
        </div>

        {language === "javascript" && !disabled && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={running}
            data-testid={`code-run-${fieldId}`}
            onClick={handleRunJs}
            className="min-h-[36px]"
          >
            <Play className="h-3.5 w-3.5 text-emerald-600" />
            {running ? tr("Đang chạy…", "Running…") : tr("Chạy thử (JS)", "Run (JS)")}
          </Button>
        )}
      </div>

      <div className="flex overflow-hidden rounded-xl border border-slate-700 bg-slate-950 font-mono text-xs text-slate-100">
        <div
          aria-hidden="true"
          className="select-none border-r border-slate-800 bg-slate-900 px-2.5 py-2.5 text-right text-[11px] leading-5 text-slate-500"
        >
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          data-testid={`code-editor-${fieldId}`}
          disabled={disabled}
          value={current.code}
          rows={Math.min(16, Math.max(5, lineCount))}
          spellCheck={false}
          onChange={(e) =>
            onChange({
              code: e.target.value,
              ...(current.lastOutput !== undefined ? { lastOutput: current.lastOutput } : {}),
            })
          }
          onKeyDown={(e) => {
            if (e.key === "Tab" && !disabled) {
              e.preventDefault();
              const el = e.currentTarget;
              const start = el.selectionStart;
              const end = el.selectionEnd;
              const nextCode =
                current.code.slice(0, start) + "  " + current.code.slice(end);
              onChange({
                code: nextCode,
                ...(current.lastOutput !== undefined ? { lastOutput: current.lastOutput } : {}),
              });
              requestAnimationFrame(() => {
                el.selectionStart = el.selectionEnd = start + 2;
              });
            }
          }}
          className="min-h-[120px] w-full resize-y bg-transparent px-3 py-2.5 leading-5 text-slate-100 outline-none"
          placeholder={`// Write your ${language} code here...`}
        />
      </div>

      {current.lastOutput !== undefined && current.lastOutput !== "" && (
        <div
          data-testid={`code-output-${fieldId}`}
          className="rounded-xl border border-slate-200 bg-slate-900 px-3 py-2 font-mono text-xs text-emerald-300 whitespace-pre-wrap"
        >
          <span className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-slate-400">
            <Terminal className="h-3 w-3" /> Output
          </span>
          {current.lastOutput}
        </div>
      )}
    </div>
  );
}
