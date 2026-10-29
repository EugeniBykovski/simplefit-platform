import { isApiError } from "@/shared/api/http/api-error";

/**
 * Why a staff action did not happen, in the administrator's terms (SF-93
 * error contract). The backend decides every action; this only names its
 * answer. A dropped connection or a timeout is `unknown`: the action may or
 * may not have been applied, so the lists are read again and nothing is
 * claimed.
 */
export type StaffProblem =
  | { kind: "limited"; minutes: number | null }
  | { kind: "pendingOtherRole" }
  | { kind: "alreadyActive" }
  | { kind: "noResends" }
  | { kind: "notPending" }
  | { kind: "resolved" }
  | { kind: "ownerTransfer" }
  | { kind: "forbidden" }
  | { kind: "gone" }
  | { kind: "unknown" }
  | { kind: "failed" };

export function staffProblem(error: unknown): StaffProblem {
  if (!isApiError(error)) return { kind: "unknown" };
  const details = error.details;
  if (error.code === "rate_limited") {
    // The delay only when the browser can read `retry-after`; never a guess.
    const seconds = error.retryAfterSeconds;
    return {
      kind: "limited",
      minutes: seconds === null ? null : Math.max(1, Math.ceil(seconds / 60)),
    };
  }
  if (error.code === "conflict") {
    if (details["staff_invitation"] === "pending_other_role") return { kind: "pendingOtherRole" };
    if (details["staff_membership"] === "already_active") return { kind: "alreadyActive" };
    if (details["staff_membership"] === "owner_requires_transfer") return { kind: "ownerTransfer" };
    if (details["resends"] === "limit_reached") return { kind: "noResends" };
    if (details["staff_invitation"] === "not_pending") return { kind: "notPending" };
    if (details["staff_invitation"] === "accepted" || details["staff_invitation"] === "declined") {
      return { kind: "resolved" };
    }
    return { kind: "failed" };
  }
  if (error.status === 403) return { kind: "forbidden" };
  if (error.status === 404) return { kind: "gone" };
  if (error.status >= 500 || error.status === 0) return { kind: "unknown" };
  return { kind: "failed" };
}
