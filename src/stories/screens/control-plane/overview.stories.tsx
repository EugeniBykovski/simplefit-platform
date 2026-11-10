import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import type { Overview, OverviewPeriod } from "@/entities/admin-overview";
import { RequireSession } from "@/features/session-gate";
import { formats } from "@/shared/i18n/formats";
import { signInRouteFor } from "@/shared/routes/routes";
import { installApi, ok, SESSION, VIEWER } from "@/stories/support/auth-story-api";
import { AdminWorkspace, ControlPlaneOverview, OverviewView } from "@/widgets/admin-workspace";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

import controlPlaneDe from "../../../../messages/de/controlPlane.json";

/*
 * AD1, the Control Plane overview (SF-121; Claude Design `AdminOverview`, MVP). The
 * states render the production view with deterministic fixtures standing in for the
 * backend's answer (Storybook only; production shows only `GET /api/v1/admin/overview`).
 * One story renders the route's own composition (session gate, operator gate, shell).
 */

type Metric = Overview["metrics"][number];
type Check = Overview["health"]["checks"][number];

const c = (key: string, value: number) => ({ key, value });

const metric = (
  id: Metric["id"],
  value: number,
  breakdown: [string, number][] = [],
  period: [string, number][] = [],
  group: Metric["group"] = "population",
): Metric => ({
  id,
  group,
  state: "available",
  value,
  breakdown: breakdown.map(([k, v]) => c(k, v)),
  period_counts: period.map(([k, v]) => c(k, v)),
});

const none = (
  id: Metric["id"],
  state: "restricted" | "unavailable",
  group: Metric["group"] = "population",
): Metric => ({
  id,
  group,
  state,
  value: null,
  breakdown: [],
  period_counts: [],
});

const POPULATED: Metric[] = [
  metric(
    "accounts",
    1284,
    [
      ["in_progress", 17],
      ["not_started", 42],
    ],
    [["registration_completed", 36]],
  ),
  metric("fighter_profiles", 903, [["in_progress", 58]], [["onboarding_completed", 21]]),
  metric("coach_profiles", 147, [["in_progress", 9]], [["onboarding_completed", 4]]),
  metric("gyms", 38, [["draft", 6]], [["setup_completed", 2]]),
  metric(
    "sponsor_organizations",
    11,
    [
      ["suspended", 1],
      ["closed", 0],
    ],
    [["approved", 1]],
  ),
  metric("operators", 2),
  metric(
    "sponsor_applications_waiting",
    5,
    [
      ["submitted", 3],
      ["under_review", 2],
      ["changes_requested", 1],
      ["approved", 12],
      ["rejected", 4],
      ["withdrawn", 1],
    ],
    [
      ["first_submitted", 4],
      ["approved", 1],
      ["rejected", 0],
    ],
    "reviews",
  ),
  none("gym_verifications_waiting", "unavailable", "reviews"),
];

const HEALTHY: Check[] = [
  { id: "database", status: "healthy", counts: [], last_event_at: null },
  {
    id: "background_jobs",
    status: "healthy",
    counts: [c("waiting", 3), c("discarded_24h", 0)],
    last_event_at: null,
  },
  { id: "payments_webhooks", status: "unknown", counts: [], last_event_at: "2026-11-10T09:12:00Z" },
  { id: "email_provider", status: "no_telemetry", counts: [], last_event_at: null },
];

const overview = (
  metrics: Metric[],
  health: Overview["health"] = { state: "available", checks: HEALTHY },
): Overview => ({
  as_of: "2026-11-10T12:00:01Z",
  period: { key: "7d", from: "2026-11-03T12:00:01Z", to: "2026-11-10T12:00:01Z" },
  metrics,
  health,
});

function View(props: { overview?: Overview | undefined; failed?: boolean; forbidden?: boolean }) {
  const [period, setPeriod] = useState<OverviewPeriod>("7d");
  return (
    <OverviewView
      overview={props.overview}
      period={period}
      onPeriod={setPeriod}
      failed={props.failed}
      forbidden={props.forbidden}
      onRetry={() => undefined}
    />
  );
}

export const Ready: StoryObj = { render: () => <View overview={overview(POPULATED)} /> };
Ready.name = "AD1 · ready (founder)";

