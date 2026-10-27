import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";

import { CoachGate, FighterGate, RequireSession } from "@/features/session-gate";
import { signInRouteFor } from "@/shared/routes/routes";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import { CoachHome } from "@/widgets/coach-home";
import { FighterHome } from "@/widgets/fighter-home";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";
import { WorkspaceShell } from "@/widgets/workspace-shell";

import deCoachHome from "../../../../messages/de/coachHome.json";
import deContextSwitcher from "../../../../messages/de/contextSwitcher.json";
import deShells from "../../../../messages/de/shells.json";

/*
 * The Coach web workspace (SF-54; Claude Design 1791982482-71e3: WC1,
 * CoachWebNav, ContextSwitcher): the route's own composition (session gate,
 * Coach gate, Coach shell, dashboard) on a deterministic stand-in of the
 * backend (`fetch` is replaced per story; nothing reaches an API). Names are
 * Storybook fixtures, not accounts.
 */

const COACH = {
  display_name: "Alex Novak",
  brand_name: "Novak Boxing",
  country_code: "PL",
  city: "Warsaw",
  bio: "Footwork-first boxing. Ten-week camps for amateurs.",
  languages: ["en", "pl"],
  coaching_formats: ["personal_training", "fight_camps"],
  competition_levels: ["amateur"],
  onboarding: {
    status: "completed",
    completed_at: "2026-10-14T10:00:00Z",
    missing_requirements: [],
  },
};
const FIGHTER = {
  display_name: "Alex N.",
  username: "alex_n",
  country_code: "PL",
  city: "Warsaw",
  experience_level: "amateur",
  stance: "orthodox",
  amateur_bout_count: null,
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

type Profiles = "both" | "coach" | "fighter";
const entryFor = (profiles: Profiles, destination = "coach_home") => ({
  entry: {
    destination,
    reason: "storybook",
    mandatory: false,
    intent: null,
    context: profiles === "fighter" ? "fighter" : "coach",
    account_registration: "complete",
    fighter_profile: profiles === "coach" ? "not_started" : "completed",
    coach_profile: profiles === "fighter" ? "in_progress" : "completed",
    gym_id: null,
    gym_workspaces: [],
    gym_workspace_count: 0,
    capabilities:
      profiles === "both" ? ["FIGHTER", "COACH"] : profiles === "coach" ? ["COACH"] : ["FIGHTER"],
  },
});

function story({
  profiles = "both",
  coach = ok({ coach_profile: COACH }),
  choice = ok(undefined, 204),
  me = ok({ user: VIEWER }),
  shell = "coach",
  play,
}: {
  profiles?: Profiles;
  coach?: Answer | Answer[];
  choice?: Answer | Answer[];
  me?: Answer;
  shell?: "coach" | "fighter";
  play?: StoryObj["play"];
} = {}): StoryObj {
  return {
    parameters: {
      nextjs: {
        appDirectory: true,
        navigation: { pathname: shell === "coach" ? "/en/app/coach" : "/en/app/home" },
      },
    },
    beforeEach: () =>
      installApi({
        "/api/me": me,
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/entry": ok(
          entryFor(profiles, shell === "coach" ? "coach_home" : "fighter_home"),
        ),
        "/api/v1/me/coach-profile": coach,
        "/api/v1/me/fighter-profile": ok({ fighter_profile: FIGHTER }),
        "/api/v1/me/first-run": ok({
          experiences: [{ experience: "fighter_web_tour", status: "completed", recorded_at: null }],
        }),
        "PUT /api/v1/me/entry/context": choice,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        {shell === "coach" ? (
          <CoachGate pending={<LaunchScreen />} failure={<EntryFailure />}>
            <WorkspaceShell shell="web.app.coach">
              <CoachHome />
            </WorkspaceShell>
          </CoachGate>
        ) : (
          <FighterGate pending={<LaunchScreen />} failure={<EntryFailure />}>
            <WorkspaceShell shell="web.app.fighter">
              <FighterHome />
            </WorkspaceShell>
          </FighterGate>
        )}
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

/** German copy of the workspace over the English messages: the longest labels. */
function German({ children }: { children: ReactNode }) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider
      locale="de"
      timeZone="UTC"
      messages={{
        ...messages,
        coachHome: deCoachHome,
        contextSwitcher: deContextSwitcher,
        shells: deShells,
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

const meta = {
  title: "Coach Home/Dashboard",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const ready = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole(
    "heading",
    { level: 1, name: "Welcome, Alex Novak" },
    { timeout: 5000 },
  );
/** The switcher menu renders in a portal, outside the story's canvas. */
const openSwitcher = async (canvasElement: HTMLElement, name = /Alex Novak, Coach/) => {
  const trigger = await within(canvasElement).findAllByRole("button", { name }, { timeout: 5000 });
  const first = trigger[0];
  if (!first) throw new Error("no switcher");
  await userEvent.click(first);
  return within(document.body).findByRole("menu");
};

/* ── WC1 ────────────────────────────────────────────────────────────── */

export const Dashboard = story({
  play: async ({ canvasElement }) => void (await ready(canvasElement)),
});
Dashboard.name = "WC1 · real profile (Fighter + Coach)";

export const CoachOnly = story({
  profiles: "coach",
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    const menu = await openSwitcher(canvasElement);
    await expect(within(menu).getByText("Set up a fighter profile")).toBeVisible();
  },
});
CoachOnly.name = "Coach only · switcher offers fighter setup";

export const Loading = story({ coach: "pending" });
Loading.name = "Loading";

export const Failure = story({
  coach: apiError(503, "service_unavailable"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("button", { name: "Try again" }, { timeout: 5000 });
  },
});
Failure.name = "Backend failure (recoverable)";

/* ── Context switcher ───────────────────────────────────────────────── */

export const SwitcherOpen = story({
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    const menu = await openSwitcher(canvasElement);
    await expect(within(menu).getByRole("menuitemradio", { name: /Coach/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  },
});
SwitcherOpen.name = "Switcher · open (both completed)";

export const SwitchPending = story({
  choice: "pending",
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    const menu = await openSwitcher(canvasElement);
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: /Fighter/ }));
    await expect(await within(menu).findByRole("status", { name: "Opening…" })).toBeVisible();
  },
});
SwitchPending.name = "Switcher · switching";

export const SwitchFailed = story({
  choice: apiError(503, "service_unavailable"),
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    const menu = await openSwitcher(canvasElement);
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: /Fighter/ }));
    await expect(await within(menu).findByRole("alert")).toHaveTextContent("We couldn’t switch.");
  },
});
SwitchFailed.name = "Switcher · switch failed";

