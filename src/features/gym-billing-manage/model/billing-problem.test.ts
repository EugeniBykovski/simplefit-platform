import { describe, expect, it } from "vitest";

import { ApiError } from "@/shared/api/http/api-error";

import { billingProblem, isBillingFailure, readProblem } from "./billing-problem";

const api = (
  status: number,
  code: string,
  details: Record<string, unknown> = {},
  retry: number | null = null,
) => new ApiError(status, code, code, details, null, retry);

describe("billingProblem (SF-102 error contract)", () => {
  it.each([
    [{ payment_provider: "disabled" }, "providerDisabled"],
    [{ checkout: "completed" }, "checkoutCompleted"],
    [{ saas_subscription: "current_exists" }, "currentExists"],
    [{ saas_subscription: "active" }, "notPending"],
    [{ saas_plan_version: "provisional" }, "planUnavailable"],
    [{ stripe_price: "not_mapped" }, "priceUnavailable"],
    [{ billing_portal: "no_customer" }, "noCustomer"],
    [{ billing_portal: "not_configured" }, "portalUnavailable"],
    [{ setup_status: "draft" }, "draft"],
    [{ client_request_id: "reused" }, "keyReused"],
    [{ something: "else" }, "failed"],
  ])("maps conflict %o to %s", (details, kind) => {
    expect(billingProblem(api(409, "conflict", details)).kind).toBe(kind);
  });

  it("maps statuses, rate limits and dropped connections", () => {
    expect(billingProblem(api(503, "service_unavailable")).kind).toBe("providerUnavailable");
    expect(billingProblem(api(403, "forbidden")).kind).toBe("forbidden");
    expect(billingProblem(api(404, "not_found")).kind).toBe("gone");
    expect(billingProblem(api(401, "unauthorized")).kind).toBe("session");
    expect(billingProblem(api(429, "rate_limited", {}, 125))).toEqual({
      kind: "limited",
      minutes: 3,
    });
    expect(billingProblem(new TypeError("network")).kind).toBe("unknown");
    expect(readProblem(new TypeError("network")).kind).toBe("loadFailed");
    expect(isBillingFailure({ kind: "providerUnavailable" })).toBe(true);
    expect(isBillingFailure({ kind: "providerDisabled" })).toBe(false);
  });
});
