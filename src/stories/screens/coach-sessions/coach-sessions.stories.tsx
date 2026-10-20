import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";

import { CoachGate, RequireSession } from "@/features/session-gate";
import { signInRouteFor } from "@/shared/routes/routes";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import {
  CoachSessionCreate,
  CoachSessionDetail,
  CoachSessionEdit,
  CoachSessions,
} from "@/widgets/coach-sessions";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";
import { WorkspaceShell } from "@/widgets/workspace-shell";

import deCoachSessions from "../../../../messages/de/coachSessions.json";
import deShells from "../../../../messages/de/shells.json";

/*
 * The Coach sessions planner (SF-64; Claude Design 1792490047-d551: WCT1,
 * WC3, WCT2, WCT3, CoachWebNav): the route's own composition (session gate,
 * Coach gate, Coach shell, screen) on a deterministic stand-in of the SF-62
 * / SF-63 backend (`fetch` is replaced per story; nothing reaches an API).
 * Names are Storybook fixtures, not accounts.
 */

const ENTRY = {
  entry: {
    destination: "coach_home",
    reason: "storybook",
    mandatory: false,
    intent: null,
    context: "coach",
    account_registration: "complete",
    fighter_profile: "not_started",
    coach_profile: "completed",
    capabilities: ["COACH"],
  },
};

const RELATIONSHIP = {
  relationship_id: "rel-1",
  status: "active",
  started_at: "2026-09-01T10:00:00Z",
  ended_at: null,
  ended_by: null,
  disclosure_version: "storybook-disclosure",
  disclosed_fields: ["display_name", "username"],
  fighter: {
    display_name: "Alex K.",
    username: "alex_k",
    country_code: null,
    city: null,
    experience_level: null,
    stance: null,
    amateur_bout_count: null,
  },
  fighter_display_name_at_end: null,
};

