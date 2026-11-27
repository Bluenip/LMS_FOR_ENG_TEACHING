"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LiveQuizPinForm() {
  const { tr } = useI18n();
  const router = useRouter();
  const [pin, setPin] = useState("");
  const valid = /^\d{6}$/.test(pin);

  return (
    <form
      className="stitch-card mx-auto w-full max-w-sm space-y-4 p-6 text-center"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`/live/${pin}`);
      }}
    >
      <Radio className="mx-auto h-10 w-10 text-[#4F46E5]" />
      <h1 className="text-2xl font-bold">Live Quiz</h1>
      <Input
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder={tr("Mã PIN 6 số", "6-digit PIN")}
        aria-label={tr("Mã PIN", "PIN")}
        className="h-14 text-center font-mono text-2xl tracking-[0.3em]"
        data-testid="live-pin-input"
      />
      <Button type="submit" size="lg" className="h-14 w-full text-lg" disabled={!valid} data-testid="live-pin-submit">
        {tr("Tiếp tục", "Continue")}
      </Button>
    </form>
  );
}
