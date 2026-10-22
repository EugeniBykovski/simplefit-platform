import { isApiError } from "@/shared/api/http/api-error";
import type { CodeInputState } from "@/shared/ui/code-input";

/**
 * Verified email identity linking (SF-77, ADR 0024): a signed-in user adds an
 * email identity to their own account by entering a code sent to the address,
 * in the same session. The backend owns everything that matters (ownership,
 * normalization, the challenge, expiry, attempts, limits, uniqueness,
 * conflicts); these helpers only map its answers to what the screen shows.
 * They branch on `code`, never on messages.
 */

/** The email step (WFI1 `link-email*` states). */
export type EmailStatus = "idle" | "invalid" | "sending" | "limited" | "error";

/** The code step (WFI1 `link-code` … `link-error` states). */
export type CodeStatus =
  | "sent"
  | "typing"
  | "resent"
  | "invalid"
  | "expired"
  | "submitting"
  | "throttled"
  | "conflict"
  | "session"
  | "error";

export type LinkOutcome = "linked" | "already_linked";

/** What a failed `confirmMyEmailIdentityLink` means. `uncertain`: no answer came back. */
export type ConfirmFailure =
  | { status: "invalid" | "expired" | "conflict" | "session" }
  | { status: "throttled"; retryAfterSeconds: number | undefined }
  | { status: "uncertain" };

export function confirmFailureOf(error: unknown): ConfirmFailure {
  if (!isApiError(error)) return { status: "uncertain" };
  switch (error.code) {
    case "code_invalid":
      return { status: "invalid" };
    case "code_expired":
      return { status: "expired" };
    // Reachable only with the correct code (ADR 0024): the address is an
    // identity of another account. Nothing is moved or merged.
    case "conflict":
      return { status: "conflict" };
    case "unauthorized":
      return { status: "session" };
    case "rate_limited":
      return { status: "throttled", retryAfterSeconds: error.retryAfterSeconds ?? undefined };
    default:
      // A 5xx or anything unexpected says nothing reliable about whether the
      // link committed: reconcile with the identity list, like a lost answer.
      return { status: "uncertain" };
  }
}

/** What a failed `requestMyEmailIdentityLink` (send or resend) means. */
export type RequestFailure = "invalid" | "limited" | "session" | "error";

export function requestFailureOf(error: unknown): {
  failure: RequestFailure;
  retryAfterSeconds?: number;
} {
  if (!isApiError(error)) return { failure: "error" };
  if (error.code === "validation_error") return { failure: "invalid" };
  if (error.code === "rate_limited") {
    return { failure: "limited", retryAfterSeconds: error.retryAfterSeconds ?? undefined };
  }
  if (error.code === "unauthorized") return { failure: "session" };
  return { failure: "error" };
}

// A shape check for UX only; the API validates and normalizes the address.
export const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/**
 * The canonical form the API stores (ADR 0009: trimmed, ASCII lowercase,
 * nothing else rewritten). Used only to find the address in the user's own
 * identity list after a lost response; the list is the authority.
 */
export const canonicalEmail = (value: string) =>
  value.trim().replace(/[A-Z]/g, (letter) => letter.toLowerCase());

/** The look of the six cells for a code status (component "AuthCodeInput"). */
export function cellsFor(status: CodeStatus, code: string): CodeInputState {
  switch (status) {
    case "invalid":
      return "error";
    case "expired":
      return "expired";
    case "submitting":
      return "submitting";
    case "throttled":
    case "session":
      return "locked";
    case "conflict":
    case "error":
      return "filled";
    default:
      return code.length === 6 ? "filled" : "typing";
  }
}

/** Statuses whose next keystroke returns the step to plain typing. */
export const EDITABLE: ReadonlySet<CodeStatus> = new Set([
  "sent",
  "typing",
  "resent",
  "invalid",
  "error",
]);

/** "0:42" */
export function formatCountdown(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
