import { SessionChangedError } from "@/entities/session";
import { isApiError } from "@/shared/api/http/api-error";

/**
 * Backend outcomes of the Gym setup calls (SF-83 / SF-85) as the states the
 * steps show. Branches on HTTP status and the stable codes only
 * (`details.field_codes`, the 409 `details`), never on English messages.
 */

/** The fields whose `required` code has its own message. */
type RequiredField = "name" | "gym_type" | "country_code" | "city" | "address_line";
const REQUIRED: ReadonlySet<string> = new Set<RequiredField>([
  "name",
  "gym_type",
  "country_code",
  "city",
  "address_line",
]);

/** Message keys of the `gymOnboarding.errors` namespace. */
export type FieldMessage =
  `required.${RequiredField}` | "tooLong" | "invalidChoice" | "invalidFormat" | "invalid";

/** The message for the first reason code of `field`. */
export function messageFor(field: string, code: string): FieldMessage {
  if (code === "required" && REQUIRED.has(field)) return `required.${field}` as FieldMessage;
  if (code === "too_long") return "tooLong";
  if (code === "invalid_choice") return "invalidChoice";
  if (code === "invalid_format") return "invalidFormat";
  return "invalid";
}

/** A completion requirement `completeGymSetup` can report. */
export type Requirement = "name" | "gym_type" | "primary_location";
const REQUIREMENTS: readonly string[] = ["name", "gym_type", "primary_location"];

export type Outcome =
  /** `422`: fields to mark; `missing` are completion requirements, in API order. */
  | {
      kind: "invalid";
      fields: Record<string, FieldMessage>;
      missing: Requirement[];
      accountRegistration: boolean;
    }
  /** `409 revision: stale`: the setup changed since it was read; nothing was written. */
  | { kind: "stale" }
  /** `409 client_request_id: discarded`: this create key's gym was discarded. */
  | { kind: "discarded" }
  /** `409 client_request_id: reused`: the key belongs to a gym the viewer left. */
  | { kind: "reused" }
  /** `409 setup_status: completed`: the gym was completed meanwhile. */
  | { kind: "completed" }
  /** Any other `409` (for example the ownership check). */
  | { kind: "conflict" }
  /** `403`: the viewer's role cannot change this gym's setup. */
  | { kind: "forbidden" }
  /** `404`: the gym is gone or no longer the viewer's (existence is never revealed). */
  | { kind: "gone" }
  /** `401`: the session ended. */
  | { kind: "session" }
  /** `429`: too many gym creations; `retryAfter` in seconds when the API said. */
  | { kind: "rateLimited"; retryAfter: number | null }
  /**
   * No answer, or a server error: the request may or may not have been
   * applied, so nothing is claimed either way. A retry is safe: creation is
   * idempotent per key and every partial write carries its revision.
   */
  | { kind: "unconfirmed" };

/** What a failed setup call means for the step that made it. */
export function outcomeOf(error: unknown): Outcome {
  // The session ended (or another user signed in) while the call ran: its
  // answer belongs to the previous session and is never applied here.
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
      return conflictOf(error.details);
    case 422:
      return invalidOf(error.fieldCodes);
    case 429:
      return { kind: "rateLimited", retryAfter: error.retryAfterSeconds };
    default:
      return error.status >= 500 || error.status === 408
        ? { kind: "unconfirmed" }
        : { kind: "conflict" };
  }
}

function conflictOf(details: Record<string, unknown>): Outcome {
  if (details.revision === "stale") return { kind: "stale" };
  if (details.client_request_id === "discarded") return { kind: "discarded" };
  if (details.client_request_id === "reused") return { kind: "reused" };
  if (details.setup_status === "completed") return { kind: "completed" };
  return { kind: "conflict" };
}

function invalidOf(fieldCodes: Record<string, string[]>): Outcome {
  const fields: Record<string, FieldMessage> = {};
  const missing: Requirement[] = [];
  let accountRegistration = false;
  for (const [field, codes] of Object.entries(fieldCodes)) {
    if (field === "account_registration") {
      accountRegistration = true;
      continue;
    }
    fields[field] = messageFor(field, codes[0] ?? "invalid");
    if (codes.includes("required") && REQUIREMENTS.includes(field)) {
      missing.push(field as Requirement);
    }
  }
  return { kind: "invalid", fields, missing, accountRegistration };
}
