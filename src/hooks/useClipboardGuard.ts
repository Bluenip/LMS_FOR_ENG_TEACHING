"use client";

import { useEffect, useRef } from "react";
import type { ProctorEventType } from "@prisma/client";

export interface ClipboardGuardEvent {
  type: ProctorEventType;
  meta?: Record<string, unknown>;
}

interface UseClipboardGuardOptions {
  /** Active whenever blockCopyPaste is enabled or proctorMode !== "OFF". */
  enabled: boolean;
  /** "block" prevents the action & warns; "monitor" only logs events. */
  mode?: "block" | "monitor";
  /** Whether to also block selecting non-input text (e.g. exam prompts). */
  blockSelection?: boolean;
  /** Called when a blocked or suspicious clipboard/drop action is detected. */
  onEvent?: (event: ClipboardGuardEvent) => void;
  /** Called with a human-readable warning message for toast display. */
  onWarn?: (message: string) => void;
  /** Translation helper. */
  tr?: (viText: string, enText: string) => string;
}

const BLOCKED_INPUT_TYPES = new Set([
  "insertFromPaste",
  "insertFromPasteAsQuotation",
  "insertFromDrop",
  "insertFromYank",
  "insertReplacementText",
]);

/** Single-event text jump threshold for indirect paste detection (heuristic only). */
export const INDIRECT_PASTE_CHAR_THRESHOLD = 15;

export function useClipboardGuard({
  enabled,
  mode = "block",
  blockSelection = true,
  onEvent,
  onWarn,
  tr = (v) => v,
}: UseClipboardGuardOptions) {
  const onEventRef = useRef(onEvent);
  const onWarnRef = useRef(onWarn);
  const trRef = useRef(tr);
  useEffect(() => {
    onEventRef.current = onEvent;
    onWarnRef.current = onWarn;
    trRef.current = tr;
  }, [onEvent, onWarn, tr]);

  useEffect(() => {
    if (!enabled) return;

    const shouldBlock = mode === "block";
    const prevLengths = new WeakMap<EventTarget, number>();
    let lastPasteSuspectedAt = 0;

    const isEditable = (el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement =>
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;

    const onCopy = (e: ClipboardEvent) => {
      if (shouldBlock) {
        e.preventDefault();
        onWarnRef.current?.(
          trRef.current(
            "Sao chép bị vô hiệu hoá trong bài làm này.",
            "Copying is disabled for this assignment."
          )
        );
      }
      onEventRef.current?.({ type: "COPY" });
    };

    const onPaste = (e: ClipboardEvent) => {
      if (shouldBlock) {
        e.preventDefault();
        onWarnRef.current?.(
          trRef.current(
            "Dán văn bản bị vô hiệu hoá trong bài làm này.",
            "Pasting is disabled for this assignment."
          )
        );
      }
      onEventRef.current?.({ type: "PASTE" });
    };

    const onCut = (e: ClipboardEvent) => {
      if (shouldBlock) e.preventDefault();
      onEventRef.current?.({ type: "CUT" });
    };

    const onContextMenu = (e: MouseEvent) => {
      if (shouldBlock) e.preventDefault();
      onEventRef.current?.({ type: "CONTEXT_MENU" });
    };

    const onDragOver = (e: DragEvent) => {
      if (!shouldBlock) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "none";
      }
    };

    const onDragStart = (e: DragEvent) => {
      if (!shouldBlock) return;
      e.preventDefault();
    };

    const onDrop = (e: DragEvent) => {
      if (shouldBlock) {
        e.preventDefault();
        onWarnRef.current?.(
          trRef.current(
            "Kéo thả văn bản vào ô trả lời bị vô hiệu hoá.",
            "Dragging and dropping text is disabled."
          )
        );
      }
      onEventRef.current?.({ type: "DROP" });
    };

    const onBeforeInput = (e: InputEvent) => {
      if (e.inputType && BLOCKED_INPUT_TYPES.has(e.inputType)) {
        const isDrop = e.inputType === "insertFromDrop";
        if (shouldBlock) {
          e.preventDefault();
          onWarnRef.current?.(
            isDrop
              ? trRef.current(
                  "Kéo thả văn bản vào ô trả lời bị vô hiệu hoá.",
                  "Dragging and dropping text is disabled."
                )
              : trRef.current(
                  "Chèn/dán văn bản bị vô hiệu hoá trong bài làm này.",
                  "Inserting/pasting text is disabled for this assignment."
                )
          );
        }
        onEventRef.current?.({
          type: isDrop ? "DROP" : "PASTE",
          meta: { inputType: e.inputType },
        });
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      if (isEditable(e.target)) {
        prevLengths.set(e.target, e.target.value.length);
      }
    };

    const onInput = (e: Event) => {
      if (!isEditable(e.target)) return;
      const prev = prevLengths.get(e.target) ?? 0;
      const next = e.target.value.length;
      prevLengths.set(e.target, next);

      const delta = next - prev;
      if (delta >= INDIRECT_PASTE_CHAR_THRESHOLD) {
        const now = Date.now();
        if (now - lastPasteSuspectedAt > 4000) {
          lastPasteSuspectedAt = now;
          onEventRef.current?.({
            type: "PASTE_SUSPECTED",
            meta: { addedChars: delta },
          });
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldBlock && (e.ctrlKey || e.metaKey)) {
        const k = e.key.toLowerCase();
        if (["c", "v", "x", "p", "u"].includes(k)) {
          e.preventDefault();
        }
        if (k === "a" && blockSelection && !isEditable(e.target)) {
          e.preventDefault();
        }
      }
    };

    document.addEventListener("copy", onCopy, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("cut", onCut, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("dragover", onDragOver, true);
    document.addEventListener("dragstart", onDragStart, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("beforeinput", onBeforeInput, true);
    document.addEventListener("focusin", onFocusIn, true);
    document.addEventListener("input", onInput, true);
    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("copy", onCopy, true);
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("cut", onCut, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("dragover", onDragOver, true);
      document.removeEventListener("dragstart", onDragStart, true);
      document.removeEventListener("drop", onDrop, true);
      document.removeEventListener("beforeinput", onBeforeInput, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("input", onInput, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [enabled, mode, blockSelection]);
}
