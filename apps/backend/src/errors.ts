export type AppErrorCode =
  | "MISSING_ENV"
  | "AIRTABLE_AUTH"
  | "MISSING_AIRTABLE_TABLE"
  | "MISSING_AIRTABLE_FIELD"
  | "WRONG_AIRTABLE_FIELD_TYPE"
  | "MISSING_LINKED_RECORD"
  | "AIRTABLE_REQUEST_FAILED"
  | "VALIDATION_FAILED";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toPublicError(error: unknown): {
  code: AppErrorCode | "UNKNOWN_ERROR";
  message: string;
  details?: Record<string, unknown>;
} {
  if (isAppError(error)) {
    return {
      code: error.code,
      message: error.message,
      details: error.details
    };
  }

  if (error instanceof Error) {
    return {
      code: "UNKNOWN_ERROR",
      message: error.message
    };
  }

  return {
    code: "UNKNOWN_ERROR",
    message: String(error)
  };
}
