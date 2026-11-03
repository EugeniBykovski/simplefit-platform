import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";

import { GymGate, RequireSession } from "@/features/session-gate";
import { formats } from "@/shared/i18n/formats";
import { signInRouteFor } from "@/shared/routes/routes";
import { installApi, ok, SESSION, VIEWER, type Answer } from "@/stories/support/auth-story-api";
import { GymBilling, GymSettingsHeader } from "@/widgets/gym-billing";
import { GymWorkspace, useGymWorkspace } from "@/widgets/gym-workspace";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";

import deGymBilling from "../../../../messages/de/gymBilling.json";

/*
 * The gym's SimpleFit plan (SF-102, WG25) in the route's own composition
 * (session gate, GYM_WORKSPACE gate, the console of the gym in the path) on
 * a deterministic stand-in of the SF-101/SF-102 API (`fetch` is replaced
 * per story; nothing reaches a backend or Stripe). Plans, prices, invoices
 * and states are Storybook fixtures; production pages show only the
 * backend's reconciled answers. Leaving for Stripe is replaced by a no-op.
 */

const RING = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const VIEWER_ROW = "5e2c7a91-3f4b-4d6e-8a0c-1b9d7f3e5a24";
const SUB = "5b1b2c3d-0000-4000-8000-000000000501";
const PLAN_V = "7c1b2c3d-0000-4000-8000-000000000601";

type Role = "owner" | "manager";

const gym = (role: Role) => ({
  gym: {
    id: RING,
    name: "Ring One Boxing",
    gym_type: "boxing_club",
    setup_status: "completed",
    inserted_at: "2026-10-27T10:00:00Z",
    updated_at: "2026-10-27T10:00:00Z",
    locations: [],
    viewer: {
      role,
      staff_membership_id: VIEWER_ROW,
      permissions:
        role === "owner"
          ? ["view_workspace", "view_staff", "manage_billing"]
          : ["view_workspace", "view_staff"],
    },
  },
});

const entry = (role: Role) => ({
  entry: {
    destination: "gym_home",
    reason: "storybook",
    mandatory: false,
    intent: null,
    context: null,
    account_registration: "complete",
    fighter_profile: "completed",
    coach_profile: "not_started",
    capabilities: ["FIGHTER", "GYM_WORKSPACE"],
    gym_id: RING,
    gym_workspaces: [
      {
        gym_id: RING,
        name: "Ring One Boxing",
        role,
        setup_status: "completed",
        available_actions: ["enter"],
        selected: false,
      },
    ],
    gym_workspace_count: 1,
  },
});

const price = (interval: "month" | "year", amount: string, minor: number, id: string) => ({
  price_version_id: id,
  interval,
  currency: "PLN",
  pricing: "fixed",
  amount,
  amount_minor: minor,
});

const MONTH = price("month", "149.00", 14900, "7c1b2c3d-0000-4000-8000-000000000611");

const PLANS = [
  {
    plan_key: "starter",
    plan_version_id: PLAN_V,
    version: 1,
    name: "Starter",
    description: "One location, the whole gym console.",
    price_source: "product_decision",
    proposed_trial_days: null,
    published_at: "2026-11-01T10:00:00Z",
    prices: [MONTH, price("year", "1490.00", 149000, "7c1b2c3d-0000-4000-8000-000000000612")],
    entitlements: [],
  },
  {
    plan_key: "growth",
    plan_version_id: "7c1b2c3d-0000-4000-8000-000000000602",
    version: 1,
    name: "Growth",
    description: "Several locations and a larger team.",
    price_source: "product_decision",
    proposed_trial_days: null,
    published_at: "2026-11-01T10:00:00Z",
    prices: [
      price("month", "349.00", 34900, "7c1b2c3d-0000-4000-8000-000000000621"),
      price("year", "3490.00", 349000, "7c1b2c3d-0000-4000-8000-000000000622"),
    ],
    entitlements: [],
  },
];

const subscription = (extra: Record<string, unknown> = {}) => ({
  subscription_id: SUB,
  gym_id: RING,
  status: "active",
  plan: { plan_key: "starter", plan_version_id: PLAN_V, version: 1, name: "Starter" },
  price: MONTH,
  cancel_reason: null,
  requested_at: "2026-11-02T10:00:00Z",
  activated_at: "2026-11-02T10:05:00Z",
  current_period_start: "2026-11-02T10:05:00Z",
  current_period_end: "2026-12-02T10:05:00Z",
  cancel_mode: null,
  cancellation_requested_at: null,
  cancellation_effective_at: null,
  ended_at: null,
  ...extra,
});

