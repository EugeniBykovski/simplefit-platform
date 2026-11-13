import { isApiError } from "@/shared/api/http/api-error";

/*
 * What a failed password request shows. Branches on codes and statuses, never on
 * messages. Sign-in never says which of the address or the password was wrong,
 * because the API doesn't know it either (`invalid_credentials` for both).
 */

export type SignInFailure =
  | { kind: "invalid" }
  | { kind: "throttled"; retryAfterSeconds: number | null }
  | { kind: "suspended" }
  | { kind: "network" };

export function signInFailureOf(error: unknown): SignInFailure {
  if (!isApiError(error)) return { kind: "network" };
  if (error.code === "rate_limited") {
    return { kind: "throttled", retryAfterSeconds: error.retryAfterSeconds };
  }
  if (error.code === "account_suspended") return { kind: "suspended" };
  if (error.code === "invalid_credentials" || error.code === "validation_error") {
    return { kind: "invalid" };
  }
  return { kind: "network" };
}

export type ResetFailure =
  | { kind: "codeInvalid" }
  | { kind: "codeExpired" }
  | { kind: "weakPassword" }
  | { kind: "invalidEmail" }
  | { kind: "throttled"; retryAfterSeconds: number | null }
  | { kind: "network" };

export function resetFailureOf(error: unknown): ResetFailure {
  if (!isApiError(error)) return { kind: "network" };
  switch (error.code) {
    case "code_invalid":
      return { kind: "codeInvalid" };
    case "code_expired":
      return { kind: "codeExpired" };
    case "rate_limited":
      return { kind: "throttled", retryAfterSeconds: error.retryAfterSeconds };
    case "validation_error":
      if ("password" in error.fieldErrors) return { kind: "weakPassword" };
      if ("email" in error.fieldErrors) return { kind: "invalidEmail" };
      return { kind: "codeInvalid" };
    default:
      return { kind: "network" };
  }
}

/** The client-side length check (UX only; the API decides). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
