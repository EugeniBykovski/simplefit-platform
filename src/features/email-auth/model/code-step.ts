import { isApiError } from "@/shared/api/http/api-error";
import type { CodeInputState } from "@/shared/ui/code-input";

/**
 * States of the 6-digit code step (Claude Design O01c / WA1b for sign-in,
 * O03 / WA4 for sign-up). `invalid`, `expired`, `throttled`, `success` and
 * `verified-elsewhere` come from the API; `typing`, `submitting`, the
 * countdown and `sent` / `resent` (shown after an accepted request) are
 * local.
 */
export type CodeStepStatus =
  | "sent"
  | "typing"
  | "resent"
  | "invalid"
  | "expired"
  | "submitting"
  | "success"
  | "throttled"
  | "error"
  | "verified-elsewhere";

export type Purpose = "sign-in" | "registration";

/** What a failed code verification means for the step. Branches on `code`, never on messages. */
export function statusForVerifyError(
  error: unknown,
  purpose: Purpose,
): { status: CodeStepStatus; retryAfterSeconds?: number } {
  if (!isApiError(error)) return { status: "error" };
  switch (error.code) {
    case "code_invalid":
      return { status: "invalid" };
    case "code_expired":
      return { status: "expired" };
    case "rate_limited":
      return { status: "throttled", retryAfterSeconds: error.retryAfterSeconds ?? undefined };
    case "verified_elsewhere":
    case "conflict":
      // The address now has an account (verified through the link, or taken
      // meanwhile): this device continues with a NEW sign-in challenge.
      return purpose === "registration" ? { status: "verified-elsewhere" } : { status: "error" };
    default:
      return { status: "error" };
  }
}

export type RequestFailure = "invalidEmail" | "rateLimited" | "generic";

/** What a failed code request (email step or resend) shows. */
export function requestFailureOf(error: unknown): RequestFailure {
  if (!isApiError(error)) return "generic";
  if (error.code === "validation_error") return "invalidEmail";
  if (error.code === "rate_limited") return "rateLimited";
  return "generic";
}

/** The look of the six cells for a step status (component "AuthCodeInput"). */
export function inputStateFor(status: CodeStepStatus, code: string): CodeInputState {
  switch (status) {
    case "invalid":
      return "error";
    case "expired":
      return "expired";
    case "submitting":
      return "submitting";
    case "success":
      return "success";
    case "throttled":
    case "verified-elsewhere":
      return "locked";
    case "error":
      return "filled";
    default:
      return code.length === 6 ? "filled" : "typing";
  }
}

/** Statuses whose next keystroke returns the step to plain typing. */
export const EDITABLE: ReadonlySet<CodeStepStatus> = new Set([
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
