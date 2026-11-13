import { isApiError } from "@/shared/api/http/api-error";

/*
 * SF-157: the Control Plane opens at session assurance, so an operator without
 * registered keys reads it but can't act. When an action answers
 * `enrollment_required`, the page that asked calls `requestKeyEnrollment`, and the
 * Control Plane gate shows the key registration card (AD0 `enroll`) until the
 * keys are registered or the person goes back. Presentation only: the backend
 * refused the action and keeps refusing until it is active.
 */

const listeners = new Set<() => void>();

/** Asks the Control Plane gate to show key registration. */
export function requestKeyEnrollment(): void {
  for (const listener of listeners) listener();
}

/** The gate's subscription; returns the unsubscribe function. */
export function onKeyEnrollmentRequest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Whether `error` is the backend's "register your keys first" answer. When it is,
 * the gate is asked to show key registration.
 */
export function needsEnrollment(error: unknown): boolean {
  if (!isApiError(error) || error.code !== "enrollment_required") return false;
  requestKeyEnrollment();
  return true;
}
