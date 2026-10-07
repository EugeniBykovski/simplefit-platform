import type { ErrorResponse } from "@/shared/api/generated/model";

/** Field name to messages, from a backend `validation_error` response. */
export type FieldErrors = Record<string, string[]>;

/**
 * Error thrown for every non-2xx API response.
 *
 * Mirrors the backend error envelope (`ErrorResponse`). Branch on `code`,
 * never on `message`: messages are human-readable and may change. Unknown
 * codes must be handled according to `status`.
 */
export class ApiError extends Error {
  override readonly name = "ApiError";

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown>,
    readonly requestId: string | null,
    /** Seconds from the `retry-after` header (`rate_limited`), when the API sent one. */
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
  }

  /** Builds an ApiError from a response body that may or may not be the envelope. */
  static fromResponse(
    status: number,
    body: unknown,
    requestId: string | null,
    retryAfter: string | null = null,
  ): ApiError {
    const retryAfterSeconds = parseRetryAfter(retryAfter);
    if (isErrorResponse(body)) {
      const { code, message, details, request_id } = body.error;
      return new ApiError(
        status,
        code,
        message,
        details,
        request_id ?? requestId,
        retryAfterSeconds,
      );
    }
    return new ApiError(
      status,
      "unexpected_response",
      `Unexpected API response (HTTP ${status})`,
      {},
      requestId,
      retryAfterSeconds,
    );
  }

  /** Field errors when this is a `validation_error`, otherwise an empty object. */
  get fieldErrors(): FieldErrors {
    if (this.code !== "validation_error") return {};
    const fields = this.details.fields;
    if (typeof fields !== "object" || fields === null) return {};

    return Object.fromEntries(
      Object.entries(fields).filter(
        (entry): entry is [string, string[]] =>
          Array.isArray(entry[1]) && entry[1].every((message) => typeof message === "string"),
      ),
    );
  }
}

/** The delay-seconds form of `retry-after` (the API never sends an HTTP date). */
function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function isErrorResponse(body: unknown): body is ErrorResponse {
  if (typeof body !== "object" || body === null || !("error" in body)) return false;
  const error = (body as { error: unknown }).error;
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as Record<string, unknown>).code === "string" &&
    typeof (error as Record<string, unknown>).message === "string"
  );
}
