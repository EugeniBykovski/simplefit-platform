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
import { FighterHome } from "@/widgets/fighter-home";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";
import { WorkspaceShell } from "@/widgets/workspace-shell";

import deFighterHome from "../../../../messages/de/fighterHome.json";

/*
 * The Fighter web home and its first run (SF-40; Claude Design 34b FRW1 /
 * FRW2): the route's own composition (session gate, Fighter gate, Fighter
 * shell, widget) on a deterministic stand-in of the backend (`fetch` is
 * replaced per story; nothing reaches an API). The profile is an
 * illustrative Storybook fixture, not an account; the first-run record
 * answers what each story needs, and the tour's write answers per story.
 */

const PROFILE = {
  fighter_profile: {
    display_name: "Yauheni B.",
    username: "yauheni_b",
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
      completed_at: new Date().toISOString(),
      missing_requirements: [],
    },
  },
};
const tour = (status: string, recorded_at: string | null = null) => ({
  experience: "fighter_web_tour",
  status,
  recorded_at,
});
const recorded = (outcome: string) => ok({ experience: tour(outcome, new Date().toISOString()) });

function story({
  firstRun = ok({ experiences: [tour("pending")] }),
  record = recorded("completed"),
  play,
}: {
  firstRun?: Answer | Answer[];
  record?: Answer | Answer[];
  play?: StoryObj["play"];
} = {}): StoryObj {
  return {
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/entry": ok({
          entry: {
            account_registration: "complete",
            capabilities: ["FIGHTER"],
            destination: "fighter_home",
            fighter_profile: "completed",
            intent: null,
            mandatory: false,
            reason: "storybook",
          },
        }),
        "/api/v1/me/fighter-profile": ok(PROFILE),
        "/api/v1/me/first-run": firstRun,
        "PUT /api/v1/me/first-run/fighter_web_tour": record,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <FighterGate pending={<LaunchScreen />} failure={<EntryFailure />}>
          <WorkspaceShell shell="web.app.fighter">
            <FighterHome />
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

