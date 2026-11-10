import type { Operator } from "@/entities/operator";
import { isApiError } from "@/shared/api/http/api-error";
import { WebAuthnError } from "@/shared/lib/webauthn";

/**
 * AD0, the Control Plane entry (SF-120; Claude Design `AdminSignIn`, MVP). What
 * the gate shows is derived from the backend's operator answer only; the
 * browser adds nothing but where the person is in a ceremony. Every operator
 * call still checks permission and key on its own: opening the gate authorizes
 * nothing.
 */
export type Gate =
  /** First read in flight. */
  | { kind: "checking" }
  /** The read failed (network, 5xx): nothing is assumed. */
  | { kind: "loadFailed" }
  /** 404: not an operator, suspended or revoked; and a missing page looks the same. */
  | { kind: "unavailable" }
  /** Pending, past its enrolment window. */
  | { kind: "enrollmentExpired" }
  /** Pending: register keys until the backend's required number. */
  | { kind: "enroll"; registered: number; required: number }
  /** Active without a key check for this session; `lapsed` once one ran out. */
  | { kind: "key"; lapsed: boolean }
  /** Active with a key check: the Control Plane renders. */
  | { kind: "open"; operator: Operator };

export function decideGate(
  read: { status: "pending" | "error" | "success"; data: Operator | null | undefined },
  now: number,
  hadKeyCheck: boolean,
): Gate {
  if (read.data === undefined) return { kind: read.status === "error" ? "loadFailed" : "checking" };
  const operator = read.data;
  if (operator === null) return { kind: "unavailable" };
  if (operator.status === "pending_enrollment") {
    const deadline = operator.enrollment_expires_at;
    if (deadline !== null && Date.parse(deadline) <= now) return { kind: "enrollmentExpired" };
    return {
      kind: "enroll",
      registered: operator.security_keys.registered,
      required: operator.security_keys.required,
    };
  }
  const expiresAt = operator.step_up === null ? undefined : Date.parse(operator.step_up.expires_at);
  if (expiresAt !== undefined && expiresAt > now) return { kind: "open", operator };
  return { kind: "key", lapsed: hadKeyCheck || expiresAt !== undefined };
}

/** How a ceremony ended badly, for the card to say so. */
export type CeremonyProblem =
  /** The person cancelled, the prompt timed out, or the key didn't verify. */
  | "failed"
  /** This authenticator already holds one of the account's keys. */
  | "duplicate"
  /** The backend refused the key (a synced passkey, or verification failed). */
  | "rejected"
  | "rateLimited"
  /** States that end the ceremony, not just this attempt. */
  | "unsupported"
  | "serviceUnavailable"
  | "enrollmentExpired"
  /** The operator answer changed (revoked meanwhile, or enrolment completed elsewhere). */
  | "stale";

/** Maps a ceremony error to what the card shows; branches on codes, never messages. */
export function ceremonyProblem(error: unknown): CeremonyProblem {
  if (error instanceof WebAuthnError) {
    if (error.reason === "unsupported") return "unsupported";
    if (error.reason === "duplicate") return "duplicate";
    return "failed";
  }
  if (!isApiError(error)) return "failed";
  if (error.status === 429) return "rateLimited";
  if (error.status === 503) return "serviceUnavailable";
  if (error.code === "security_key_rejected") return "rejected";
  if (error.status === 409) {
    if (error.details.enrollment === "expired") return "enrollmentExpired";
    if (error.details.credential === "already_registered") return "duplicate";
    return "stale";
  }
  if (error.status === 404 || error.status === 403) return "stale";
  return "failed";
}