export const FighterOnly = story({
  profiles: "fighter",
  shell: "fighter",
  play: async ({ canvasElement }) => {
    const menu = await openSwitcher(canvasElement, /Alex N\., Fighter/);
    await expect(within(menu).getByText("Continue coach setup")).toBeVisible();
    await expect(within(menu).queryByRole("menuitemradio", { name: /Coach/ })).toBeNull();
  },
});
FighterOnly.name = "Fighter shell · Fighter only (coach setup in progress)";

/* ── Access and session ─────────────────────────────────────────────── */

export const Unauthorized = story({ profiles: "fighter" });
Unauthorized.name = "No COACH · the gate sends the user away (pending)";

export const SessionExpired = story({ me: apiError(401, "unauthorized") });
SessionExpired.name = "Session expired · back to sign-in (pending)";

/* ── Responsive and localization ────────────────────────────────────── */

export const Phone = {
  ...story(),
  globals: { viewport: { value: "phone", isRotated: false } },
} satisfies StoryObj;
Phone.name = "Phone · 390 (sheet navigation)";

export const LongGerman = {
  ...story(),
  decorators: [
    (Story: () => ReactNode) => (
      <German>
        <Story />
      </German>
    ),
  ],
  globals: { viewport: { value: "laptop", isRotated: false } },
} satisfies StoryObj;
LongGerman.name = "German · laptop 1280 (long labels)";
