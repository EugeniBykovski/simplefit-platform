import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";

import { RequireSession } from "@/features/session-gate";
import { signInRouteFor } from "@/shared/routes/routes";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import { BillingPage, InvoicesPage, PlanPage, PlansPage } from "@/widgets/admin-billing";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

/*
 * SF-127 billing visibility (AD13 connected; AR2, AR4, AR5 read only) on a deterministic
 * stand-in of the API: `fetch` is replaced per story and nothing reaches a backend.
 * Every figure here is a Storybook fixture, never a real or example revenue.
 */

const NOW = "2026-11-12T12:00:00Z";
const GYM = "8a1f0f6e-1b2c-4d3e-8f90-123456789abc";
const SUB = "3c2b1a09-8f7e-4d6c-9b5a-0123456789ab";
const zero = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, 0]));
const STATUSES = ["pending_activation", "active", "cancellation_scheduled", "cancelled", "expired"];
const PROVIDER = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
];

const overview = (overrides: Record<string, unknown> = {}) => ({
  overview: {
    observed_at: NOW,
    mode: "test",
    configured_mode: "test",
    integration: "ready",
    subscriptions: {
      ...zero(STATUSES),
      active: 2,
      pending_activation: 1,
      cancellation_scheduled: 1,
    },
    unrecorded_subscriptions: { ...zero(STATUSES), pending_activation: 1 },
    provider_statuses: { ...zero(PROVIDER), active: 1, past_due: 1, trialing: 1 },
    invoices: { ...zero(["draft", "open", "paid", "uncollectible", "void"]), paid: 3, open: 1 },
    payment_issues: { payment_failed: 1, action_required: 0, uncollectible: 0 },
    refunds: {
      ...zero(["requested", "pending", "requires_action", "succeeded", "failed", "canceled"]),
      succeeded: 1,
    },
    disputes: [{ status: "needs_response", count: 1 }],
    collected: {
      period_start: "2026-10-13T12:00:00Z",
      period_end: NOW,
      currencies: [
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
          amount_paid: "298.00",
          amount_paid_minor: "29800",
          amount_refunded: "49.00",
          amount_refunded_minor: "4900",
        },
      ],
    },
    last_synced_at: NOW,
    last_webhook_at: NOW,
    unavailable: [
      "mrr",
      "arr",
      "recognized_revenue",
      "net_revenue",
      "churn",
      "ltv",
      "forecast",
      "fx_total",
    ].map((metric) => ({ metric, reason: "no_approved_definition" })),
    ...overrides,
  },
});

const ZERO = overview({
  mode: "live",
  integration: "disabled",
  subscriptions: zero(STATUSES),
  unrecorded_subscriptions: zero(STATUSES),
  provider_statuses: zero(PROVIDER),
  invoices: zero(["draft", "open", "paid", "uncollectible", "void"]),
  payment_issues: { payment_failed: 0, action_required: 0, uncollectible: 0 },
  refunds: zero(["requested", "pending", "requires_action", "succeeded", "failed", "canceled"]),
  disputes: [],
  collected: { period_start: "2026-10-13T12:00:00Z", period_end: NOW, currencies: [] },
  last_synced_at: null,
  last_webhook_at: null,
});