const NONE = { state: "none", provider_status: null, next_payment_at: null, action_url: null };

const summary = (extra: Record<string, unknown> = {}) => ({
  billing: {
    provider: { status: "ready", mode: "test", portal_available: true },
    subscription: subscription(),
    payment: {
      state: "active",
      provider_status: "active",
      next_payment_at: "2026-12-02T10:05:00Z",
      action_url: null,
    },
    checkout: null,
    ...extra,
  },
});

const invoice = (n: number, extra: Record<string, unknown> = {}) => ({
  invoice_id: `4a1b2c3d-0000-4000-8000-00000000070${n}`,
  number: `SF-000${n}`,
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
  hosted_invoice_url: "https://invoice.stripe.com/i/storybook",
  invoice_pdf: null,
  subscription_id: SUB,
  mode: "test",
  ...extra,
});

/** The plan page of the console's gym, as its route renders it (leaving for Stripe is a no-op). */
function Plan() {
  const gymValue = useGymWorkspace();
  return (
    <div className="flex min-h-full flex-col">
      <GymSettingsHeader gymId={gymValue.id} active="plan" />
      <GymBilling gym={gymValue} navigate={() => undefined} />
    </div>
  );
}

function AppFormats({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale={useLocale()}
      timeZone="UTC"
      messages={useMessages()}
      formats={formats}
    >
      {children}
    </NextIntlClientProvider>
  );
}

function billingStory({
  role = "owner",
  billing = ok(summary()),
  invoices = ok({ invoices: [invoice(1)] }),
  plans = ok({ plans: PLANS }),
  routes = {},
  play,
}: {
  role?: Role;
  billing?: Answer | Answer[];
  invoices?: Answer | Answer[];
  plans?: Answer | Answer[];
  routes?: Record<string, Answer | Answer[]>;
  play?: StoryObj["play"];
} = {}): StoryObj {
  const base = `/api/v1/gyms/${RING}`;
  return {
    parameters: {
      nextjs: {
        appDirectory: true,
        navigation: { pathname: `/en/app/gyms/${RING}/settings/plan` },
      },
    },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/entry": ok(entry(role)),
        [base]: ok(gym(role)),
        [`${base}/billing`]: billing,
        [`${base}/billing/invoices`]: invoices,
        "/api/v1/saas-plans": plans,
        ...routes,
      }),
    render: () => (
      <AppFormats>
        <RequireSession
          signIn={signInRouteFor("web")}
          pending={<LaunchScreen />}
          unavailable={<SessionFailure />}
        >
          <GymGate pending={<LaunchScreen />} failure={<EntryFailure />}>
            <GymWorkspace gymId={RING}>
              <Plan />
            </GymWorkspace>
          </GymGate>
        </RequireSession>
      </AppFormats>
    ),
    play,
  };
}

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

const meta = {
  title: "Gym Console/SimpleFit plan",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const T = 5000;
const current = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole("region", { name: "Current plan" }, { timeout: T });

export const Active = billingStory({
  play: async ({ canvasElement }) => {
    const region = await current(canvasElement);
    await expect(within(region).getByText("Starter")).toBeVisible();
    await expect(within(region).getByText("Test mode")).toBeVisible();
    await expect(
      await within(canvasElement).findByRole("table", { name: "Invoices" }),
    ).toBeVisible();
  },
});

export const NoPlan = billingStory({
  billing: ok(summary({ subscription: null, payment: NONE })),
  invoices: ok({ invoices: [] }),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("No SimpleFit plan", {}, { timeout: T }),
    ).toBeVisible();
    await expect(
      await within(canvasElement).findByRole("button", { name: /149\.00 monthly/ }, { timeout: T }),
    ).toBeEnabled();
  },
});

export const AwaitingCheckout = billingStory({
  billing: ok(
    summary({
      subscription: subscription({
        status: "pending_activation",
        activated_at: null,
        current_period_start: null,
        current_period_end: null,
      }),
      payment: { ...NONE, state: "awaiting_checkout" },
    }),
  ),
  invoices: ok({ invoices: [] }),
});