const session = (overrides: Record<string, unknown> = {}) => ({
  id: "ses-1",
  relationship_id: "rel-1",
  fighter: { display_name: "Alex K.", username: "alex_k" },
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

const UPCOMING = [
  session(),
  session({
    id: "ses-2",
    title: "Pads with coach",
    training_type: "pads",
    starts_at: "2026-10-21T18:00:00Z",
    duration_minutes: 45,
    fighter: { display_name: "Julia N.", username: "julia_n" },
  }),
  session({
    id: "ses-3",
    title: "S&C circuit",
    training_type: "strength_conditioning",
    starts_at: "2026-10-23T15:30:00Z",
    duration_minutes: 50,
    fighter: { display_name: null, username: null },
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
    cancelled_by: "coach",
  }),
  session({
    id: "ses-6",
    title: "Pads with coach",
    training_type: "pads",
    starts_at: "2026-10-16T17:30:00Z",
    duration_minutes: 45,
  }),
];

const SESSIONS = "/api/v1/me/coach/training-sessions";
type Screen = "planner" | "history" | "create" | "detail" | "edit";

const PATHS: Record<Screen, string> = {
  planner: "/en/app/coach/sessions",
  history: "/en/app/coach/sessions",
  create: "/en/app/coach/sessions/new",
  detail: "/en/app/coach/sessions/ses-1",
  edit: "/en/app/coach/sessions/ses-1/edit",
};

function story({
  screen = "planner",
  filter = "all",
  list = ok({ training_sessions: UPCOMING, next_cursor: null }),
  detail = ok({ training_session: session() }),
  roster = ok({ relationships: [RELATIONSHIP], next_cursor: null }),
  extra = {},
  play,
}: {
  screen?: Screen;
  filter?: "all" | "completed" | "cancelled";
  list?: Answer | Answer[];
  detail?: Answer | Answer[];
  roster?: Answer;
  extra?: Record<string, Answer | Answer[]>;
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
        "/api/v1/me/coach/fighters": roster,
        [SESSIONS]: list,
        [`${SESSIONS}/ses-1`]: detail,
        ...extra,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <CoachGate pending={<LaunchScreen />} failure={<EntryFailure />}>
          <WorkspaceShell shell="web.app.coach">
            {screen === "planner" ? (
              <CoachSessions />
            ) : screen === "history" ? (
              <CoachSessions view="history" filter={filter} />
            ) : screen === "create" ? (
              <CoachSessionCreate />
            ) : screen === "detail" ? (
              <CoachSessionDetail sessionId="ses-1" />
            ) : (
              <CoachSessionEdit sessionId="ses-1" />
            )}
          </WorkspaceShell>
        </CoachGate>
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
      messages={{ ...messages, coachSessions: deCoachSessions, shells: deShells }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

const meta = {
  title: "Coach Sessions/Planner, Session and Form",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const T = { timeout: 5000 };
const body = () => within(document.body);
const formReady = (canvasElement: HTMLElement) =>
  within(canvasElement).findByLabelText("Title", {}, T);
const fill = async (canvasElement: HTMLElement, date: string, time: string) => {
  const canvas = within(canvasElement);
  await userEvent.type(await formReady(canvasElement), "Technical boxing");
  await userEvent.click(canvas.getByRole("radio", { name: "Technical" }));
  await userEvent.type(canvas.getByLabelText("Date"), date);
  await userEvent.type(canvas.getByLabelText("Start time"), time);
};
/** Picks Europe/Warsaw in the zone combobox, whatever the browser's zone. */
const warsaw = async (canvasElement: HTMLElement) => {
  await userEvent.click(within(canvasElement).getByRole("combobox", { name: "Time zone" }));
  await userEvent.type(body().getByRole("combobox", { name: "Search time zones" }), "Warsaw");
  await userEvent.keyboard("{Enter}");
};

/* ── WCT1 planner ───────────────────────────────────────────────────── */

export const Upcoming = story({
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("link", { name: "Technical boxing" }, T);
    await expect(within(canvasElement).getByText("Fighter not shared")).toBeVisible();
  },
});
Upcoming.name = "WCT1 · upcoming";

export const History = story({
  screen: "history",
  list: ok({ training_sessions: HISTORY, next_cursor: null }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("link", { name: "Roadwork intervals" }, T);
  },
});
History.name = "WCT1 · history (completed, cancelled, past due)";

export const HistoryCompleted = story({
  screen: "history",
  filter: "completed",
  list: ok({ training_sessions: HISTORY.slice(0, 1), next_cursor: null }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("link", { name: "Roadwork intervals" }, T);
  },
});
HistoryCompleted.name = "WCT1 · history · completed";

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
MorePages.name = "WCT1 · show more (cursor)";

export const Loading = story({ list: "pending" });
Loading.name = "WCT1 · loading";

export const Empty = story({
  list: ok({ training_sessions: [], next_cursor: null }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("No upcoming sessions", {}, T);
  },
});
Empty.name = "WCT1 · empty (real)";

export const HistoryEmpty = story({
  screen: "history",
  list: ok({ training_sessions: [], next_cursor: null }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("No past sessions yet", {}, T);
  },
});
HistoryEmpty.name = "WCT1 · history empty";

export const Unavailable = story({
  list: apiError(404, "not_found"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("Sessions aren’t available yet", {}, T);
    await expect(within(canvasElement).getByRole("button", { name: "New session" })).toBeDisabled();
  },
});
Unavailable.name = "WCT1 · planning not available (404)";

export const Failure = story({
  list: apiError(503, "service_unavailable"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("We couldn’t load your sessions.", {}, T);
  },
});
Failure.name = "WCT1 · backend failure (recoverable)";

/* ── WC3 new session ────────────────────────────────────────────────── */

export const Create = story({
  screen: "create",
  play: async ({ canvasElement }) => {
    await formReady(canvasElement);
  },
});
Create.name = "WC3 · new session";

export const CreateInvalid = story({
  screen: "create",
  play: async ({ canvasElement }) => {
    await formReady(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Assign session" }));
    await within(canvasElement).findByText("Enter a title of up to 80 characters.", {}, T);
  },
});
CreateInvalid.name = "WC3 · invalid";

export const CreateGap = story({
  screen: "create",
  play: async ({ canvasElement }) => {
    await fill(canvasElement, "2027-03-28", "02:30");
    await warsaw(canvasElement);
    await within(canvasElement).findByText("This time doesn’t exist on that day.", {}, T);
  },
});
CreateGap.name = "WC3 · time that doesn’t exist (DST gap)";

export const CreateOverlap = story({
  screen: "create",
  play: async ({ canvasElement }) => {
    await fill(canvasElement, "2026-10-25", "02:30");
    await warsaw(canvasElement);
    await within(canvasElement).findByRole(
      "group",
      { name: "This time happens twice on that day." },
      T,
    );
  },
});
CreateOverlap.name = "WC3 · repeated time (DST overlap)";

export const CreateSaving = story({
  screen: "create",
  extra: { [`POST ${SESSIONS}`]: "pending" },
  play: async ({ canvasElement }) => {
    await fill(canvasElement, "2026-11-04", "18:00");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Assign session" }));
    await within(canvasElement).findByRole("button", { name: "Saving…" }, T);
  },
});
CreateSaving.name = "WC3 · saving";

export const CreateFailed = story({
  screen: "create",
  extra: { [`POST ${SESSIONS}`]: "offline" },
  play: async ({ canvasElement }) => {
    await fill(canvasElement, "2026-11-04", "18:00");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Assign session" }));
    await within(canvasElement).findByText("We couldn’t save the session.", {}, T);
  },
});
CreateFailed.name = "WC3 · failed (retry reuses the request key)";

export const CreateUnavailable = story({
  screen: "create",
  extra: { [`POST ${SESSIONS}`]: apiError(404, "not_found") },
  play: async ({ canvasElement }) => {
    await fill(canvasElement, "2026-11-04", "18:00");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Assign session" }));
    await within(canvasElement).findByText("You can’t plan for this fighter any more.", {}, T);
  },
});
CreateUnavailable.name = "WC3 · relationship no longer available (404)";

export const CreateNoFighters = story({
  screen: "create",
  roster: ok({ relationships: [], next_cursor: null }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("No fighters to plan for yet", {}, T);
  },
});
CreateNoFighters.name = "WC3 · no fighters";

/* ── WCT2 one session ───────────────────────────────────────────────── */

export const Planned = story({
  screen: "detail",
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("heading", { level: 1, name: "Technical boxing" }, T);
  },
});
Planned.name = "WCT2 · planned";

export const Completed = story({
  screen: "detail",
  detail: ok({ training_session: HISTORY[0] }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("heading", { level: 1, name: "Roadwork intervals" }, T);
  },
});
Completed.name = "WCT2 · completed";

export const Cancelled = story({
  screen: "detail",
  detail: ok({
    training_session: session({
      status: "cancelled",
      cancelled_at: "2026-10-20T07:30:00Z",
      cancelled_by: "system",
      cancel_reason: "relationship_ended",
    }),
  }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/the coaching relationship ended/, {}, T);
  },
});
Cancelled.name = "WCT2 · cancelled (relationship ended)";

export const Missing = story({
  screen: "detail",
  detail: apiError(404, "not_found"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("This session isn’t available", {}, T);
  },
});
Missing.name = "WCT2 · not available (404)";

const openCancel = async (canvasElement: HTMLElement) => {
  await within(canvasElement).findByRole("heading", { level: 1, name: "Technical boxing" }, T);
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Cancel session" }));
  return body().findByRole("alertdialog", { name: "Cancel this session?" }, T);
};

export const CancelConfirm = story({
  screen: "detail",
  play: async ({ canvasElement }) => {
    await openCancel(canvasElement);
  },
});
CancelConfirm.name = "WCT2 · cancel confirmation";

export const CancelPending = story({
  screen: "detail",
  extra: { [`POST ${SESSIONS}/ses-1/cancel`]: "pending" },
  play: async ({ canvasElement }) => {
    const dialog = await openCancel(canvasElement);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel session" }));
    await within(dialog).findByRole("button", { name: "Cancelling…" }, T);
  },
});
CancelPending.name = "WCT2 · cancelling";

export const CancelFailed = story({
  screen: "detail",
  extra: { [`POST ${SESSIONS}/ses-1/cancel`]: apiError(503, "service_unavailable") },
  play: async ({ canvasElement }) => {
    const dialog = await openCancel(canvasElement);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel session" }));
    await within(dialog).findByText(/Nothing changed/, {}, T);
  },
});
CancelFailed.name = "WCT2 · cancel failed";

/* ── WCT3 edit ──────────────────────────────────────────────────────── */

export const Edit = story({
  screen: "edit",
  play: async ({ canvasElement }) => {
    await expect(await formReady(canvasElement)).toHaveValue("Technical boxing");
  },
});
Edit.name = "WCT3 · edit";

export const EditConflict = story({
  screen: "edit",
  extra: { [`PATCH ${SESSIONS}/ses-1`]: apiError(409, "conflict") },
  play: async ({ canvasElement }) => {
    const title = await formReady(canvasElement);
    await userEvent.type(title, " (late)");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Save changes" }));
    await within(canvasElement).findByText("This session can’t be changed any more.", {}, T);
  },
});
EditConflict.name = "WCT3 · completed or cancelled meanwhile (409)";

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
UpcomingGerman.name = "WCT1 · German (longest labels)";

export const CreateGerman: StoryObj = {
  ...story({ screen: "create" }),
  decorators: [
    (Story) => (
      <German>
        <Story />
      </German>
    ),
  ],
};
CreateGerman.name = "WC3 · German (longest labels)";
