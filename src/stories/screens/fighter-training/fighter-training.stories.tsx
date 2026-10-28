import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";

import { FighterGate, RequireSession } from "@/features/session-gate";
import { signInRouteFor } from "@/shared/routes/routes";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import { FighterSessionDetail, FighterTraining } from "@/widgets/fighter-training";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";
import { WorkspaceShell } from "@/widgets/workspace-shell";

import deFighterTraining from "../../../../messages/de/fighterTraining.json";
import deShells from "../../../../messages/de/shells.json";

/*
 * The fighter's Training (SF-67; Claude Design 1792573853-9116:
 * WebCampBoard.dc.html screen=training|session, FighterWebNav): the route's
 * own composition (session gate, Fighter gate, Fighter shell, screen) on a
 * deterministic stand-in of the SF-62 / SF-63 fighter API (`fetch` is
 * replaced per story; nothing reaches an API). Names are Storybook
 * fixtures, not accounts.
 */

const ENTRY = {
  entry: {
    destination: "fighter_home",
    reason: "storybook",
    mandatory: false,
    intent: null,
    context: "fighter",
    account_registration: "complete",
    fighter_profile: "completed",
    coach_profile: "not_started",
    gym_id: null,
    gym_workspaces: [],
    gym_workspace_count: 0,
    capabilities: ["FIGHTER"],
  },
};
const FIGHTER = {
  display_name: "Alex N.",
  username: "alex_n",
  country_code: "PL",
  city: "Warsaw",
  experience_level: "amateur",
  amateur_bout_count: null,
  stance: "orthodox",
  goals: [],
  weight_class: null,
  current_weight_kg: null,
  height_cm: null,
  next_fight_on: null,
  next_fight_name: null,
  onboarding: {
    status: "completed",
    completed_at: "2026-10-01T10:00:00Z",
    missing_requirements: [],
  },
};

const session = (overrides: Record<string, unknown> = {}) => ({
  id: "ses-1",
  relationship_id: "rel-1",
  coach: { display_name: "Julia N.", brand_name: "North Gym" },
  coach_display_name_at_end: null,
  title: "Technical boxing",
  training_type: "technical",
  starts_at: "2026-10-21T16:00:00Z",
  time_zone: "Europe/Warsaw",
  duration_minutes: 60,
  notes: "Jab work and footwork. Keep the last round light.",
  status: "planned",
  completed_at: null,
  cancelled_at: null,
  cancelled_by: null,
  cancel_reason: null,
  inserted_at: "2026-10-20T10:00:00Z",
  updated_at: "2026-10-20T10:00:00Z",
  ...overrides,
});

const FORMER = { coach: null, coach_display_name_at_end: "Tomasz M." };

const UPCOMING = [
  session(),
  session({
    id: "ses-2",
    title: "Pads with coach",
    training_type: "pads",
    starts_at: "2026-10-21T18:00:00Z",
    duration_minutes: 45,
    coach: { display_name: null, brand_name: null },
  }),
  session({
    id: "ses-3",
    title: "S&C circuit",
    training_type: "strength_conditioning",
    starts_at: "2026-10-23T15:30:00Z",
    duration_minutes: 50,
    coach: { display_name: "Tomasz M.", brand_name: null },
  }),
];

const HISTORY = [
  session({
    id: "ses-4",
    title: "Roadwork intervals",
    training_type: "roadwork",
    starts_at: "2026-10-18T08:00:00Z",
    duration_minutes: 45,
    status: "completed",
    completed_at: "2026-10-18T09:05:00Z",
  }),
  session({
    id: "ses-5",
    starts_at: "2026-10-16T16:00:00Z",
    status: "cancelled",
    cancelled_at: "2026-10-15T09:30:00Z",
    cancelled_by: "system",
    cancel_reason: "relationship_ended",
    ...FORMER,
  }),
  session({
    id: "ses-6",
    title: "Pads with coach",
    training_type: "pads",
    starts_at: "2026-10-16T17:30:00Z",
    duration_minutes: 45,
  }),
];

/** The backend's `409` with the reason it gives in `details`. */
const conflict = (details: Record<string, string>): Answer => ({
  status: 409,
  body: { error: { code: "conflict", message: "storybook", details } },
});

const SESSIONS = "/api/v1/me/training-sessions";
type Screen = "list" | "history" | "detail";

const PATHS: Record<Screen, string> = {
  list: "/en/app/training",
  history: "/en/app/training",
  detail: "/en/app/training/ses-1",
};