const sub = (overrides: Record<string, unknown>) => ({
  id: SUB,
  gym: { id: GYM, name: "Alpha Boxing" },
  status: "active",
  environment: "test",
  plan: {
    key: "starter",
    plan_version_id: SUB,
    version: 1,
    name: "Starter",
    version_status: "published",
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
  provider_status: "active",
  cancel_at_period_end: false,
  reconciliation: { state: "in_sync", discrepancy: null, synced_at: NOW },
  ...overrides,
});

const SUBSCRIPTIONS = ok({
  mode: "test",
  next_cursor: "next",
  subscriptions: [
    sub({}),
    sub({ id: "a2", gym: { id: GYM, name: "Bravo Boxing" }, provider_status: "past_due" }),
    sub({
      id: "a3",
      gym: { id: GYM, name: "Charlie Boxing" },
      provider_status: "trialing",
      reconciliation: { state: "stale", discrepancy: null, synced_at: "2026-11-12T03:00:00Z" },
    }),
    sub({
      id: "a4",
      gym: { id: GYM, name: "Delta Boxing" },
      status: "pending_activation",
      activated_at: null,
      current_period_start: null,
      current_period_end: null,
      provider_status: null,
      cancel_at_period_end: null,
      reconciliation: { state: "not_linked", discrepancy: null, synced_at: null },
    }),
    sub({
      id: "a5",
      gym: { id: GYM, name: "Echo Boxing" },
      status: "pending_activation",
      provider_status: "incomplete",
      reconciliation: { state: "mismatch", discrepancy: "invoice_amount_mismatch", synced_at: NOW },
    }),
  ],
});

const invoice = (overrides: Record<string, unknown> = {}) => ({
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
  attempt_count: 2,
  next_payment_attempt_at: "2026-11-14T12:00:00Z",
  synced_at: NOW,
  ...overrides,
});

const DETAIL = ok({
  subscription: {
    ...sub({ provider_status: "past_due" }),
    revision: 3,
    cancel_mode: null,
    cancellation_requested_at: null,
    provider_period_start: NOW,
    provider_period_end: NOW,
    periods: [{ period_start: NOW, period_end: NOW, source: "activation", recorded_at: NOW }],
    invoices: [
      { ...invoice(), refunds: [], disputes: [] },
      {
        ...invoice({
          id: "i2",
          number: "SF-0000",
          status: "paid",
          payment_status: "succeeded",
          issue: null,
          amount_paid: "149.00",
          amount_paid_minor: 14900,
          amount_refunded: "49.00",
          amount_refunded_minor: 4900,
          disputed: true,
          paid_at: NOW,
          next_payment_attempt_at: null,
        }),
        refunds: [
          {
            origin: "provider",
            status: "succeeded",
            reason: null,
            amount: "49.00",
            amount_minor: 4900,
            currency: "PLN",
            created_at: NOW,
            synced_at: NOW,
          },
        ],
        disputes: [
          {
            status: "needs_response",
            reason: "fraudulent",
            amount: "149.00",
            amount_minor: 14900,
            currency: "PLN",
            created_at: NOW,
            synced_at: NOW,
          },
        ],
      },
    ],
    checkouts: [
      { mode: "test", status: "completed", created_at: NOW, expires_at: NOW, completed_at: NOW },
    ],
  },
});

const RECONCILIATION = ok({
  reconciliation: {
    observed_at: NOW,
    mode: "test",
    integration: "ready",
    summary: {
      linked: 4,
      in_sync: 2,
      stale: 1,
      mismatch: 1,
      not_linked: 1,
      last_synced_at: NOW,
      oldest_synced_at: "2026-11-12T03:00:00Z",
    },
    webhooks: {
      window_start: "2026-11-11T12:00:00Z",
      counts: { received: 1, processed: 12, ignored: 2, failed: 1 },
      backlog: 1,
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
        subscription_id: "a5",
        gym: { id: GYM, name: "Echo Boxing" },
        subscription_status: "pending_activation",
        provider_status: "incomplete",
        discrepancy: "invoice_amount_mismatch",
        synced_at: NOW,
      },
    ],
    next_cursor: null,
  },
});

const version = (n: number, status: string, amount: string, modes: string[]) => ({
  id: `v${n}`,
  version: n,
  name: "Starter",
  description: null,
  status,
  price_source: "product_decision",
  proposed_trial_days: n === 1 ? 14 : null,
  approval_reference: "SF-101-TEST",
  published_at: NOW,
  superseded_at: status === "superseded" ? NOW : null,
  retired_at: null,
  archived_at: null,
  created_at: NOW,
  entitlements: [{ feature_key: "gym.member_management", quantity_limit: null }],
  prices: [
    {
      price_version_id: `p${n}`,
      interval: "month",
      currency: "PLN",
      pricing: "fixed",
      amount,
      amount_minor: Number(amount) * 100,
      stripe_mapped_modes: modes,
    },
    {
      price_version_id: `q${n}`,
      interval: "year",
      currency: "EUR",
      pricing: "quote_required",
      amount: null,
      amount_minor: null,
      stripe_mapped_modes: [],
    },
  ],
});
const PLAN = {
  key: "starter",
  created_at: NOW,
  current_version_id: "v2",
  versions: [version(2, "published", "199.00", []), version(1, "superseded", "149.00", ["test"])],
};

const operator = (permissions: string[]) =>
  ok({
    operator: {
      id: "5b0c7f1e-3a2d-4c6b-9e8f-1d2a3b4c5d6e",
      status: "active",
      permissions,
      security_keys: { registered: 2, required: 2 },
      step_up: {
        verified_at: "2026-11-12T11:00:00Z",
        expires_at: new Date(Date.now() + 29 * 60_000).toISOString(),
        fresh_seconds_remaining: 300,
      },
      enrollment_expires_at: null,
      activated_at: "2026-11-09T10:00:00Z",
    },
  });

const BOTH = ["billing.read", "billing.reconciliation.read"];

function story(
  permissions: string[],
  routes: Record<string, Answer | Answer[]>,
  text: string,
  render: () => ReactNode = () => <BillingPage />,
  path = "/en/admin/subscriptions",
  play?: StoryObj["play"],
): StoryObj {
  return {
    parameters: { nextjs: { appDirectory: true, navigation: { pathname: path, segments: [] } } },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/admin/me": operator(permissions),
        ...routes,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web.admin")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        {render()}
      </RequireSession>
    ),
    play:
      play ??
      (async ({ canvasElement }) => {
        await expect(
          await within(canvasElement).findByText(text, {}, { timeout: 5000 }),
        ).toBeVisible();
      }),
  };
}

const READY = {
  "/api/v1/admin/billing/overview": ok(overview()),
  "/api/v1/admin/billing/subscriptions": SUBSCRIPTIONS,
  "/api/v1/admin/billing/reconciliation": RECONCILIATION,
  [`/api/v1/admin/billing/subscriptions/${SUB}`]: DETAIL,
};

