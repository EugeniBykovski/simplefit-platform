import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { OperationsPage } from "@/widgets/admin-operations";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

/*
 * AD17 (SF-126; Claude Design `AdminIntegrations`, MVP reduced) on a deterministic
 * stand-in of the API: `fetch` is replaced per story and nothing reaches a backend. The
 * checks, queues and jobs are Storybook fixtures.
 */

const NOW = "2026-11-11T12:00:00Z";
const counts = (all: Record<string, number> = {}) => ({
  available: 0,
  scheduled: 0,
  executing: 0,
  retryable: 0,
  completed: 0,
  discarded: 0,
  cancelled: 0,
  ...all,
});
const health = (overrides: Record<string, unknown> = {}) => ({
  health: {
    observed_at: NOW,
    checks: [
      { id: "api", status: "healthy", observed_at: NOW, counts: [], last_event_at: null },
      {
        id: "database",
        status: "healthy",
        observed_at: NOW,
        counts: [{ key: "query_ms", value: 2 }],
        last_event_at: null,
      },
      {
        id: "background_jobs",
        status: "degraded",
        observed_at: NOW,
        counts: [
          { key: "waiting", value: 3 },
          { key: "executing", value: 0 },
          { key: "failed_24h", value: 1 },
        ],
        last_event_at: null,
      },
      { id: "email", status: "unknown", observed_at: NOW, counts: [], last_event_at: null },
      {
        id: "payments_webhooks",
        status: "unknown",
        observed_at: NOW,
        counts: [],
        last_event_at: null,
      },
      { id: "storage", status: "no_telemetry", observed_at: null, counts: [], last_event_at: null },
      {
        id: "error_monitoring",
        status: "no_telemetry",
        observed_at: null,
        counts: [],
        last_event_at: null,
      },
    ],
    queues: [
      { name: "default", limit: 10, counts: counts({ available: 3, discarded: 1 }) },
      { name: "mailers", limit: 5, counts: counts() },
    ],
    migrations: { applied: 43, latest_version: "20261205090000" },
    release: { release: "simplefit-api@0.1.0", environment: "dev", source: "default" },
    ...overrides,
  },
});
const job = {
  id: 41,
  queue: "mailers",
  worker: "SimpleFit.Email.DeliveryWorker",
  state: "discarded",
  attempt: 5,
  max_attempts: 5,
  inserted_at: NOW,
  scheduled_at: NOW,
  attempted_at: NOW,
  completed_at: null,
  discarded_at: NOW,
  cancelled_at: null,
  failure: "Oban.PerformError",
  errors: 5,
  retry: "not_supported",
};

const operator = (permissions: string[]) =>
  ok({
    operator: {
      id: "5b0c7f1e-3a2d-4c6b-9e8f-1d2a3b4c5d6e",
      status: "active",
      permissions,
      security_keys: { registered: 2, required: 2 },
      step_up: {
        verified_at: "2026-11-10T12:00:00Z",
        expires_at: new Date(Date.now() + 29 * 60_000).toISOString(),
        fresh_seconds_remaining: 300,
      },
      enrollment_expires_at: null,
      activated_at: "2026-11-09T10:00:00Z",
    },
  });

const BOTH = ["system.health.read", "system.jobs.read"];

function story(
  permissions: string[],
  routes: Record<string, Answer | Answer[]>,
  text: string,
  play?: StoryObj["play"],
): StoryObj {
  return {
    parameters: {
      nextjs: {
        appDirectory: true,
        navigation: { pathname: "/en/admin/integrations", segments: [] },
      },
    },
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
        <OperationsPage />
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

const JOBS_OK = ok({ jobs: [job], next_cursor: "next" });

export const Measured = story(
  BOTH,
  { "/api/v1/admin/operations/health": ok(health()), "/api/v1/admin/operations/jobs": JOBS_OK },
  "Service health",
);
Measured.name = "AD17 · measured (degraded jobs, unknown, no telemetry)";

export const AllHealthy = story(
  ["system.health.read"],
  {
    "/api/v1/admin/operations/health": ok(
      health({
        checks: health().health.checks.map((check) =>
          check.id === "background_jobs" ? { ...check, status: "healthy" } : check,
        ),
      }),
    ),
  },
  "The job list needs job access.",
);
AllHealthy.name = "AD17 · health only (no job access)";

export const Unreachable = story(
  BOTH,
  {
    "/api/v1/admin/operations/health": apiError(503, "service_unavailable"),
    "/api/v1/admin/operations/jobs": JOBS_OK,
  },
  "We can’t reach the health checks.",
);
Unreachable.name = "AD17 · unreachable";

export const QueuesUnavailable = story(
  ["system.health.read"],
  { "/api/v1/admin/operations/health": ok(health({ queues: null, migrations: null })) },
  "Couldn’t count the jobs.",
);
QueuesUnavailable.name = "AD17 · queues and migrations unavailable";

export const Restricted = story(
  [],
  { "/api/v1/admin/operations/health": apiError(403, "forbidden") },
  "You don’t have access to this section",
);
Restricted.name = "AD17 · restricted";

export const JobsEmpty = story(
  BOTH,
  {
    "/api/v1/admin/operations/health": ok(health()),
    "/api/v1/admin/operations/jobs": ok({ jobs: [], next_cursor: null }),
  },
  "No jobs match.",
);
JobsEmpty.name = "AD17 · no failed jobs";

export const JobDetail = story(
  BOTH,
  {
    "/api/v1/admin/operations/health": ok(health()),
    "/api/v1/admin/operations/jobs": JOBS_OK,
    "/api/v1/admin/operations/jobs/41": ok({ job }),
  },
  "",
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "#41" }, { timeout: 5000 }));
    await expect(await canvas.findByText(/no worker has an approved retry policy/)).toBeVisible();
  },
);
JobDetail.name = "AD17 · job detail (retry not available)";

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

const meta = {
  title: "Control Plane/System health",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;
