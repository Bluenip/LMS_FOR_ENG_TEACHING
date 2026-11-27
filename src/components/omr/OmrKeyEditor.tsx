"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save } from "lucide-react";
import { apiFetchJson } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import type { OmrAnswerKeyByVariant, OmrVariantKey } from "@/lib/omr/grader";
import { MC_CHOICES, TF_STATEMENTS, getOmrTemplate, type OmrTemplateId } from "@/lib/omr/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Grid editor for the answer key of every exam code (variant) of an OMR sheet. */
export function OmrKeyEditor({
  sheetId,
  template,
  initial,
  onSaved,
}: {
  sheetId: string;
  template: OmrTemplateId;
  initial: OmrAnswerKeyByVariant;
  onSaved: () => void;
}) {
  const { tr } = useI18n();
  const t = getOmrTemplate(template);
  const [keys, setKeys] = useState<OmrAnswerKeyByVariant>(() =>
    Object.keys(initial).length > 0 ? initial : { default: {} }
  );
  const [active, setActive] = useState(() => Object.keys(initial)[0] ?? "default");
  const [newCode, setNewCode] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (Object.keys(initial).length > 0) setKeys(initial);
  }, [initial]);

  const cur: OmrVariantKey = keys[active] ?? {};
  const update = (fn: (k: OmrVariantKey) => OmrVariantKey) => setKeys((prev) => ({ ...prev, [active]: fn(prev[active] ?? {}) }));

  const save = async () => {
    setSaving(true);
    try {
      await apiFetchJson(`/api/omr/sheets/${sheetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerKeyByVariant: keys }),
      });
      toast.success(tr("Đã lưu đáp án và chấm lại các phiếu", "Key saved and sheets re-graded"));
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Lưu thất bại", "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="omr-key-editor">
      <div className="flex flex-wrap items-center gap-2">
        {Object.keys(keys).map((code) => (
          <Button key={code} size="sm" variant={code === active ? "default" : "outline"} onClick={() => setActive(code)}>
            {code === "default" ? tr("Đề chung", "Single key") : `${tr("Mã", "Code")} ${code}`}
          </Button>
        ))}
        <div className="flex items-center gap-1">
          <Input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder="101"
            className="h-8 w-16 text-xs"
            aria-label={tr("Mã đề mới", "New exam code")}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={newCode.length !== 3 || Boolean(keys[newCode])}
            onClick={() => {
              setKeys((prev) => ({ ...prev, [newCode]: {} }));
              setActive(newCode);
              setNewCode("");
            }}
          >
            <Plus className="h-4 w-4" /> {tr("Mã đề", "Code")}
          </Button>
        </div>
      </div>

      {t.mcCount > 0 && (
        <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: t.mcCount }, (_, i) => String(i + 1)).map((q) => (
            <div key={q} className="flex items-center gap-2">
              <span className="w-7 text-right text-sm font-semibold">{q}.</span>
              {MC_CHOICES.map((ch) => {
                const on = cur.mc?.[q] === ch;
                return (
                  <button
                    key={ch}
                    type="button"
                    data-testid={`omr-key-mc-${q}-${ch}`}
                    onClick={() =>
                      update((k) => {
                        const mc = { ...(k.mc ?? {}) };
                        if (on) delete mc[q];
                        else mc[q] = ch;
                        return { ...k, mc };
                      })
                    }
                    className={cn(
                      "h-9 w-9 rounded-full border text-sm font-bold transition",
                      on
                        ? "border-[#4F46E5] bg-[#4F46E5] text-white"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                    )}
                  >
                    {ch}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {t.tfCount > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: t.tfCount }, (_, i) => String(i + 1)).map((q) => (
            <div key={q} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <p className="mb-2 text-sm font-semibold">
                {tr("Đúng/Sai câu", "True/False Q")} {q}
              </p>
              {TF_STATEMENTS.map((st) => {
                const v = cur.tf?.[q]?.[st];
                const set = (val: boolean | undefined) =>
                  update((k) => {
                    const tf = { ...(k.tf ?? {}) };
                    const row = { ...(tf[q] ?? {}) };
                    if (val === undefined) delete row[st];
                    else row[st] = val;
                    tf[q] = row;
                    return { ...k, tf };
                  });
                return (
                  <div key={st} className="flex items-center gap-2 py-0.5">
                    <span className="w-5 text-sm">{st})</span>
                    {[true, false].map((val) => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => set(v === val ? undefined : val)}
                        className={cn(
                          "h-8 min-w-12 rounded-lg border px-2 text-xs font-bold",
                          v === val
                            ? val
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : "border-rose-600 bg-rose-600 text-white"
                            : "border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"
                        )}
                      >
                        {val ? tr("Đúng", "True") : tr("Sai", "False")}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {t.saCount > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: t.saCount }, (_, i) => String(i + 1)).map((q) => (
            <label key={q} className="space-y-1 text-sm">
              <span className="font-semibold">
                {tr("Trả lời ngắn câu", "Short answer Q")} {q}
              </span>
              <Input
                value={cur.sa?.[q] ?? ""}
                maxLength={4}
                placeholder="-1,5"
                onChange={(e) => {
                  const v = e.target.value.replace(/[^-,0-9]/g, "").slice(0, 4);
                  update((k) => {
                    const sa = { ...(k.sa ?? {}) };
                    if (v) sa[q] = v;
                    else delete sa[q];
                    return { ...k, sa };
                  });
                }}
              />
            </label>
          ))}
        </div>
      )}

      <Button onClick={() => void save()} disabled={saving} data-testid="omr-key-save">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {tr("Lưu đáp án", "Save key")}
      </Button>
    </div>
  );
}
