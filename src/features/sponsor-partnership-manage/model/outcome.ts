import { SessionChangedError } from "@/entities/session";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * Backend outcomes of the partnership writes (SF-130) as the states the forms
 * show. Branches on HTTP status, the error `code`, `details` and `field_codes`
 * only, never on English messages.
 */

/** Message keys of `sponsorPartnerships.errors.fields`. */
export type FieldMessage =
  "required" | "tooShort" | "tooLong" | "invalidChoice" | "notRequested" | "invalid";

export function messageFor(code: string): FieldMessage {
  switch (code) {
    case "required":
      return "required";
    case "too_short":
      return "tooShort";
    case "too_long":
      return "tooLong";
    case "invalid_choice":
      return "invalidChoice";
    case "not_requested":
      return "notRequested";
    default:
      return "invalid";
  }
}

export type Outcome =
  /** `422 validation_error`: the fields to mark; nothing was saved. */
  | { kind: "invalid"; fields: Record<string, FieldMessage> }
  /** `409 revision_conflict`: someone saved first; nothing was written. */
  | { kind: "stale" }
  /** `409 organization: suspended | closed`: the organization is read-only now. */
  | { kind: "readOnly" }
  /** `409 proposal: not_editable | not_submittable | not_withdrawable`: the status moved on. */
  | { kind: "moved" }
  /** `409 proposals: open_limit`. */
  | { kind: "openLimit" }
  /** `409 client_request_id: reused`: a new attempt needs a new key. */
  | { kind: "reused" }
  /** Any other `409`. */
  | { kind: "conflict" }
  /** `403`: the viewer's role can't do this (now). */
  | { kind: "forbidden" }
  /** `404`: not this organization's, or the membership ended. Existence is never revealed. */
  | { kind: "gone" }
  /** `401`, or the session changed while the call ran. */
  | { kind: "session" }
  /** `429`: `retryAfter` in seconds when the API said. */
  | { kind: "rateLimited"; retryAfter: number | null }
  /**
   * No answer, or a server error: the write may or may not have happened, so
   * nothing is claimed. Retrying is safe: creation, submission and withdrawal
   * repeat with the same key, and every other write names its revision.
   */
  | { kind: "unconfirmed" };

export function outcomeOf(error: unknown): Outcome {
  if (error instanceof SessionChangedError) return { kind: "session" };
  if (!isApiError(error)) return { kind: "unconfirmed" };
  switch (error.status) {
    case 401:
      return { kind: "session" };
    case 403:
      return { kind: "forbidden" };
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
    default:
      return { kind: "unconfirmed" };
  }
}

function conflictOf(details: Record<string, unknown>): Outcome {
  if (typeof details.organization === "string") return { kind: "readOnly" };
  if (typeof details.proposal === "string") return { kind: "moved" };
  if (details.proposals === "open_limit") return { kind: "openLimit" };
  if (details.client_request_id === "reused") return { kind: "reused" };
  return { kind: "conflict" };
}

/** Whether the request may already have been applied, so the same key must be reused. */
export const keepKey = (outcome: Outcome) => outcome.kind === "unconfirmed";
