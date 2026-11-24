import { describe, expect, it } from "vitest";
import { ApiError, getSessionExpiryReason } from "@/lib/api-client";
import { localizeApiError, localizeNotification } from "@/lib/i18n/api-errors";

describe("Phase 11: Session expiry detection", () => {
  it("detects 401 UNAUTHORIZED as expired session", () => {
    const err = new ApiError("Tài khoản không tồn tại.", 401, "UNAUTHORIZED");
    expect(getSessionExpiryReason(err)).toBe("session");
  });

  it("detects 401/403 ACCOUNT_LOCKED as locked session", () => {
    expect(
      getSessionExpiryReason(new ApiError("Tài khoản bị khoá.", 403, "ACCOUNT_LOCKED"))
    ).toBe("locked");
    expect(
      getSessionExpiryReason(new ApiError("Tài khoản bị khoá.", 401, "ACCOUNT_LOCKED"))
    ).toBe("locked");
  });

  it("ignores normal 403 FORBIDDEN, 500 errors, and non-ApiError errors", () => {
    expect(getSessionExpiryReason(new ApiError("Forbidden", 403, "FORBIDDEN"))).toBeNull();
    expect(getSessionExpiryReason(new ApiError("Server error", 500, "INTERNAL_ERROR"))).toBeNull();
    expect(getSessionExpiryReason(new Error("Generic error"))).toBeNull();
    expect(getSessionExpiryReason(null)).toBeNull();
  });
});

describe("Phase 11: Server API error & notification localization", () => {
  it("keeps Vietnamese messages unchanged for locale=vi", () => {
    expect(localizeApiError("Không tìm thấy phiếu bài tập.", "NOT_FOUND", "vi")).toBe(
      "Không tìm thấy phiếu bài tập."
    );
  });

  it("translates exact Vietnamese API and Zod errors into English", () => {
    expect(localizeApiError("Tài khoản không tồn tại.", "UNAUTHORIZED", "en")).toBe(
      "Account does not exist."
    );
    expect(localizeApiError("Không tìm thấy phiếu bài tập.", "NOT_FOUND", "en")).toBe(
      "Worksheet not found."
    );
    expect(localizeApiError("Email không hợp lệ", "VALIDATION_ERROR", "en")).toBe(
      "Invalid email address."
    );
  });

  it("translates parameterized Vietnamese errors into English", () => {
    expect(
      localizeApiError("File vượt quá dung lượng tối đa 20MB.", "FILE_TOO_LARGE", "en")
    ).toBe("File exceeds the maximum size of 20MB.");
    expect(
      localizeApiError(
        'Bạn đã dùng hết 2 lượt nghe cho file "Track 1".',
        "AUDIO_PLAY_LIMIT_REACHED",
        "en"
      )
    ).toBe('You have used all 2 play(s) for "Track 1".');
    expect(
      localizeApiError("Không thể xoá câu 1, 2 vì đã có học sinh trả lời.", "FIELD_HAS_ANSWERS", "en")
    ).toBe("Cannot delete question(s) 1, 2 because students have already answered them.");
  });

  it("falls back by error code for unknown Vietnamese messages in EN", () => {
    expect(localizeApiError("Một lỗi tiếng Việt mới.", "FORBIDDEN", "en")).toBe(
      "You do not have permission to perform this action."
    );
  });

  it("translates Vietnamese notifications into English", () => {
    const localized = localizeNotification(
      {
        title: "Đã được duyệt vào lớp 12A1",
        body: "Giáo viên đã chấp nhận yêu cầu tham gia lớp 12A1.",
      },
      "en"
    );
    expect(localized.title).toBe("Approved to join 12A1");
    expect(localized.body).toBe("The teacher approved your request to join 12A1.");
  });
});
