export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly params?: Record<string, string | number>;

  constructor(
    message: string,
    status: number,
    code?: string,
    params?: Record<string, string | number>
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

export function getSessionExpiryReason(error: unknown): "session" | "locked" | null {
  if (!(error instanceof ApiError)) return null;
  if (error.code === "ACCOUNT_LOCKED" && (error.status === 401 || error.status === 403)) {
    return "locked";
  }
  if (error.status === 401 && error.code === "UNAUTHORIZED") {
    return "session";
  }
  return null;
}

export async function apiFetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackError = "Request failed"
): Promise<T> {
  const res = await fetch(input, init);
  const body = (await res.json().catch(() => null)) as
    | { error?: string; code?: string; params?: Record<string, string | number> }
    | null;

  if (!res.ok) {
    throw new ApiError(
      body?.error || fallbackError,
      res.status,
      body?.code,
      body?.params
    );
  }

  return body as T;
}
