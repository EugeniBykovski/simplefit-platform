import { isApiError } from "@/shared/api/http/api-error";

/**
 * Why a member action did not happen, in the staff's terms (SF-95 error
 * contract). The backend decides every action; this only names its answer.
 * A dropped connection or a timeout is `unknown`: the action may or may not
 * have been applied, so the lists are read again and nothing is claimed.
 *
 * - `decided`: the request or membership is no longer in the state the
 *   action needs (`gym_member: <status>`), e.g. approved or rejected by
 *   someone else, cancelled by the requester, or ended meanwhile.
 * - `invitationsUnavailable`: member invitations are switched off on this
 *   server (`member_invitation: recipient_flow_unavailable`) because invited
 *   people cannot answer them in a client yet. Nothing was created or sent.
 */
export type MemberProblem =
  | { kind: "limited"; minutes: number | null }
  | { kind: "decided"; status: "requested" | "active" | "rejected" | "cancelled" | "ended" }
  | { kind: "alreadyActive" }
  | { kind: "invitationsUnavailable" }
  | { kind: "noResends" }
  | { kind: "notPending" }
  | { kind: "resolved" }
  | { kind: "draft" }
  | { kind: "forbidden" }
  | { kind: "gone" }
  | { kind: "unknown" }
  | { kind: "failed" };

const STATUSES = ["requested", "active", "rejected", "cancelled", "ended"] as const;
type Status = (typeof STATUSES)[number];
const isStatus = (value: unknown): value is Status =>
  typeof value === "string" && (STATUSES as readonly string[]).includes(value);

export function memberProblem(error: unknown): MemberProblem {
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
    const member = details["gym_member"];
    const invitation = details["member_invitation"];
    if (invitation === "recipient_flow_unavailable") return { kind: "invitationsUnavailable" };
    if (member === "already_active") return { kind: "alreadyActive" };
    if (isStatus(member)) return { kind: "decided", status: member };
    if (details["resends"] === "limit_reached") return { kind: "noResends" };
    if (invitation === "not_pending") return { kind: "notPending" };
    if (invitation === "accepted" || invitation === "declined") return { kind: "resolved" };
    if (details["setup_status"] === "draft") return { kind: "draft" };
    return { kind: "failed" };
  }
  if (error.status === 403) return { kind: "forbidden" };
  if (error.status === 404) return { kind: "gone" };
  if (error.status >= 500 || error.status === 0) return { kind: "unknown" };
  return { kind: "failed" };
}

/** Whether a problem is a failure (coral) rather than an expected refusal (amber). */
export const isFailure = (problem: MemberProblem) =>
  problem.kind === "failed" || problem.kind === "unknown";
