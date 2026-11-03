import { isApiError } from "@/shared/api/http/api-error";

/**
 * Why a billing action (choose a plan, open checkout or the portal, refresh,
 * cancel) did not happen, from the SF-101/SF-102 error contract's `code` and
 * `details` (never a message). The backend decides every one of them.
 *
 * - `unknown`: the connection dropped or the server failed; the request may
 *   or may not have been applied, so the billing state is read again and
 *   nothing is claimed. Retrying reuses the same request key, and checkout
 *   creation is idempotent, so a retry never opens a second payable checkout.
 * - `providerUnavailable` (503): Stripe could not be reached or is
 *   misconfigured; nothing changed.
 * - `providerDisabled`: payments are switched off in this environment;
 *   nothing is charged and no success is pretended.
 * - `checkoutCompleted`: a checkout was just paid (or is being paid); the
 *   state is read again.
 * - `currentExists` / `notPending`: the gym already has a current plan, or
 *   the subscription is no longer a pending intent.
 * - `planUnavailable` / `priceUnavailable`: the plan version is no longer
 *   offered, or its price is not payable here.
 * - `noCustomer` / `portalUnavailable`: billing management needs a first
 *   checkout, or is not configured here.
 * - `draft`: the gym's setup is not completed.
 * - `limited` (429), `forbidden` (403: only the owner), `gone` (404),
 *   `session` (401), `keyReused` (a client fault), `failed`.
 */
export type BillingProblem =
  | { kind: "unknown" }
  | { kind: "loadFailed" }
  | { kind: "providerUnavailable" }
  | { kind: "providerDisabled" }
  | { kind: "checkoutCompleted" }
  | { kind: "currentExists" }
  | { kind: "notPending" }
  | { kind: "planUnavailable" }
  | { kind: "priceUnavailable" }
  | { kind: "noCustomer" }
  | { kind: "portalUnavailable" }
  | { kind: "draft" }
  | { kind: "limited"; minutes: number | null }
  | { kind: "forbidden" }
  | { kind: "gone" }
  | { kind: "session" }
  | { kind: "keyReused" }
  | { kind: "failed" };

function conflict(details: Record<string, unknown>): BillingProblem {
  if (details["payment_provider"] === "disabled") return { kind: "providerDisabled" };
  if (details["checkout"] !== undefined) return { kind: "checkoutCompleted" };
  if (details["saas_subscription"] === "current_exists") return { kind: "currentExists" };
  if (details["saas_subscription"] !== undefined) return { kind: "notPending" };
  if (details["saas_plan_version"] !== undefined) return { kind: "planUnavailable" };
  if (details["stripe_price"] !== undefined || details["saas_price_version"] !== undefined)
    return { kind: "priceUnavailable" };
  if (details["billing_portal"] === "no_customer") return { kind: "noCustomer" };
  if (details["billing_portal"] !== undefined) return { kind: "portalUnavailable" };
  if (details["setup_status"] !== undefined) return { kind: "draft" };
  if (details["client_request_id"] === "reused") return { kind: "keyReused" };
  return { kind: "failed" };
}

export function billingProblem(error: unknown): BillingProblem {
  if (!isApiError(error)) return { kind: "unknown" };
  if (error.code === "rate_limited") {
    const seconds = error.retryAfterSeconds;
    return {
      kind: "limited",
      minutes: seconds === null ? null : Math.max(1, Math.ceil(seconds / 60)),
    };
  }
  if (error.code === "conflict") return conflict(error.details);
  if (error.code === "service_unavailable") return { kind: "providerUnavailable" };
  if (error.status === 401) return { kind: "session" };
  if (error.status === 403) return { kind: "forbidden" };
  if (error.status === 404) return { kind: "gone" };
  if (error.status >= 500 || error.status === 0) return { kind: "unknown" };
  return { kind: "failed" };
}

/** A failed read changes nothing: a dropped connection is `loadFailed`. */
export function readProblem(error: unknown): BillingProblem {
  const problem = billingProblem(error);
  return problem.kind === "unknown" ? { kind: "loadFailed" } : problem;
}

/** Whether a problem is a failure (coral) rather than an expected refusal (amber). */
export const isBillingFailure = (problem: BillingProblem) =>
  problem.kind === "failed" ||
  problem.kind === "unknown" ||
  problem.kind === "loadFailed" ||
  problem.kind === "keyReused" ||
  problem.kind === "providerUnavailable";
