export class HttpError extends Error {
  public statusCode: number;
  /** Extra fields sent beside `message`, for a client that acts on the error (a `code`, a value). */
  public details?: Record<string, unknown>;

  constructor(statusCode: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}