function story({
  screen = "list",
  filter = "all",
  list = ok({ training_sessions: UPCOMING, next_cursor: null }),
  detail = ok({ training_session: session() }),
  complete = ok({
    training_session: session({ status: "completed", completed_at: "2026-10-21T17:12:00Z" }),
  }),
  play,
}: {
  screen?: Screen;
  filter?: "all" | "completed" | "cancelled";
  list?: Answer | Answer[];
  detail?: Answer | Answer[];
  complete?: Answer | Answer[];
  play?: StoryObj["play"];
} = {}): StoryObj {
  return {
    parameters: {
      nextjs: { appDirectory: true, navigation: { pathname: PATHS[screen] } },
    },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/entry": ok(ENTRY),
        "/api/v1/me/fighter-profile": ok({ fighter_profile: FIGHTER }),
        "/api/v1/me/first-run": ok({
          experiences: [{ experience: "fighter_web_tour", status: "completed", recorded_at: null }],
        }),
        [SESSIONS]: list,
        [`${SESSIONS}/ses-1`]: detail,
        [`POST ${SESSIONS}/ses-1/complete`]: complete,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <FighterGate pending={<LaunchScreen />} failure={<EntryFailure />}>
          <WorkspaceShell shell="web.app.fighter">
            {screen === "list" ? (
              <FighterTraining />
            ) : screen === "history" ? (
              <FighterTraining view="history" filter={filter} />
            ) : (
              <FighterSessionDetail sessionId="ses-1" />
            )}
          </WorkspaceShell>
        </FighterGate>
      </RequireSession>
    ),
    play,
  };
}

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

/** German copy over the English messages: the longest labels. */
function German({ children }: { children: ReactNode }) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider
      locale="de"
      timeZone="UTC"
      messages={{ ...messages, fighterTraining: deFighterTraining, shells: deShells }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

const meta = {
  title: "Fighter Training/Training and Session",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const T = { timeout: 5000 };
const body = () => within(document.body);

/* ── WFT1 Training ──────────────────────────────────────────────────── */

export const Upcoming = story({
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("link", { name: "Technical boxing" }, T);
    await expect(within(canvasElement).getByText("Coach not shared")).toBeVisible();
  },
});
Upcoming.name = "WFT1 · upcoming";

export const History = story({
  screen: "history",
  list: ok({ training_sessions: HISTORY, next_cursor: null }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("link", { name: "Roadwork intervals" }, T);
    await expect(within(canvasElement).getByText("Former coach · Tomasz M.")).toBeVisible();
  },
});
History.name = "WFT1 · history (completed, cancelled, past due)";

export const HistoryCompleted = story({
  screen: "history",
  filter: "completed",
  list: ok({ training_sessions: HISTORY.slice(0, 1), next_cursor: null }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("link", { name: "Roadwork intervals" }, T);
  },
});
HistoryCompleted.name = "WFT1 · history · completed";

export const HistoryCancelled = story({
  screen: "history",
  filter: "cancelled",
  list: ok({ training_sessions: HISTORY.slice(1, 2), next_cursor: null }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("link", { name: "Technical boxing" }, T);
  },
});
HistoryCancelled.name = "WFT1 · history · cancelled";

export const MorePages = story({
  list: [
    ok({ training_sessions: UPCOMING.slice(0, 2), next_cursor: "c2" }),
    ok({ training_sessions: UPCOMING.slice(2), next_cursor: null }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Show more" }, T));
    await canvas.findByRole("link", { name: "S&C circuit" }, T);
  },
});
MorePages.name = "WFT1 · show more (cursor)";

export const MoreFailed = story({
  list: [
    ok({ training_sessions: UPCOMING.slice(0, 2), next_cursor: "c2" }),
    apiError(503, "service_unavailable"),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Show more" }, T));
    await canvas.findByText("We couldn’t load more sessions. Try again.", {}, T);
  },
});
MoreFailed.name = "WFT1 · show more failed";

export const Loading = story({ list: "pending" });
Loading.name = "WFT1 · loading";

export const Empty = story({
  list: ok({ training_sessions: [], next_cursor: null }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("No upcoming training", {}, T);
  },
});
Empty.name = "WFT1 · empty (real)";

export const HistoryEmpty = story({
  screen: "history",
  list: ok({ training_sessions: [], next_cursor: null }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("No past training yet", {}, T);
  },
});
HistoryEmpty.name = "WFT1 · history empty";

export const Unavailable = story({
  list: apiError(404, "not_found"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("Training isn’t available", {}, T);
  },
});
Unavailable.name = "WFT1 · not available (404)";

export const Failure = story({
  list: apiError(503, "service_unavailable"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("We couldn’t load your training.", {}, T);
  },
});
Failure.name = "WFT1 · backend failure (recoverable)";

/* ── WFT2 Session ───────────────────────────────────────────────────── */

const heading = (canvasElement: HTMLElement, name: string) =>
  within(canvasElement).findByRole("heading", { level: 1, name }, T);

export const Planned = story({
  screen: "detail",
  play: async ({ canvasElement }) => {
    await heading(canvasElement, "Technical boxing");
    await expect(
      within(canvasElement).getByRole("button", { name: "Mark as completed" }),
    ).toBeVisible();
  },
});
Planned.name = "WFT2 · planned";

export const PlannedEnded = story({
  screen: "detail",
  detail: ok({ training_session: session(FORMER) }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/had already started/, {}, T);
  },
});
PlannedEnded.name = "WFT2 · planned after the relationship ended";

export const Completed = story({
  screen: "detail",
  detail: ok({ training_session: HISTORY[0] }),
  play: async ({ canvasElement }) => {
    await heading(canvasElement, "Roadwork intervals");
  },
});
Completed.name = "WFT2 · completed";

export const CancelledByCoach = story({
  screen: "detail",
  detail: ok({
    training_session: session({
      status: "cancelled",
      cancelled_at: "2026-10-20T07:30:00Z",
      cancelled_by: "coach",
    }),
  }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/by your coach/, {}, T);
  },
});
CancelledByCoach.name = "WFT2 · cancelled";

