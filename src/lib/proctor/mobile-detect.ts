/**
 * Detects whether the student is taking an exam in a mobile browser / small touch viewport
 * where browser fullscreen API is unavailable or inappropriate.
 */
export function isMobileProctorEnvironment(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  if (!document.fullscreenEnabled) return true;
  if (window.innerWidth <= 480) return true;
  const hasCoarsePointer = Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
  const hasTouch = (navigator.maxTouchPoints ?? 0) > 0;
  return window.innerWidth < 768 && (hasCoarsePointer || hasTouch);
}
