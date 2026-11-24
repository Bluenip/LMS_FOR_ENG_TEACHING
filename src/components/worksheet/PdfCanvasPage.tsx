"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useI18n } from "@/lib/i18n/client";

let pdfjsConfigured = false;

async function getPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjsConfigured && typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    pdfjsConfigured = true;
  }
  return pdfjs;
}

export function usePdfDocument(pdfUrl: string | null) {
  const { tr } = useI18n();
  // ref so switching language does not reload the PDF
  const trRef = useRef(tr);
  trRef.current = tr;
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pdfUrl) {
      setPdfDoc(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let activeDoc: PDFDocumentProxy | null = null;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const pdfjs = await getPdfJs();
        const loadingTask = pdfjs.getDocument({
          url: pdfUrl,
          withCredentials: true,
        });
        const doc = await loadingTask.promise;
        if (cancelled) {
          await doc.destroy();
          return;
        }
        activeDoc = doc;
        setPdfDoc(doc);
      } catch (err) {
        if (!cancelled) {
          console.error("PDF load error:", err);
          setError(trRef.current("Không thể tải tệp PDF. Vui lòng thử tải lại trang.", "Could not load the PDF file. Please reload the page."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (activeDoc) {
        void activeDoc.destroy();
      }
    };
  }, [pdfUrl]);

  return { pdfDoc, loading, error };
}

interface PdfCanvasPageProps {
  pdfDoc: PDFDocumentProxy | null;
  pageIndex: number; // 0-based
  widthPt: number;
  heightPt: number;
  zoom: number; // 0.5 .. 2.0 (1.0 = 100%)
  baseWidthPx?: number; // reference CSS width for a standard 595pt page at 100% zoom
  eager?: boolean;
  className?: string;
  children?: (dims: { widthPx: number; heightPx: number; scale: number }) => ReactNode;
}

/**
 * Renders a single PDF page onto a <canvas> (NO <iframe> or <embed>) with lazy IntersectionObserver loading.
 * Preserves exact native aspect ratio per page — mixed portrait & landscape pages stay 100% pixel-accurate!
 */
export function PdfCanvasPage({
  pdfDoc,
  pageIndex,
  widthPt,
  heightPt,
  zoom,
  baseWidthPx = 760,
  eager = false,
  className = "",
  children,
}: PdfCanvasPageProps) {
  const { tr } = useI18n();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [inView, setInView] = useState(eager);
  const [rendered, setRendered] = useState(false);

  // Reference scale based on standard A4 portrait width (595pt -> baseWidthPx at 100% zoom)
  // This ensures portrait (595x842) and landscape (842x595) pages keep consistent typography scale!
  const scale = (baseWidthPx / 595) * zoom;
  const widthPx = Math.round(widthPt * scale);
  const heightPx = Math.round(heightPt * scale);

  useEffect(() => {
    if (eager) {
      setInView(true);
      return;
    }
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    if (!pdfDoc || !inView) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageIndex + 1);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * dpr });

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        renderTask = page.render({
          canvasContext: ctx,
          viewport,
        });
        await renderTask.promise;
        if (!cancelled) {
          setRendered(true);
        }
      } catch (err) {
        if (!cancelled && (err as { name?: string })?.name !== "RenderingCancelledException") {
          console.error(`Failed rendering PDF page ${pageIndex + 1}:`, err);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch {
          // ignore cancel errors
        }
      }
    };
  }, [pdfDoc, inView, pageIndex, scale]);

  return (
    <div
      ref={containerRef}
      data-pdf-page={pageIndex}
      className={`relative mx-auto select-none overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md ${className}`}
      style={{
        width: `${widthPx}px`,
        height: `${heightPx}px`,
      }}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ width: `${widthPx}px`, height: `${heightPx}px` }}
      />
      {!rendered && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-50/80 text-xs font-medium text-slate-400">
          {tr("Đang hiển thị trang", "Showing page")} {pageIndex + 1}…
        </div>
      )}
      {/* Interactive overlay layer strictly matching canvas pixel bounds */}
      <div className="absolute inset-0">
        {children?.({ widthPx, heightPx, scale })}
      </div>
    </div>
  );
}
