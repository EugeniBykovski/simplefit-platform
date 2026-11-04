import { isApiError } from "@/shared/api/http/api-error";

/** Thrown when the browser could not hand a file to storage (nothing was attached). */
export class UploadFailedError extends Error {
  override readonly name = "UploadFailedError";
}

/**
 * Why a verification action (save, add, confirm or remove a document,
 * submit) or read did not happen, from the SF-103 error contract's `code`
 * and `details` (never a message). The backend decides every one.
 *
 * - `stale`: the application changed elsewhere (another tab or device);
 *   the page reads it again and nothing is overwritten.
 * - `frozen`: the application is submitted or decided and cannot change.
 * - `uploadPending`: a document is still uploading; confirm or remove it.
 * - `uploadMissing` / `uploadMismatch`: storage has no such file, or a
 *   different one; nothing was attached.
 * - `documentSubmitted`: a submitted document cannot be removed.
 * - `uploadFailed`: the browser could not send the file to storage; the
 *   document stays "uploading" until confirmed again or removed.
 * - `limitReached`, `draft` (the gym's setup is not completed),
 *   `storageUnavailable` (503), `limited` (429), `forbidden` (403: only the
 *   owner), `gone` (404), `session` (401), `invalid` (422), `unknown`
 *   (the connection dropped; the state is read again, nothing is claimed),
 *   `loadFailed`, `failed`.
 */
export type VerificationProblem =
  | { kind: "stale" }
  | { kind: "frozen" }
  | { kind: "uploadPending" }
  | { kind: "uploadMissing" }
  | { kind: "uploadMismatch" }
  | { kind: "documentSubmitted" }
  | { kind: "uploadFailed" }
  | { kind: "limitReached" }
  | { kind: "draft" }
  | { kind: "storageUnavailable" }
  | { kind: "limited"; minutes: number | null }
  | { kind: "forbidden" }
  | { kind: "gone" }
  | { kind: "session" }
  | { kind: "invalid" }
  | { kind: "unknown" }
  | { kind: "loadFailed" }
  | { kind: "failed" };

function conflict(details: Record<string, unknown>): VerificationProblem {
  if (details["revision"] === "stale") return { kind: "stale" };
  if (details["evidence"] === "upload_pending") return { kind: "uploadPending" };
  if (details["evidence"] === "limit_reached") return { kind: "limitReached" };
  if (details["evidence"] === "submitted") return { kind: "documentSubmitted" };
  if (details["evidence"] === "removed") return { kind: "gone" };
  if (details["upload"] === "not_found") return { kind: "uploadMissing" };
  if (details["upload"] === "mismatch") return { kind: "uploadMismatch" };
  if (details["setup_status"] !== undefined) return { kind: "draft" };
  if (details["verification"] !== undefined) return { kind: "frozen" };
  return { kind: "failed" };
}

export function verificationProblem(error: unknown): VerificationProblem {
  if (error instanceof UploadFailedError) return { kind: "uploadFailed" };
  if (!isApiError(error)) return { kind: "unknown" };
  if (error.code === "rate_limited") {
    const seconds = error.retryAfterSeconds;
    return {
      kind: "limited",
      minutes: seconds === null ? null : Math.max(1, Math.ceil(seconds / 60)),
    };
  }
  if (error.code === "conflict") return conflict(error.details);
  if (error.code === "validation_error") return { kind: "invalid" };
  if (error.code === "service_unavailable") return { kind: "storageUnavailable" };
  if (error.status === 401) return { kind: "session" };
  if (error.status === 403) return { kind: "forbidden" };
  if (error.status === 404) return { kind: "gone" };
  if (error.status >= 500 || error.status === 0) return { kind: "unknown" };
  return { kind: "failed" };
}

/** A failed read changes nothing: a dropped connection is `loadFailed`. */
export function verificationReadProblem(error: unknown): VerificationProblem {
  const problem = verificationProblem(error);
  return problem.kind === "unknown" ? { kind: "loadFailed" } : problem;
}

/** Whether a problem is a failure (coral) rather than an expected refusal (amber). */
export const isVerificationFailure = (problem: VerificationProblem) =>
  ["failed", "unknown", "loadFailed", "storageUnavailable", "uploadFailed"].includes(problem.kind);