export const Overview = story(BOTH, READY, "Collected through Stripe invoices");
Overview.name = "AD13 · test mode, mixed currencies, states and reconciliation";

export const LiveZero = story(
  ["billing.read"],
  {
    "/api/v1/admin/billing/overview": ok(ZERO),
    "/api/v1/admin/billing/subscriptions": ok({
      mode: "live",
      subscriptions: [],
      next_cursor: null,
    }),
  },
  "No invoice was paid in this period.",
);
LiveZero.name = "AD13 · live mode, measured zeros, integration off";

export const NotReported = story(
  ["billing.read"],
  READY,
  "No approved definition exists, so no figure is shown.",
);
NotReported.name = "AD13 · MRR, ARR and revenue not reported";

export const Unreachable = story(
  ["billing.read"],
  {
    "/api/v1/admin/billing/overview": apiError(503, "service_unavailable"),
  },
  "We can’t reach the billing records.",
);
Unreachable.name = "AD13 · source unavailable";

export const Loading = story(
  ["billing.read"],
  { "/api/v1/admin/billing/overview": "pending" },
  "",
  undefined,
  undefined,
  async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole(
        "status",
        { name: "Loading billing figures" },
        { timeout: 5000 },
      ),
    ).toBeVisible();
  },
);
Loading.name = "AD13 · loading";

export const Restricted = story(
  [],
  { "/api/v1/admin/billing/overview": apiError(403, "forbidden") },
  "You don’t have access to this section",
);
Restricted.name = "AD13 · restricted";

export const ReconciliationOnly = story(
  ["billing.reconciliation.read"],
  {
    "/api/v1/admin/billing/reconciliation": RECONCILIATION,
  },
  "Invoice for another amount",
);
ReconciliationOnly.name = "AD13 · reconciliation only (mismatch, stale, failed event)";

export const SubscriptionDetail = story(
  BOTH,
  READY,
  "",
  undefined,
  undefined,
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Open Alpha Boxing" }, { timeout: 5000 }),
    );
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      await body.findByText("Disputed (not a refund)", {}, { timeout: 5000 }),
    ).toBeVisible();
    await expect(body.queryByRole("button", { name: /^refund/i })).toBeNull();
  },
);
SubscriptionDetail.name =
  "AD13 · subscription detail (failed payment, refund and dispute recorded, refund disabled)";

export const Invoices = story(
  ["billing.read"],
  {
    "/api/v1/admin/billing/overview": ok(overview()),
    "/api/v1/admin/billing/invoices": ok({
      mode: "test",
      next_cursor: null,
      invoices: [
        { ...invoice(), gym: { id: GYM, name: "Bravo Boxing" } },
        {
          ...invoice({
            id: "i3",
            number: "SF-0003",
            status: "uncollectible",
            payment_status: null,
            issue: "uncollectible",
          }),
          gym: { id: GYM, name: "Foxtrot Boxing" },
        },
        {
          ...invoice({
            id: "i4",
            number: "SF-0004",
            status: "paid",
            payment_status: "succeeded",
            issue: null,
            amount_paid: "45.00",
            amount_paid_minor: 4500,
            currency: "EUR",
            total: "45.00",
            total_minor: 4500,
          }),
          gym: { id: GYM, name: "Golf Boxing" },
        },
      ],
    }),
  },
  "Uncollectible",
  () => <InvoicesPage />,
  "/en/admin/transactions",
);
Invoices.name = "AR2 · Stripe invoices (failed, uncollectible, paid), refunds disabled";

export const InvoicesEmpty = story(
  ["billing.read"],
  {
    "/api/v1/admin/billing/overview": ok(overview()),
    "/api/v1/admin/billing/invoices": ok({ mode: "test", invoices: [], next_cursor: null }),
  },
  "No invoices match.",
  () => <InvoicesPage />,
  "/en/admin/transactions",
);
InvoicesEmpty.name = "AR2 · empty";

export const Plans = story(
  ["billing.read"],
  {
    "/api/v1/admin/billing/plans": ok({
      plans: [{ ...PLAN, versions: PLAN.versions.map((v) => ({ ...v, entitlements: null })) }],
    }),
  },
  "Current: v2 · 2 versions",
  () => <PlansPage />,
  "/en/admin/pricing",
);
Plans.name = "AR4 · plan catalog (read only)";

export const PlanHistory = story(
  ["billing.read"],
  {
    "/api/v1/admin/billing/plans/starter": ok({ plan: PLAN }),
  },
  "Version history · ",
  () => <PlanPage planKey="starter" />,
  "/en/admin/pricing/starter",
  async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findAllByText("gym.member_management", {}, { timeout: 5000 }),
    ).toHaveLength(2);
  },
);
PlanHistory.name = "AR5 · version history with superseded price kept";

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

const meta = {
  title: "Control Plane/Billing visibility",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

export const Mobile: StoryObj = {
  ...Overview,
  name: "AD13 · mobile",
  globals: { viewport: { value: "phone", isRotated: false } },
};