export const CancelledBySystem = story({
  screen: "detail",
  detail: ok({ training_session: HISTORY[1] }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/the coaching relationship ended/, {}, T);
  },
});
CancelledBySystem.name = "WFT2 · cancelled by the system";

export const DetailLoading = story({ screen: "detail", detail: "pending" });
DetailLoading.name = "WFT2 · loading";

export const Missing = story({
  screen: "detail",
  detail: apiError(404, "not_found"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("This session isn’t available", {}, T);
  },
});
Missing.name = "WFT2 · not available (404)";

export const DetailFailure = story({
  screen: "detail",
  detail: apiError(503, "service_unavailable"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("We couldn’t load this session.", {}, T);
  },
});
DetailFailure.name = "WFT2 · backend failure (recoverable)";

const openComplete = async (canvasElement: HTMLElement) => {
  await heading(canvasElement, "Technical boxing");
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Mark as completed" }));
  return body().findByRole("alertdialog", { name: "Mark this session completed?" }, T);
};
const confirm = async (canvasElement: HTMLElement) => {
  const dialog = await openComplete(canvasElement);
  await userEvent.click(within(dialog).getByRole("button", { name: "Mark as completed" }));
  return dialog;
};

export const CompleteConfirm = story({
  screen: "detail",
  play: async ({ canvasElement }) => {
    await openComplete(canvasElement);
  },
});
CompleteConfirm.name = "WFT2 · confirm completion";

export const CompletePending = story({
  screen: "detail",
  complete: "pending",
  play: async ({ canvasElement }) => {
    const dialog = await confirm(canvasElement);
    await within(dialog).findByRole("button", { name: "Saving…" }, T);
  },
});
CompletePending.name = "WFT2 · completing";

export const CompleteFailed = story({
  screen: "detail",
  complete: "offline",
  play: async ({ canvasElement }) => {
    const dialog = await confirm(canvasElement);
    await within(dialog).findByText(/It may already be saved/, {}, T);
  },
});
CompleteFailed.name = "WFT2 · completion failed (may already be saved)";

export const CompleteDone = story({
  screen: "detail",
  play: async ({ canvasElement }) => {
    await confirm(canvasElement);
    await within(canvasElement).findByText("Completed", { selector: "dt" }, T);
  },
});
CompleteDone.name = "WFT2 · completed now";

export const NotStarted = story({
  screen: "detail",
  complete: conflict({ starts_at: "not_started" }),
  play: async ({ canvasElement }) => {
    await confirm(canvasElement);
    await within(canvasElement).findByText("This session hasn’t started yet.", {}, T);
  },
});
NotStarted.name = "WFT2 · not started yet (409)";

export const CancelledMeanwhile = story({
  screen: "detail",
  detail: [
    ok({ training_session: session() }),
    ok({
      training_session: session({
        status: "cancelled",
        cancelled_at: "2026-10-21T15:00:00Z",
        cancelled_by: "coach",
      }),
    }),
  ],
  complete: conflict({ status: "cancelled" }),
  play: async ({ canvasElement }) => {
    await confirm(canvasElement);
    await within(canvasElement).findByText("This session was cancelled.", {}, T);
  },
});
CancelledMeanwhile.name = "WFT2 · cancelled meanwhile (409)";

/* ── Locale ─────────────────────────────────────────────────────────── */

export const UpcomingGerman: StoryObj = {
  ...story(),
  decorators: [
    (Story) => (
      <German>
        <Story />
      </German>
    ),
  ],
};
UpcomingGerman.name = "WFT1 · German (longest labels)";

export const PlannedGerman: StoryObj = {
  ...story({ screen: "detail" }),
  decorators: [
    (Story) => (
      <German>
        <Story />
      </German>
    ),
  ],
};
PlannedGerman.name = "WFT2 · German (longest labels)";
