"use client";

import { useEffect, useRef } from "react";

const IGNORED_PATTERNS = [
  /ResizeObserver loop/i,
  /ChunkLoadError/i,
  /AbortError/i,
];

function sendClientError(payload: {
  message: string;
  stack?: string;
  path?: string;
  meta?: Record<string, unknown>;
}) {
  if (!payload.message || IGNORED_PATTERNS.some((re) => re.test(payload.message))) {
    return;
  }
  try {
    void fetch("/api/errors/client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify(payload),
    }).catch(() => undefined);
  } catch {
    // ignore network failure in error reporter
  }
}

export function ErrorReporter() {
  const sentTimestampsRef = useRef<number[]>([]);
  const lastSignatureRef = useRef<string>("");

  useEffect(() => {
    const canReport = (signature: string): boolean => {
      const now = Date.now();
      sentTimestampsRef.current = sentTimestampsRef.current.filter((t) => now - t < 60_000);
      if (sentTimestampsRef.current.length >= 5) return false;
      if (signature === lastSignatureRef.current && sentTimestampsRef.current.length > 0) {
        return false;
      }
      lastSignatureRef.current = signature;
      sentTimestampsRef.current.push(now);
      return true;
    };

    const onError = (event: ErrorEvent) => {
      const message = event.message || event.error?.message || "Unhandled window error";
      const stack = typeof event.error?.stack === "string" ? event.error.stack : undefined;
      const sig = `err:${message}`;
      if (!canReport(sig)) return;
      sendClientError({
        message,
        stack,
        path: window.location.pathname,
        meta: {
          filename: event.filename || undefined,
          lineno: event.lineno || undefined,
          colno: event.colno || undefined,
        },
      });
    };

    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "Unhandled promise rejection";
      const stack = reason instanceof Error ? reason.stack : undefined;
      const sig = `rej:${message}`;
      if (!canReport(sig)) return;
      sendClientError({
        message,
        stack,
        path: window.location.pathname,
        meta: { type: "unhandledrejection" },
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