/** The German copy of the home over the English messages: the longest labels. */
function German({ children }: { children: ReactNode }) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider
      locale="de"
      timeZone="UTC"
      messages={{ ...messages, fighterHome: deFighterHome }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

const meta = {
  title: "Fighter Home/First run",
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/en/app/home" } },
  },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const welcome = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole(
    "heading",
    { level: 1, name: "Welcome to SimpleFit, Yauheni B." },
    { timeout: 5000 },
  );
/** The tour renders in a portal, outside the story's canvas. */
const page = () => within(document.body);
const openTour = async (canvasElement: HTMLElement) => {
  await welcome(canvasElement);
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Take the tour" }));
  return page().findByRole("dialog", { name: "Start here" });
};

/** Opens the tour and moves to step `n` (1–9) with Next. */
const toStep = async (canvasElement: HTMLElement, n: number) => {
  const dialog = await openTour(canvasElement);
  for (let at = 1; at < n; at++) {
    await userEvent.click(within(dialog).getByRole("button", { name: "Next" }));
  }
  await expect(within(dialog).getByText(`Tour · ${n} of 9`)).toBeVisible();
  return dialog;
};

/* ── FRW1 · first run ───────────────────────────────────────────────── */

export const FirstRun = story({
  play: async ({ canvasElement }) => {
    await welcome(canvasElement);
  },
});
FirstRun.name = "FRW1 · first run (eligible Fighter)";

export const Loading = story({ firstRun: "pending" });
Loading.name = "Loading";

export const Failure = story({
  firstRun: apiError(503, "service_unavailable"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("button", { name: "Try again" }, { timeout: 5000 });
  },
});
Failure.name = "Backend failure (recoverable)";

/* ── FRW2 · the nine steps ──────────────────────────────────────────── */

const STEP_NAMES = [
  "Home checklist",
  "Live Board",
  "Fight camp",
  "Progress",
  "Community · Discover · My profile",
  "Marketplace",
  "Calendar · Messages",
  "Privacy & settings",
  "Workspace identity",
];

const stepStory = (n: number) => {
  const step = story({
    play: async ({ canvasElement }) => {
      await toStep(canvasElement, n);
    },
  });
  step.name = `FRW2 · step ${n}/9 · ${STEP_NAMES[n - 1] ?? ""}`;
  return step;
};

export const Step1 = stepStory(1);
export const Step2 = stepStory(2);
export const Step3 = stepStory(3);
export const Step4 = stepStory(4);
export const Step5 = stepStory(5);
export const Step6 = stepStory(6);
export const Step7 = stepStory(7);
export const Step8 = stepStory(8);
export const Step9 = stepStory(9);

export const BackNext = story({
  play: async ({ canvasElement }) => {
    const dialog = await toStep(canvasElement, 3);
    await userEvent.click(within(dialog).getByRole("button", { name: "Back" }));
    await expect(within(dialog).getByText("Tour · 2 of 9")).toBeVisible();
  },
});
BackNext.name = "Back from step 3 to step 2";

export const TourSaving = story({
  record: "pending",
  play: async ({ canvasElement }) => {
    const dialog = await toStep(canvasElement, 9);
    await userEvent.click(within(dialog).getByRole("button", { name: "Finish" }));
    await expect(within(dialog).getByRole("button", { name: "Finish" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  },
});
TourSaving.name = "Finish · saving the outcome";

export const TourFailed = story({
  record: "offline",
  play: async ({ canvasElement }) => {
    const dialog = await toStep(canvasElement, 9);
    await userEvent.click(within(dialog).getByRole("button", { name: "Finish" }));
    await within(dialog).findByRole("alert");
  },
});
TourFailed.name = "Finish · the outcome could not be saved";

export const TourRetry = story({
  record: ["offline", recorded("completed")],
  play: async ({ canvasElement }) => {
    const dialog = await toStep(canvasElement, 9);
    await userEvent.click(within(dialog).getByRole("button", { name: "Finish" }));
    await within(dialog).findByRole("alert");
    await userEvent.click(within(dialog).getByRole("button", { name: "Finish" }));
    await page().findByRole("dialog", { name: "You know your way around" });
  },
});
TourRetry.name = "Finish · retry after a failure";

export const TourComplete = story({
  play: async ({ canvasElement }) => {
    const dialog = await toStep(canvasElement, 9);
    await userEvent.click(within(dialog).getByRole("button", { name: "Finish" }));
    await page().findByRole("dialog", { name: "You know your way around" });
  },
});
TourComplete.name = "FRW2 · tour complete";

export const TourCompleted = story({
  play: async ({ canvasElement }) => {
    const dialog = await toStep(canvasElement, 9);
    await userEvent.click(within(dialog).getByRole("button", { name: "Finish" }));
    const done = await page().findByRole("dialog", { name: "You know your way around" });
    await userEvent.click(within(done).getByRole("button", { name: "Back to my checklist" }));
    await within(canvasElement).findByRole("heading", { level: 1, name: /^Good / });
  },
});
TourCompleted.name = "FRW2 · complete → back to the home";

export const TourDismissed = story({
  record: recorded("dismissed"),
  play: async ({ canvasElement }) => {
    const dialog = await toStep(canvasElement, 4);
    await userEvent.click(within(dialog).getByRole("button", { name: "End tour" }));
    await within(canvasElement).findByRole("heading", { level: 1, name: /^Good / });
  },
});
TourDismissed.name = "End tour on step 4 → the home";

/* ── After the first run ────────────────────────────────────────────── */

export const Returning = story({
  firstRun: ok({ experiences: [tour("completed", "2026-10-03T18:00:00Z")] }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole(
      "heading",
      { level: 1, name: /^Good / },
      { timeout: 5000 },
    );
  },
});
Returning.name = "Returning Fighter (first run completed)";

export const ReturningDismissed = story({
  firstRun: ok({ experiences: [tour("dismissed", "2026-10-03T18:00:00Z")] }),
});
ReturningDismissed.name = "Returning Fighter (tour dismissed)";

/* ── Layout and copy ────────────────────────────────────────────────── */

export const Narrow: StoryObj = {
  ...story({
    play: async ({ canvasElement }) => {
      await toStep(canvasElement, 2);
    },
  }),
  globals: { viewport: { value: "phone", isRotated: false } },
};
Narrow.name = "Narrow viewport · 390 (step 2 centred: the sidebar is a menu)";

export const Replay = story({
  firstRun: ok({ experiences: [tour("completed", "2026-10-03T18:00:00Z")] }),
  record: apiError(500, "internal_error"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole(
      "heading",
      { level: 1, name: /^Good / },
      { timeout: 5000 },
    );
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Take the tour" }));
    const dialog = await page().findByRole("dialog", { name: "Start here" });
    await userEvent.click(within(dialog).getByRole("button", { name: "End tour" }));
  },
});
Replay.name = "Replay after the first run (records nothing)";

/** The step 2 target removed: the card is centred, never on an invented element. */
export const MissingTarget = story({
  play: async ({ canvasElement }) => {
    const dialog = await openTour(canvasElement);
    const target = canvasElement.querySelector("aside [data-nav-item=board]");
    if (target instanceof HTMLElement) target.style.display = "none";
    await userEvent.click(within(dialog).getByRole("button", { name: "Next" }));
    await expect(document.querySelector("[data-tour-spotlight]")).toBeNull();
  },
});
MissingTarget.name = "Missing target (centred card)";

export const LongerLabels: StoryObj = {
  ...story(),
  decorators: [
    (Story) => (
      <German>
        <Story />
      </German>
    ),
  ],
};
LongerLabels.name = "Longer translated labels (de)";