export const Empty: StoryObj = {
  render: () => (
    <View
      overview={overview(
        POPULATED.map((m) =>
          m.state === "available"
            ? {
                ...m,
                value: m.id === "operators" || m.id === "accounts" ? 1 : 0,
                breakdown: m.breakdown.map((b) => ({ ...b, value: 0 })),
                period_counts: m.period_counts.map((p) => ({ ...p, value: 0 })),
              }
            : m,
        ),
      )}
    />
  ),
};
Empty.name = "AD1 · empty (real zeros)";

export const Partial: StoryObj = {
  render: () => (
    <View
      overview={overview(
        POPULATED.map((m) => (m.id === "operators" ? none("operators", "restricted") : m)),
      )}
    />
  ),
};
Partial.name = "AD1 · partial (one count restricted)";

export const Restricted: StoryObj = {
  render: () => (
    <View
      overview={overview(
        POPULATED.map((m) => (m.group === "population" ? none(m.id, "restricted") : m)),
        { state: "restricted", checks: [] },
      )}
    />
  ),
};
Restricted.name = "AD1 · restricted (reviewer)";

export const Provider: StoryObj = {
  render: () => (
    <View
      overview={overview(POPULATED, {
        state: "available",
        checks: HEALTHY.map((check) =>
          check.id === "background_jobs"
            ? { ...check, status: "degraded", counts: [c("waiting", 14), c("discarded_24h", 3)] }
            : check,
        ),
      })}
    />
  ),
};
Provider.name = "AD1 · provider (jobs degraded)";

export const Loading: StoryObj = { render: () => <View /> };
Loading.name = "AD1 · loading";

export const Error: StoryObj = { render: () => <View failed /> };
Error.name = "AD1 · error";

export const Forbidden: StoryObj = { render: () => <View forbidden /> };
Forbidden.name = "AD1 · no overview permission";

export const PeriodChange: StoryObj = {
  render: () => <View overview={overview(POPULATED)} />,
  play: async ({ canvasElement }) => {
    const button = await within(canvasElement).findByRole("button", { name: "30 days" });
    await userEvent.click(button);
    await expect(button).toHaveAttribute("aria-pressed", "true");
  },
};
PeriodChange.name = "AD1 · period control";

export const LongLocale: StoryObj = {
  // The Storybook preview is English; this story renders the German catalog.
  render: () => (
    <NextIntlClientProvider
      locale="de"
      messages={{ controlPlane: controlPlaneDe }}
      formats={formats}
      timeZone="UTC"
    >
      <View overview={overview(POPULATED)} />
    </NextIntlClientProvider>
  ),
};
LongLocale.name = "AD1 · German (long strings)";

// The route's own composition, on a stand-in of the API.
export const InShell: StoryObj = {
  parameters: {
    nextjs: { appDirectory: true, navigation: { pathname: "/en/admin", segments: [] } },
  },
  beforeEach: () =>
    installApi({
      "/api/me": ok({ user: VIEWER }),
      "/api/auth/session/refresh": ok(SESSION),
      "/api/v1/admin/me": ok({
        operator: {
          id: "5b0c7f1e-3a2d-4c6b-9e8f-1d2a3b4c5d6e",
          status: "active",
          permissions: [
            "platform.dashboard.read",
            "operators.read",
            "sponsors.applications.read",
            "system.health.read",
          ],
          security_keys: { registered: 2, required: 2 },
          step_up: {
            verified_at: "2026-11-10T12:00:00Z",
            // 29 minutes from when the story renders.
            expires_at: new Date(Date.now() + 29 * 60_000).toISOString(),
            fresh_seconds_remaining: 300,
          },
          enrollment_expires_at: null,
          activated_at: "2026-11-09T10:00:00Z",
        },
      }),
      "/api/v1/me/first-run": ok({
        experiences: [
          { experience: "control_plane_web_tour", status: "completed", recorded_at: null },
        ],
      }),
      "/api/v1/admin/overview": ok({ overview: overview(POPULATED) }),
    }),
  render: () => (
    <RequireSession
      signIn={signInRouteFor("web.admin")}
      pending={<LaunchScreen />}
      unavailable={<SessionFailure />}
    >
      <AdminWorkspace>
        <ControlPlaneOverview />
      </AdminWorkspace>
    </RequireSession>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("heading", { name: "Population" }, { timeout: 5000 }),
    ).toBeVisible();
  },
};
InShell.name = "AD1 · in the Control Plane shell";

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

const meta = {
  title: "Control Plane/Overview",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;
