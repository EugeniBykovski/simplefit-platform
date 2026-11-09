import { SessionChangedError } from "@/entities/session";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * Backend outcomes of the sponsor application calls (SF-113 / SF-114) as
 * the states the form shows. Branches on HTTP status, the error `code` and
 * the stable `details` / `field_codes` only, never on English messages.
 */

/** Message keys of `sponsorApplication.errors`. */
export type FieldMessage =
  "required" | "tooLong" | "invalidChoice" | "invalidFormat" | "notRequested" | "invalid";

export function messageFor(code: string): FieldMessage {
  switch (code) {
    case "required":
      return "required";
    case "too_long":
      return "tooLong";
    case "invalid_choice":
      return "invalidChoice";
    case "invalid_format":
      return "invalidFormat";
    case "not_requested":
      return "notRequested";
    default:
      return "invalid";
  }
}

export type Outcome =
  /** `422 validation_error`: the fields to mark (nothing was saved). */
  | { kind: "invalid"; fields: Record<string, FieldMessage> }
  /** `409 revision_conflict`: the application changed since it was read; nothing was written. */
  | { kind: "stale" }
  /** `409 account_registration: incomplete`: the account needs finishing first. */
  | { kind: "account" }
  /** `409 application: not_editable | not_submittable | exists`: the status moved on. */
  | { kind: "moved" }
  /** `409 declaration: stale | unavailable`: the declaration changed or isn't published. */
  | { kind: "declaration" }
  /** `409 client_request_id: reused`: this key belongs to another request; a new attempt is needed. */
  | { kind: "reused" }
  /** `409 evidence: limit_reached`. */
  | { kind: "evidenceLimit" }
  /** `409 upload: not_found | mismatch | expired` (SF-114 confirm). */
  | { kind: "upload"; reason: "not_found" | "mismatch" | "expired" | "other" }
  /** Any other `409`. */
  | { kind: "conflict" }
  /** `404`: the application or document is not the viewer's (existence is never revealed). */
  | { kind: "gone" }
  /** `401`, or the session changed while the call ran. */
  | { kind: "session" }
  /** `429`: `retryAfter` in seconds when the API said. */
  | { kind: "rateLimited"; retryAfter: number | null }
  /** `503`: a service the operation needs (storage, email) is unavailable; nothing changed. */
  | { kind: "unavailable" }
  /**
   * No answer, or a server error: the request may or may not have been
   * applied, so nothing is claimed. A retry is safe: creation and submission
   * are idempotent per key, and every other write carries its revision.
   */
  | { kind: "unconfirmed" };

export function outcomeOf(error: unknown): Outcome {
  if (error instanceof SessionChangedError) return { kind: "session" };
  if (!isApiError(error)) return { kind: "unconfirmed" };
  switch (error.status) {
    case 401:
      return { kind: "session" };
    case 404:
      return { kind: "gone" };
    case 409:
      return error.code === "revision_conflict" ? { kind: "stale" } : conflictOf(error.details);
    case 422:
      return {
        kind: "invalid",
        fields: Object.fromEntries(
          Object.entries(error.fieldCodes).map(([field, codes]) => [
            field,
            messageFor(codes[0] ?? "invalid"),
          ]),
        ),
      };
    case 429:
      return { kind: "rateLimited", retryAfter: error.retryAfterSeconds };
    case 503:
      return { kind: "unavailable" };
    default:
      return error.status >= 500 || error.status === 408
        ? { kind: "unconfirmed" }
        : { kind: "conflict" };
  }
}

function conflictOf(details: Record<string, unknown>): Outcome {
  if (details.account_registration === "incomplete") return { kind: "account" };
  if (["not_editable", "not_submittable", "exists"].includes(String(details.application))) {
    return { kind: "moved" };
  }
  if (details.declaration !== undefined) return { kind: "declaration" };
  if (details.client_request_id === "reused") return { kind: "reused" };
  if (details.evidence === "limit_reached") return { kind: "evidenceLimit" };
  if (details.upload !== undefined) {
    const reason = String(details.upload);
    return {
      kind: "upload",
      reason:
        reason === "not_found" || reason === "mismatch" || reason === "expired" ? reason : "other",
    };
  }
  return { kind: "conflict" };
}