export const Processing = billingStory({
  billing: ok(
    summary({
      subscription: subscription({
        status: "pending_activation",
        activated_at: null,
        current_period_start: null,
        current_period_end: null,
      }),
      payment: { ...NONE, state: "processing", provider_status: "incomplete" },
    }),
  ),
});

export const ActionRequired = billingStory({
  billing: ok(
    summary({
      subscription: subscription({
        status: "pending_activation",
        activated_at: null,
        current_period_start: null,
        current_period_end: null,
      }),
      payment: {
        state: "action_required",
        provider_status: "incomplete",
        next_payment_at: null,
        action_url: "https://invoice.stripe.com/i/storybook",
      },
    }),
  ),
  invoices: ok({
    invoices: [invoice(1, { status: "open", payment_status: "requires_action", paid_at: null })],
  }),
});

export const PaymentFailed = billingStory({
  billing: ok(
    summary({
      subscription: subscription({
        status: "pending_activation",
        activated_at: null,
        current_period_start: null,
        current_period_end: null,
      }),
      payment: {
        state: "payment_failed",
        provider_status: "incomplete",
        next_payment_at: null,
        action_url: "https://invoice.stripe.com/i/storybook",
      },
    }),
  ),
});

export const PastDue = billingStory({
  billing: ok(
    summary({
      payment: {
        state: "past_due",
        provider_status: "past_due",
        next_payment_at: null,
        action_url: "https://invoice.stripe.com/i/storybook",
      },
    }),
  ),
  invoices: ok({
    invoices: [
      invoice(2, {
        status: "open",
        payment_status: "requires_payment_method",
        paid_at: null,
        issued_at: "2026-12-02T10:05:00Z",
      }),
      invoice(1),
    ],
  }),
});

export const CancellationScheduled = billingStory({
  billing: ok(
    summary({
      subscription: subscription({
        status: "cancellation_scheduled",
        cancel_mode: "period_end",
        cancel_reason: "requested_by_gym",
        cancellation_requested_at: "2026-11-10T10:00:00Z",
        cancellation_effective_at: "2026-12-02T10:05:00Z",
      }),
      payment: {
        state: "cancellation_scheduled",
        provider_status: "active",
        next_payment_at: null,
        action_url: null,
      },
    }),
  ),
});

export const RefundedAndDisputed = billingStory({
  invoices: ok({
    invoices: [
      invoice(2, { amount_refunded: "149.00", amount_refunded_minor: 14900 }),
      invoice(1, { disputed: true }),
    ],
  }),
});

export const PaymentsDisabled = billingStory({
  billing: ok(
    summary({
      provider: { status: "disabled", mode: null, portal_available: false },
      subscription: null,
      payment: NONE,
    }),
  ),
  invoices: ok({ invoices: [] }),
});

export const ProviderUnavailable = billingStory({
  billing: ok(
    summary({
      provider: { status: "unavailable", mode: null, portal_available: false },
      subscription: null,
      payment: NONE,
    }),
  ),
  invoices: ok({ invoices: [] }),
});

export const Restricted = billingStory({
  role: "manager",
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        "Only the gym's owner manages the SimpleFit plan",
        {},
        { timeout: T },
      ),
    ).toBeVisible();
  },
});

export const Loading = billingStory({ billing: "pending" });

export const LoadFailed = billingStory({ billing: "offline" });

export const CancelDialog = billingStory({
  play: async ({ canvasElement }) => {
    await current(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Cancel plan" }));
    await expect(await within(document.body).findByRole("alertdialog")).toBeVisible();
  },
});

function German({ children }: { children: ReactNode }) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider
      locale="de"
      timeZone="UTC"
      messages={{ ...messages, gymBilling: deGymBilling }}
      formats={formats}
    >
      {children}
    </NextIntlClientProvider>
  );
}

export const GermanCopy: StoryObj = {
  ...billingStory({
    billing: ok(
      summary({
        payment: {
          state: "past_due",
          provider_status: "past_due",
          next_payment_at: null,
          action_url: "https://invoice.stripe.com/i/storybook",
        },
      }),
    ),
  }),
  decorators: [(Story) => <German>{Story()}</German>],
};
