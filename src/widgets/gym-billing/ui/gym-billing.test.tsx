import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Gym,
  GymBillingInvoice,
  GymBillingSummary,
  GymSaasSubscription,
  GymViewerPermissionsItem,
  SaasPlan,
} from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { GymBilling } from "./gym-billing";
import { GymSettingsHeader, GymSettingsIndex } from "./gym-settings-header";

/*
 * The gym's SimpleFit plan (WG25, SF-102) with the network mocked at
 * `fetch`: every state shown is the backend's reconciled answer, only the
 * owner sees (or reads) anything, checkout and the portal leave for
 * Stripe-hosted URLs the backend answered, the return from checkout asks
 * the backend to read Stripe, and nothing changes before the backend says so.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  onSessionBoundary: () => () => undefined,
}));

const search = { value: "" };
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(search.value) }));
vi.mock("@/shared/i18n/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/app/gyms/g/settings/plan",
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const GYM = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const SUB = "5b1b2c3d-0000-4000-8000-000000000501";
const PLAN_V = "7c1b2c3d-0000-4000-8000-000000000601";
const PRICE_M = "7c1b2c3d-0000-4000-8000-000000000611";
const PRICE_Y = "7c1b2c3d-0000-4000-8000-000000000612";

const OWNER: GymViewerPermissionsItem[] = ["view_workspace", "manage_billing"];

const gym = (permissions: GymViewerPermissionsItem[] = OWNER): Gym => ({
  id: GYM,
  name: "Ring One Boxing",
  gym_type: "boxing_club",
  setup_status: "completed",
  inserted_at: "2026-10-27T10:00:00Z",
  updated_at: "2026-10-27T10:00:00Z",
  locations: [],
  viewer: {
    role: permissions.includes("manage_billing") ? "owner" : "manager",
    staff_membership_id: "6a1b2c3d-0000-4000-8000-000000000101",
    permissions,
  },
});

const plan: SaasPlan = {
  plan_key: "starter",
  plan_version_id: PLAN_V,
  version: 1,
  name: "Starter",
  description: "For one location",
  price_source: "product_decision",
  proposed_trial_days: null,
  published_at: "2026-11-01T10:00:00Z",
  prices: [
    {
      price_version_id: PRICE_M,
      interval: "month",
      currency: "PLN",
      pricing: "fixed",
      amount: "149.00",
      amount_minor: 14900,
    },
    {
      price_version_id: PRICE_Y,
      interval: "year",
      currency: "PLN",
      pricing: "fixed",
      amount: "1490.00",
      amount_minor: 149000,
    },
  ],
  entitlements: [],
};

const subscription = (overrides: Partial<GymSaasSubscription> = {}): GymSaasSubscription => ({
  subscription_id: SUB,
  gym_id: GYM,
  status: "active",
  plan: { plan_key: "starter", plan_version_id: PLAN_V, version: 1, name: "Starter" },
  price: plan.prices[0]!,
  cancel_reason: null,
  requested_at: "2026-11-02T10:00:00Z",
  activated_at: "2026-11-02T10:05:00Z",
  current_period_start: "2026-11-02T10:05:00Z",
  current_period_end: "2026-12-02T10:05:00Z",
  cancel_mode: null,
  cancellation_requested_at: null,
  cancellation_effective_at: null,
  ended_at: null,
  ...overrides,
});

const summary = (overrides: Partial<GymBillingSummary> = {}): GymBillingSummary => ({
  provider: { status: "ready", mode: "test", portal_available: true },
  subscription: subscription(),
  payment: {
    state: "active",
    provider_status: "active",
    next_payment_at: "2026-12-02T10:05:00Z",
    action_url: null,
  },
  checkout: null,
  ...overrides,
});

const invoice = (overrides: Partial<GymBillingInvoice> = {}): GymBillingInvoice => ({
  invoice_id: "4a1b2c3d-0000-4000-8000-000000000701",
  number: "SF-0001",
  status: "paid",
  payment_status: "succeeded",
  currency: "PLN",
  total: "149.00",
  total_minor: 14900,
  amount_paid: "149.00",
  amount_paid_minor: 14900,
  amount_refunded: "0.00",
  amount_refunded_minor: 0,
  disputed: false,
  period_start: "2026-11-02T10:05:00Z",
  period_end: "2026-12-02T10:05:00Z",
  issued_at: "2026-11-02T10:05:00Z",
  paid_at: "2026-11-02T10:05:00Z",
  hosted_invoice_url: "https://invoice.stripe.com/i/in_1",
  invoice_pdf: "https://pay.stripe.com/invoice/in_1/pdf",
  subscription_id: SUB,
  mode: "test",
  ...overrides,
});

type Answer = { status: number; body?: unknown } | Error;
type Call = { method: string; path: string; body: unknown };

const BASE = `/api/v1/gyms/${GYM}`;
const DEFAULTS: Record<string, Answer[]> = {
  [`GET ${BASE}/billing`]: [{ status: 200, body: { billing: summary() } }],
  [`GET ${BASE}/billing/invoices`]: [{ status: 200, body: { invoices: [invoice()] } }],
  ["GET /api/v1/saas-plans"]: [{ status: 200, body: { plans: [plan] } }],
};

function api(routes: Record<string, Answer[]> = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const { pathname } = new URL(url);
      const method = (init.method ?? "GET").toUpperCase();
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: pathname, body });
      const queue = routes[`${method} ${pathname}`] ?? DEFAULTS[`${method} ${pathname}`];
      if (!queue) return Promise.resolve(jsonResponse({}, { status: 200 }));
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(jsonResponse(answer.body ?? {}, { status: answer.status }));
    }),
  );
  return calls;
}

const error = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  body: { error: { code, message: code, details, request_id: null } },
});

const user = userEvent.setup();
const navigate = vi.fn();
const show = (permissions?: GymViewerPermissionsItem[]) =>
  renderWithProviders(<GymBilling gym={gym(permissions)} navigate={navigate} />);

beforeEach(() => {
  search.value = "";
  replace.mockReset();
  navigate.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("GymBilling (WG25, SF-102)", () => {
  it("shows the owner the reconciled plan, its period, next payment, test mode and Stripe's invoices", async () => {
    api();
    await show();

    const current = await screen.findByRole("region", { name: "Current plan" });
    expect(within(current).getByText("Starter")).toBeInTheDocument();
    expect(within(current).getByText(/149\.00 \/ month/)).toBeInTheDocument();
    expect(within(current).getByText(/next payment Dec 2, 2026/)).toBeInTheDocument();
    expect(within(current).getByText("Test mode")).toBeInTheDocument();

    const invoices = await screen.findByRole("table", { name: "Invoices" });
    expect(within(invoices).getByText("Paid")).toBeInTheDocument();
    expect(within(invoices).getByText("SF-0001")).toBeInTheDocument();
    expect(within(invoices).getByRole("link", { name: /View/ })).toHaveAttribute(
      "href",
      "https://invoice.stripe.com/i/in_1",
    );
    expect(screen.getByText(/Changing plans is not available yet/)).toBeInTheDocument();
    // A current plan: no plan can be chosen again.
    expect(screen.getByRole("button", { name: /monthly/ })).toBeDisabled();
  });

  it("restricts every other staff role and reads nothing for them", async () => {
    const calls = api();
    await show(["view_workspace", "view_staff"]);

    expect(screen.getByText("Only the gym's owner manages the SimpleFit plan")).toBeInTheDocument();
    expect(calls.filter((call) => call.path.includes("/billing"))).toEqual([]);
  });

  it("choosing a plan records the intent with one request key and leaves for Stripe Checkout", async () => {
    const calls = api({
      [`GET ${BASE}/billing`]: [
        {
          status: 200,
          body: {
            billing: summary({
              subscription: null,
              payment: {
                state: "none",
                provider_status: null,
                next_payment_at: null,
                action_url: null,
              },
            }),
          },
        },
      ],
      [`POST ${BASE}/saas-subscriptions`]: [
        { status: 201, body: { subscription: subscription({ status: "pending_activation" }) } },
      ],
      [`POST ${BASE}/saas-subscriptions/${SUB}/checkout-session`]: [
        {
          status: 201,
          body: {
            checkout: {
              checkout_id: "1a1b2c3d-0000-4000-8000-000000000801",
              status: "open",
              url: "https://checkout.stripe.com/c/pay/cs_test_1",
              expires_at: "2026-11-03T12:00:00Z",
            },
          },
        },
      ],
    });
    await show();

    expect(await screen.findByText("No SimpleFit plan")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /149\.00 monthly/ }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_1"),
    );
    const intent = calls.find(
      (call) => call.method === "POST" && call.path.endsWith("/saas-subscriptions"),
    );
    expect(intent?.body).toMatchObject({ plan_version_id: PLAN_V, price_version_id: PRICE_M });
    expect(Object.keys(intent?.body as object).sort()).toEqual([
      "client_request_id",
      "plan_version_id",
      "price_version_id",
    ]);
  });

  it("a lost intent answer is retried with the same request key", async () => {
    const calls = api({
      [`GET ${BASE}/billing`]: [
        {
          status: 200,
          body: {
            billing: summary({
              subscription: null,
              payment: {
                state: "none",
                provider_status: null,
                next_payment_at: null,
                action_url: null,
              },
            }),
          },
        },
      ],
      [`POST ${BASE}/saas-subscriptions`]: [
        new TypeError("network"),
        { status: 200, body: { subscription: subscription({ status: "pending_activation" }) } },
      ],
      [`POST ${BASE}/saas-subscriptions/${SUB}/checkout-session`]: [
        {
          status: 200,
          body: {
            checkout: {
              checkout_id: "1a1b2c3d-0000-4000-8000-000000000801",
              status: "open",
              url: "https://checkout.stripe.com/c/pay/cs_test_1",
              expires_at: "2026-11-03T12:00:00Z",
            },
          },
        },
      ],
    });
    await show();
    const choose = await screen.findByRole("button", { name: /149\.00 monthly/ });
    await user.click(choose);
    expect(await screen.findByText(/We couldn't confirm this/)).toBeInTheDocument();
    await user.click(choose);

    await waitFor(() => expect(navigate).toHaveBeenCalled());
    const keys = calls
      .filter((call) => call.method === "POST" && call.path.endsWith("/saas-subscriptions"))
      .map((call) => (call.body as { client_request_id: string }).client_request_id);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("returning from checkout asks the backend to read Stripe once, then removes the query", async () => {
    search.value = "checkout=returned";
    const calls = api({
      [`GET ${BASE}/billing`]: [
        {
          status: 200,
          body: {
            billing: summary({
              subscription: subscription({
                status: "pending_activation",
                activated_at: null,
                current_period_start: null,
                current_period_end: null,
              }),
              payment: {
                state: "processing",
                provider_status: null,
                next_payment_at: null,
                action_url: null,
              },
            }),
          },
        },
        { status: 200, body: { billing: summary() } },
      ],
      [`POST ${BASE}/saas-subscriptions/${SUB}/reconcile`]: [
        { status: 200, body: { billing: summary() } },
      ],
    });
    await show();

    await waitFor(() =>
      expect(calls.filter((call) => call.path.endsWith("/reconcile"))).toHaveLength(1),
    );
    expect(replace).toHaveBeenCalledWith("/app/gyms/g/settings/plan");
    expect(await screen.findByText(/next payment Dec 2, 2026/)).toBeInTheDocument();
  });

  it("a closed checkout says nothing was charged", async () => {
    search.value = "checkout=cancelled";
    api();
    await show();
    expect(
      await screen.findByText("Checkout was closed. Nothing was charged."),
    ).toBeInTheDocument();
  });

  it.each([
    ["action_required", "Complete payment", /Your bank asks you to confirm/],
    ["payment_failed", "Pay invoice", /The payment did not go through/],
    ["past_due", "Pay invoice", /The latest renewal payment failed/],
  ] as const)("shows %s with Stripe's hosted invoice", async (state, action, text) => {
    api({
      [`GET ${BASE}/billing`]: [
        {
          status: 200,
          body: {
            billing: summary({
              payment: {
                state,
                provider_status: state === "past_due" ? "past_due" : "incomplete",
                next_payment_at: null,
                action_url: "https://invoice.stripe.com/i/in_open",
              },
            }),
          },
        },
      ],
    });
    await show();

    const notice = await screen.findByText(text);
    expect(notice.closest("[data-payment-notice]")).toHaveAttribute("data-payment-notice", state);
    expect(screen.getByRole("link", { name: new RegExp(action) })).toHaveAttribute(
      "href",
      "https://invoice.stripe.com/i/in_open",
    );
  });

  it("opens the Stripe Customer Portal from the backend's short-lived URL", async () => {
    api({
      [`POST ${BASE}/billing/portal-session`]: [
        { status: 201, body: { portal: { url: "https://billing.stripe.com/p/session/test_1" } } },
      ],
    });
    await show();
    await user.click(await screen.findByRole("button", { name: /Manage billing/ }));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("https://billing.stripe.com/p/session/test_1"),
    );
  });

  it("cancels at the end of the paid period only on the backend's answer", async () => {
    const calls = api({
      [`POST ${BASE}/saas-subscriptions/${SUB}/cancel`]: [
        error(503, "service_unavailable"),
        {
          status: 200,
          body: {
            subscription: subscription({
              status: "cancellation_scheduled",
              cancel_mode: "period_end",
              cancellation_effective_at: "2026-12-02T10:05:00Z",
            }),
          },
        },
      ],
    });
    await show();
    await user.click(await screen.findByRole("button", { name: "Cancel plan" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("radio", { name: /At the end of the paid period \(Dec 2, 2026\)/ }),
    ).toBeChecked();

    await user.click(within(dialog).getByRole("button", { name: "Cancel plan" }));
    expect(
      await within(dialog).findByText(/Stripe couldn't be reached. Nothing changed/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel plan" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    const cancels = calls.filter((call) => call.path.endsWith("/cancel"));
    expect(cancels.map((call) => call.body)).toEqual([
      { mode: "period_end" },
      { mode: "period_end" },
    ]);
  });

  it("says payments are disabled and offers nothing payable", async () => {
    api({
      [`GET ${BASE}/billing`]: [
        {
          status: 200,
          body: {
            billing: summary({
              provider: { status: "disabled", mode: null, portal_available: false },
              subscription: null,
              payment: {
                state: "none",
                provider_status: null,
                next_payment_at: null,
                action_url: null,
              },
            }),
          },
        },
      ],
    });
    await show();

    expect(
      await screen.findByText(
        "Payments are not available in this environment. Nothing is charged.",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /149\.00 monthly/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Manage billing/ })).toBeDisabled();
    expect(screen.queryByText("Test mode")).not.toBeInTheDocument();
  });

  it("a failed read offers a retry and claims nothing", async () => {
    api({
      [`GET ${BASE}/billing`]: [
        error(500, "internal_error"),
        { status: 200, body: { billing: summary() } },
      ],
    });
    await show();
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    const current = await screen.findByRole("region", { name: "Current plan" });
    expect(within(current).getByText("Starter")).toBeInTheDocument();
  });

  it("marks refunds and disputes on invoices truthfully", async () => {
    api({
      [`GET ${BASE}/billing/invoices`]: [
        {
          status: 200,
          body: {
            invoices: [
              invoice({ amount_refunded: "49.00", amount_refunded_minor: 4900, disputed: true }),
            ],
          },
        },
      ],
    });
    await show();
    const table = await screen.findByRole("table", { name: "Invoices" });
    expect(within(table).getByText(/refunded PLN\s49\.00/)).toBeInTheDocument();
    expect(within(table).getByText("Disputed")).toBeInTheDocument();
  });
});

describe("Gym settings header and sections", () => {
  it("links only the SimpleFit plan; the other sections are Soon", async () => {
    await renderWithProviders(
      <>
        <GymSettingsHeader gymId={GYM} active="plan" />
        <GymSettingsIndex gymId={GYM} />
      </>,
    );
    const nav = screen.getByRole("navigation", { name: "Gym settings" });
    expect(within(nav).getByRole("link", { name: "SimpleFit plan" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).queryByRole("link", { name: /General/ })).toBeNull();
    expect(screen.getAllByRole("link", { name: /SimpleFit plan/ })).toHaveLength(2);
    expect(screen.getAllByText("Soon").length).toBeGreaterThanOrEqual(5);
  });
});
