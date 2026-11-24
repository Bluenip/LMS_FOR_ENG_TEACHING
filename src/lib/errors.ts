export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly params?: Record<string, string | number>;

  constructor(
    message: string,
    statusCode = 400,
    code = "BAD_REQUEST",
    params?: Record<string, string | number>
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.params = params;
  }
}
