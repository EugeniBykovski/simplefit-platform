import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, fn, userEvent, within } from "storybook/test";

import { ControlPlaneEntry, type EntryView } from "@/features/control-plane-entry";
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
import { AdminWorkspace, ControlPlaneWelcome } from "@/widgets/admin-workspace";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

/*
 * The Control Plane (SF-120; Claude Design AD0 `AdminSignIn` and ARW1
 * `FirstRunAdmin`, MVP). AD0 renders the production entry card per state; ARW1
 * renders the route's own composition (session gate, operator gate, admin shell,
 * welcome) on a deterministic stand-in of the API: `fetch` is replaced per story,
 * nothing reaches a backend, and no browser ceremony runs.
 */

const actions = {
  onUseKey: fn(),
  onRegister: fn(),
  onCancel: fn(),
  onRecovery: fn(),
  onBack: fn(),
  onContinue: fn(),
  onRetry: fn(),
};

const entry = (view: EntryView): StoryObj => ({
  render: () => <ControlPlaneEntry view={view} {...actions} />,
});

export const Checking = entry({ kind: "checking" });
Checking.name = "AD0 · checking";
export const Key = entry({ kind: "key", lapsed: false });
Key.name = "AD0 · key";
export const Waiting = entry({ kind: "waiting" });
Waiting.name = "AD0 · waiting";
export const Failed = entry({ kind: "key", lapsed: false, problem: "failed" });
Failed.name = "AD0 · failed";
export const RateLimited = entry({ kind: "key", lapsed: false, problem: "rateLimited" });
RateLimited.name = "AD0 · failed (rate limited)";
export const Enroll = entry({ kind: "enroll", registered: 0, required: 2 });
Enroll.name = "AD0 · enroll";
export const EnrollSecond = entry({ kind: "enroll", registered: 1, required: 2 });
EnrollSecond.name = "AD0 · enroll_second";
export const EnrollRejected = entry({
  kind: "enroll",
  registered: 1,
  required: 2,
  problem: "rejected",
});
EnrollRejected.name = "AD0 · enroll_second (synced passkey rejected)";
export const EnrollDone = entry({ kind: "enrollDone", required: 2 });
EnrollDone.name = "AD0 · enroll_done";
export const Reverify = entry({ kind: "key", lapsed: true });
Reverify.name = "AD0 · reverify";
export const Recovery = entry({ kind: "recovery" });
Recovery.name = "AD0 · recovery";
export const Unavailable = entry({ kind: "unavailable" });
Unavailable.name = "AD0 · unavailable";
export const EnrollmentExpired = entry({ kind: "enrollmentExpired" });
EnrollmentExpired.name = "AD0 · enrolment window ended";
export const Unsupported = entry({ kind: "unsupported" });
Unsupported.name = "AD0 · browser without security keys";
export const ServiceUnavailable = entry({ kind: "serviceUnavailable" });
ServiceUnavailable.name = "AD0 · security keys unavailable";
export const LoadFailed = entry({ kind: "loadFailed" });
LoadFailed.name = "AD0 · couldn't check access";

// ARW1 in the route composition.

const FOUNDER = [
  "operators.read",
  "operators.manage",
  "audit.read",
  "sponsors.applications.read",
  "sponsors.restrict",
];
const REVIEWER = ["sponsors.applications.read", "sponsors.applications.claim"];

const operator = (permissions: string[]) =>
  ok({
    operator: {
      id: "5b0c7f1e-3a2d-4c6b-9e8f-1d2a3b4c5d6e",
      status: "active",
      permissions,
      security_keys: { registered: 2, required: 2 },
      step_up: {
        verified_at: "2026-11-10T12:00:00Z",
        // 29 minutes from when the story renders: the operator block shows "29 min left".
        expires_at: new Date(Date.now() + 29 * 60_000).toISOString(),
        fresh_seconds_remaining: 300,
      },
      enrollment_expires_at: null,
      activated_at: "2026-11-09T10:00:00Z",
    },
  });
const firstRun = (status: string) =>
  ok({
    experiences: [
      { experience: "fighter_web_tour", status: "unavailable", recorded_at: null },
      { experience: "fighter_mobile_first_run", status: "unavailable", recorded_at: null },
      { experience: "control_plane_web_tour", status, recorded_at: null },
    ],
  });
const kept = (status: string) =>
  ok({
    experience: {
      experience: "control_plane_web_tour",
      status,
      recorded_at: "2026-11-10T12:05:00Z",
    },
  });

function welcome({
  permissions = FOUNDER,
  run = firstRun("pending"),
  play,
}: {
  permissions?: string[];
  run?: Answer | Answer[];
  play?: StoryObj["play"];
}): StoryObj {
  return {
    parameters: {
      nextjs: {
        appDirectory: true,
        navigation: { pathname: "/en/admin/welcome", segments: [] },
      },
    },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/admin/me": operator(permissions),
        "/api/v1/me/first-run": run,
        "PUT /api/v1/me/first-run/control_plane_web_tour": kept("completed"),
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web.admin")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <AdminWorkspace>
          <ControlPlaneWelcome />
        </AdminWorkspace>
      </RequireSession>
    ),
    play,
  };
}

const card = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole(
    "heading",
    { name: "Welcome to the Control Plane" },
    { timeout: 5000 },
  );

export const Ready = welcome({
  play: async ({ canvasElement }) => {
    await expect(await card(canvasElement)).toBeVisible();
  },
});
Ready.name = "ARW1 · ready (founder)";

export const Restricted = welcome({
  permissions: REVIEWER,
  play: async ({ canvasElement }) => {
    await expect(await card(canvasElement)).toBeVisible();
  },
});
Restricted.name = "ARW1 · restricted (reviewer)";

/** The tour at `step` (1–3), or its done card after Finish. */
const tourAt =
  (step: number | "done"): StoryObj["play"] =>
  async ({ canvasElement }) => {
    await card(canvasElement);
    await userEvent.click(
      await within(canvasElement).findByRole(
        "button",
        { name: "Take the tour" },
        { timeout: 5000 },
      ),
    );
    const tour = await within(document.body).findByRole("dialog", {}, { timeout: 5000 });
    const next = step === "done" ? 3 : step;
    for (let i = 1; i < next; i += 1) {
      await userEvent.click(within(tour).getByRole("button", { name: "Next" }));
    }
    if (step === "done") {
      await userEvent.click(within(tour).getByRole("button", { name: "Finish" }));
      await expect(
        await within(tour).findByRole("heading", { name: "You’re ready" }),
      ).toBeVisible();
    }
  };

export const TourWelcome = welcome({ play: tourAt(1) });
TourWelcome.name = "ARW1 · tour 1 of 3, what this is";
export const TourSensitive = welcome({ play: tourAt(2) });
TourSensitive.name = "ARW1 · tour 2 of 3, sensitive actions";
export const TourMe = welcome({ play: tourAt(3) });
TourMe.name = "ARW1 · tour 3 of 3, your key check";
export const TourDone = welcome({ play: tourAt("done") });
TourDone.name = "ARW1 · done";

export const Recorded = welcome({
  run: firstRun("completed"),
  play: async ({ canvasElement }) => {
    await expect(await card(canvasElement)).toBeVisible();
  },
});
Recorded.name = "ARW1 · already recorded (reference)";

export const LoadError = welcome({
  run: apiError(500, "internal_error"),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole(
        "heading",
        { name: "We couldn’t load your access" },
        { timeout: 5000 },
      ),
    ).toBeVisible();
  },
});
LoadError.name = "ARW1 · error";

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

const meta = {
  title: "Control Plane/Entry and first visit",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;
