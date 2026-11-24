import { describe, expect, it } from "vitest";
import { validatePdfBuffer } from "@/lib/pdf/server-pdf";
import { LocalStorageProvider } from "@/lib/storage/local";
import { verifySebHeaderIfNeeded } from "@/server/assignmentService";
import { checkRateLimit, resetRateLimits } from "@/lib/rate-limit";

describe("PDF Upload validation", () => {
  it("accepts valid PDF magic bytes", () => {
    const buf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
    expect(() => validatePdfBuffer(buf, "application/pdf")).not.toThrow();
  });

  it("rejects non-PDF files spoofed with .pdf extension / mime", () => {
    const fakePdf = Buffer.from("<html><script>alert(1)</script></html>");
    expect(() => validatePdfBuffer(fakePdf, "application/pdf")).toThrow(/magic bytes/i);
  });

  it("rejects empty files and non-PDF mime types", () => {
    expect(() => validatePdfBuffer(Buffer.alloc(0), "application/pdf")).toThrow();
    const buf = Buffer.from("%PDF-1.4\n...");
    expect(() => validatePdfBuffer(buf, "image/png")).toThrow();
  });
});

describe("LocalStorageProvider path traversal protection", () => {
  it("rejects keys containing .. traversal", async () => {
    const provider = new LocalStorageProvider("./uploads");
    await expect(provider.get("../../etc/passwd")).rejects.toThrow(/Invalid storage key/i);
  });
});

describe("SEB (Safe Exam Browser) header verification", () => {
  it("allows normal assignments without SEB header", () => {
    const headers = new Headers();
    expect(() =>
      verifySebHeaderIfNeeded({ proctorMode: "LOCKDOWN", sebConfigKeyHash: null }, headers)
    ).not.toThrow();
  });

  it("rejects missing or mismatched ConfigKeyHash in SEB mode", () => {
    const emptyHeaders = new Headers();
    expect(() =>
      verifySebHeaderIfNeeded({ proctorMode: "SEB", sebConfigKeyHash: "abc123" }, emptyHeaders)
    ).toThrow(/Safe Exam Browser/i);

    const wrongHeaders = new Headers({ "x-safeexambrowser-configkeyhash": "wrong-hash" });
    expect(() =>
      verifySebHeaderIfNeeded({ proctorMode: "SEB", sebConfigKeyHash: "abc123" }, wrongHeaders)
    ).toThrow(/không khớp/i);

    const validHeaders = new Headers({ "x-safeexambrowser-configkeyhash": "abc123" });
    expect(() =>
      verifySebHeaderIfNeeded({ proctorMode: "SEB", sebConfigKeyHash: "abc123" }, validHeaders)
    ).not.toThrow();
  });
});

describe("Rate limiting", () => {
  it("blocks requests exceeding threshold within window", () => {
    resetRateLimits();
    expect(checkRateLimit("test-key", 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit("test-key", 2, 60_000).allowed).toBe(true);
    const blocked = checkRateLimit("test-key", 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    resetRateLimits();
  });
});
