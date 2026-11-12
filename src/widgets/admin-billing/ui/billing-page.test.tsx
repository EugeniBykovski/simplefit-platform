import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { BillingPage } from "./billing-page";
import { InvoicesPage } from "./invoices-page";
import { PlansPage } from "./plans-page";

/*
 * SF-127 with the network mocked at `fetch`: every figure is the backend's, of the one
 * mode it says it read; switching mode re-reads with that mode; currencies stay apart;
 * a measured zero shows as 0 and what has no definition is "not reported"; sections
 * need their own permission; a refusal shows the restricted state; and no refund,
 * cancellation or price action exists anywhere.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));
const permissions = vi.hoisted(() => ({ current: [] as string[] }));
vi.mock("@/entities/operator", () => ({
  useOperator: () => ({ data: { permissions: permissions.current } }),
  grants: (operator: { permissions: string[] }, permission: string) =>
    operator.permissions.includes(permission),
}));
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={`/en${href}`} {...props}>
      {children}
    </a>
  ),
}));

const NOW = "2026-11-12T12:00:00Z";
const GYM = "8a1f0f6e-1b2c-4d3e-8f90-123456789abc";
const SUB = "3c2b1a09-8f7e-4d6c-9b5a-0123456789ab";
const zero = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, 0]));
const STATUSES = ["pending_activation", "active", "cancellation_scheduled", "cancelled", "expired"];

const overview = (mode: "test" | "live", overrides: Record<string, unknown> = {}) => ({
  overview: {
    observed_at: NOW,
    mode,
    configured_mode: "test",
    integration: "ready",
    subscriptions: { ...zero(STATUSES), active: mode === "test" ? 2 : 0, pending_activation: 1 },
    unrecorded_subscriptions: { ...zero(STATUSES), pending_activation: 1 },
    provider_statuses: {
      ...zero([
        "incomplete",
        "incomplete_expired",
        "trialing",
        "active",
        "past_due",
        "canceled",
        "unpaid",
        "paused",
      ]),
      active: 1,
      past_due: 1,
    },
    invoices: { ...zero(["draft", "open", "paid", "uncollectible", "void"]), paid: 3, open: 1 },
    payment_issues: { payment_failed: 1, action_required: 0, uncollectible: 0 },
    refunds: zero(["requested", "pending", "requires_action", "succeeded", "failed", "canceled"]),
    disputes: [],
    collected: {
      period_start: "2026-10-13T12:00:00Z",
      period_end: NOW,
      currencies:
        mode === "test"
          ? [
              {
                currency: "EUR",
                invoice_count: 1,
                amount_paid: "45.00",
                amount_paid_minor: "4500",
                amount_refunded: "0.00",
                amount_refunded_minor: "0",
              },
              {
                currency: "PLN",
                invoice_count: 2,
                amount_paid: "12345678901234.56",
                amount_paid_minor: "1234567890123456",
                amount_refunded: "49.00",
                amount_refunded_minor: "4900",
              },
            ]
          : [],
    },
    last_synced_at: NOW,
    last_webhook_at: null,
    unavailable: ["mrr", "arr", "recognized_revenue", "net_revenue", "churn"].map((metric) => ({
      metric,
      reason: "no_approved_definition",
    })),
    ...overrides,
  },
});

const subscription = {
  id: SUB,
  gym: { id: GYM, name: "Alpha Boxing" },
  status: "active",
  environment: "test",
  plan: {
    key: "starter",
    plan_version_id: SUB,
    version: 1,
    name: "Starter",
    version_status: "superseded",
  },
  price: {
    interval: "month",
    currency: "PLN",
    pricing: "fixed",
    amount: "149.00",
    amount_minor: 14900,
  },
  requested_at: NOW,
  activated_at: NOW,
  current_period_start: NOW,
  current_period_end: NOW,
  cancel_reason: null,
  cancellation_effective_at: null,
  ended_at: null,
  provider_status: "past_due",
  cancel_at_period_end: false,
  reconciliation: { state: "in_sync", discrepancy: null, synced_at: NOW },
};

const invoice = {
  id: "11111111-2222-4333-8444-555555555555",
  mode: "test",
  number: "SF-0001",
  subscription_id: SUB,
  status: "open",
  payment_status: "requires_payment_method",
  issue: "payment_failed",
  currency: "PLN",
  total: "149.00",
  total_minor: 14900,
  amount_due: "149.00",
  amount_due_minor: 14900,
  amount_paid: "0.00",
  amount_paid_minor: 0,
  amount_remaining: "149.00",
  amount_remaining_minor: 14900,
  amount_refunded: "0.00",
  amount_refunded_minor: 0,
  disputed: false,
  billing_reason: "subscription_cycle",
  period_start: NOW,
  period_end: NOW,
  issued_at: NOW,
  paid_at: null,
  attempt_count: 1,
  next_payment_attempt_at: null,
  synced_at: NOW,
};

const detail = {
  subscription: {
    ...subscription,
    revision: 3,
    cancel_mode: null,
    cancellation_requested_at: null,
    provider_period_start: NOW,
    provider_period_end: NOW,
    periods: [{ period_start: NOW, period_end: NOW, source: "activation", recorded_at: NOW }],
    invoices: [{ ...invoice, refunds: [], disputes: [] }],
    checkouts: [
      { mode: "test", status: "completed", created_at: NOW, expires_at: NOW, completed_at: NOW },
    ],
  },
};

const reconciliation = {
  reconciliation: {
    observed_at: NOW,
    mode: "test",
    integration: "ready",
    summary: {
      linked: 3,
      in_sync: 1,
      stale: 1,
      mismatch: 1,
      not_linked: 1,
      last_synced_at: NOW,
      oldest_synced_at: NOW,
    },
    webhooks: {
      window_start: NOW,
      counts: { received: 0, processed: 4, ignored: 1, failed: 1 },
      backlog: 0,
      last_received_at: NOW,
      failed: [
        {
          event_type: "invoice.paid",
          outcome: "retries_exhausted",
          attempts: 5,
          event_created_at: NOW,
          received_at: NOW,
          processed_at: NOW,
        },
      ],
    },
    discrepancies: [
      {
        subscription_id: SUB,
        gym: { id: GYM, name: "Mismatch Boxing" },
        subscription_status: "pending_activation",
        provider_status: "active",
        discrepancy: "invoice_amount_mismatch",
        synced_at: NOW,
      },
    ],
    next_cursor: null,
  },
};

type Answer = { status: number; body?: unknown };

function api(routes: Record<string, Answer | ((url: URL) => Answer)>) {
  const calls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const url = new URL(input);
      calls.push(url);
      const route = routes[url.pathname];
      if (!route) throw new Error(`unexpected ${url.pathname}`);
      const answer = typeof route === "function" ? route(url) : route;
      return Promise.resolve(jsonResponse(answer.body, { status: answer.status }));
    }),
  );
  return calls;
}

const OVERVIEW = "/api/v1/admin/billing/overview";
const SUBSCRIPTIONS = "/api/v1/admin/billing/subscriptions";
const RECONCILIATION = "/api/v1/admin/billing/reconciliation";
const byMode = (url: URL) => ({
  status: 200,
  body: overview(url.searchParams.get("mode") === "live" ? "live" : "test"),
});
const user = userEvent.setup();

afterEach(() => {
  vi.unstubAllGlobals();
  permissions.current = [];
});

describe("AD13 billing visibility (SF-127)", () => {
  it("shows one mode's counts and per-currency sums, exactly, never added together", async () => {
    permissions.current = ["billing.read"];
    api({
      [OVERVIEW]: byMode,
      [SUBSCRIPTIONS]: {
        status: 200,
        body: { mode: "test", subscriptions: [subscription], next_cursor: null },
      },
    });
    await renderWithProviders(<BillingPage />);

    const section = await screen.findByRole("region", { name: "Gym subscriptions" });
    expect(within(section).getByText("Test mode")).toBeInTheDocument();
    expect(
      within(section).getByText(/Every figure on this page is from Test mode only/),
    ).toBeInTheDocument();
    const collected = section.querySelector("[data-billing-collected=ready]") as HTMLElement;
    const rows = within(collected).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("€45.00");
    // A large sum keeps every digit (no float on the way).
    expect(rows[1]).toHaveTextContent("12,345,678,901,234.56");
    expect(rows[1]).toHaveTextContent("Refunded so far: PLN 49.00");
    expect(within(section).getByText(/Not revenue/)).toBeInTheDocument();
    // MRR and the rest are named as not reported, never shown as a number.
    const unavailable = section.querySelector("[data-billing-unavailable]") as HTMLElement;
    expect(within(unavailable).getByText("MRR")).toBeInTheDocument();
    expect(within(unavailable).getByText("Recognized revenue")).toBeInTheDocument();
    // The four flows stay apart; only gym subscriptions is connected.
    expect(document.querySelector("[data-billing-flow=saas]")).toHaveTextContent("Connected");
    expect(document.querySelector("[data-billing-flow=revenue]")).toHaveTextContent("Not reported");
    // No financial action anywhere.
    expect(
      screen.queryByRole("button", { name: /refund|cancel|retry|price/i }),
    ).not.toBeInTheDocument();
  });

  it("switching to live re-reads the live mode; a measured zero shows as 0", async () => {
    permissions.current = ["billing.read"];
    const calls = api({
      [OVERVIEW]: byMode,
      [SUBSCRIPTIONS]: (url) => ({
        status: 200,
        body: { mode: url.searchParams.get("mode"), subscriptions: [], next_cursor: null },
      }),
    });
    await renderWithProviders(<BillingPage />);
    await screen.findByRole("region", { name: "Gym subscriptions" });

    await user.click(screen.getByRole("button", { name: "Live" }));
    const section = await screen.findByRole("region", { name: "Gym subscriptions" });
    await waitFor(() => expect(within(section).getByText("Live mode")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Live" })).toHaveAttribute("aria-pressed", "true");
    expect(within(section).getByText("No invoice was paid in this period.")).toBeInTheDocument();
    expect(
      calls.some((url) => url.pathname === OVERVIEW && url.searchParams.get("mode") === "live"),
    ).toBe(true);
    expect(
      calls.some(
        (url) => url.pathname === SUBSCRIPTIONS && url.searchParams.get("mode") === "live",
      ),
    ).toBe(true);
  });

  it("opens one subscription: agreed version, payment issue, no checkout URL or action", async () => {
    permissions.current = ["billing.read"];
    api({
      [OVERVIEW]: byMode,
      [SUBSCRIPTIONS]: {
        status: 200,
        body: { mode: "test", subscriptions: [subscription], next_cursor: null },
      },
      [`${SUBSCRIPTIONS}/${SUB}`]: { status: 200, body: detail },
    });
    await renderWithProviders(<BillingPage />);

    const table = await screen.findByRole("table", {
      name: /Gym subscriptions, newest request first/,
    });
    expect(within(table).getByText("Past due")).toBeInTheDocument();
    expect(within(table).getByText("No discrepancy at last read")).toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: "Open Alpha Boxing" }));

    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText("Invoice SF-0001")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Last attempt failed").length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/Starter · v1 · Superseded/)).toBeInTheDocument();
    expect(within(dialog).getByText(/A newer plan version never changes it/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole("button", { name: /refund|cancel subscription|retry/i }),
    ).not.toBeInTheDocument();
  });

  it("reconciliation needs its own permission and shows states, not a fabricated success", async () => {
    permissions.current = ["billing.read", "billing.reconciliation.read"];
    api({
      [OVERVIEW]: byMode,
      [SUBSCRIPTIONS]: {
        status: 200,
        body: { mode: "test", subscriptions: [], next_cursor: null },
      },
      [RECONCILIATION]: { status: 200, body: reconciliation },
    });
    await renderWithProviders(<BillingPage />);

    const section = await screen.findByRole("region", { name: "Reconciliation" });
    expect(await within(section).findByText("Invoice for another amount")).toBeInTheDocument();
    expect(within(section).getByText("retries_exhausted")).toBeInTheDocument();
    expect(within(section).getByText(/There is no reconciliation run/)).toBeInTheDocument();
    expect(
      within(section).queryByRole("button", { name: /sync|replay|reconcile/i }),
    ).not.toBeInTheDocument();
  });

  it("reconciliation access alone shows reconciliation, never the billing figures", async () => {
    permissions.current = ["billing.reconciliation.read"];
    const calls = api({ [RECONCILIATION]: { status: 200, body: reconciliation } });
    await renderWithProviders(<BillingPage />);
    const section = await screen.findByRole("region", { name: "Reconciliation" });
    expect(await within(section).findByText("Invoice for another amount")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Gym subscriptions" })).not.toBeInTheDocument();
    expect(calls.every((url) => url.pathname === RECONCILIATION)).toBe(true);
  });

  it("without billing.read: restricted, and nothing is read", async () => {
    permissions.current = ["gyms.read"];
    const calls = api({});
    await renderWithProviders(<BillingPage />);
    expect(await screen.findByText("You don’t have access to this section")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("a refusal from the backend (revoked) shows the restricted state, never stale figures", async () => {
    permissions.current = ["billing.read"];
    api({
      [OVERVIEW]: {
        status: 403,
        body: { error: { code: "forbidden", message: "x", details: {} } },
      },
    });
    await renderWithProviders(<BillingPage />);
    expect(await screen.findByText("You don’t have access to this section")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Gym subscriptions" })).not.toBeInTheDocument();
  });
});

describe("AR2 Stripe invoices, read only (SF-127)", () => {
  it("lists one mode's invoices with Stripe's issue; filters are sent to the backend", async () => {
    permissions.current = ["billing.read"];
    const calls = api({
      [OVERVIEW]: byMode,
      "/api/v1/admin/billing/invoices": {
        status: 200,
        body: {
          mode: "test",
          invoices: [{ ...invoice, gym: { id: GYM, name: "Alpha Boxing" } }],
          next_cursor: null,
        },
      },
    });
    await renderWithProviders(<InvoicesPage />);

    const table = await screen.findByRole("table", { name: /Recorded Stripe invoices/ });
    expect(within(table).getByText("SF-0001")).toBeInTheDocument();
    expect(within(table).getByText("Last attempt failed")).toBeInTheDocument();
    expect(screen.getByText(/Refunds aren’t available here/)).toBeInTheDocument();

    await user.type(screen.getByLabelText("Currency (ISO code)"), "eur");
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() =>
      expect(
        calls.some(
          (url) => url.pathname.endsWith("/invoices") && url.searchParams.get("currency") === "EUR",
        ),
      ).toBe(true),
    );
  });
});

describe("AR4 plans, read only (SF-127)", () => {
  it("shows every version with its own prices and where each is mapped; no edit", async () => {
    permissions.current = ["billing.read"];
    api({
      "/api/v1/admin/billing/plans": {
        status: 200,
        body: {
          plans: [
            {
              key: "starter",
              created_at: NOW,
              current_version_id: "v2",
              versions: [
                {
                  id: "v2",
                  version: 2,
                  name: "Starter",
                  description: null,
                  status: "published",
                  price_source: "product_decision",
                  proposed_trial_days: null,
                  approval_reference: "SF-101-TEST",
                  published_at: NOW,
                  superseded_at: null,
                  retired_at: null,
                  archived_at: null,
                  created_at: NOW,
                  entitlements: null,
                  prices: [
                    {
                      price_version_id: "p2",
                      interval: "month",
                      currency: "PLN",
                      pricing: "fixed",
                      amount: "199.00",
                      amount_minor: 19900,
                      stripe_mapped_modes: [],
                    },
                  ],
                },
                {
                  id: "v1",
                  version: 1,
                  name: "Starter",
                  description: null,
                  status: "superseded",
                  price_source: "product_decision",
                  proposed_trial_days: 14,
                  approval_reference: "SF-101-TEST",
                  published_at: NOW,
                  superseded_at: NOW,
                  retired_at: null,
                  archived_at: null,
                  created_at: NOW,
                  entitlements: null,
                  prices: [
                    {
                      price_version_id: "p1",
                      interval: "month",
                      currency: "PLN",
                      pricing: "fixed",
                      amount: "149.00",
                      amount_minor: 14900,
                      stripe_mapped_modes: ["test"],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
    await renderWithProviders(<PlansPage />);

    const plan = await screen.findByRole("region", { name: "Starter" });
    expect(within(plan).getByText(/Current: v2/)).toBeInTheDocument();
    expect(within(plan).getByText("Superseded")).toBeInTheDocument();
    expect(within(plan).getByText("PLN 149.00")).toBeInTheDocument();
    expect(within(plan).getByText("PLN 199.00")).toBeInTheDocument();
    expect(within(plan).getByText("Stripe price in: Test")).toBeInTheDocument();
    expect(within(plan).getByText(/Proposed trial: 14 days \(not applied\)/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /new plan|edit|publish/i }),
    ).not.toBeInTheDocument();
  });
});
