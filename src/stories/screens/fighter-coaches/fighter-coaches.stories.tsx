import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import { FighterCoaches } from "@/widgets/fighter-coaches";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";
import { WorkspaceShell } from "@/widgets/workspace-shell";

/*
 * WFC1 My coaches (SF-60; Claude Design 1792151007-1d70): the route's own
 * composition (session gate, Fighter gate, Fighter shell, page) on a
 * deterministic stand-in of the SF-56 API. Names are Storybook fixtures.
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
const coach = (id: string, display: string, brand: string | null) => ({
  relationship_id: id,
  status: "active",
  started_at: "2026-09-01T10:00:00Z",
  ended_at: null,
  ended_by: null,
  disclosure_version: "storybook-disclosure",
  disclosed_fields: [
    "display_name",
    "username",
    "country_code",
    "city",
    "experience_level",
    "stance",
    "amateur_bout_count",
  ],
  coach: { display_name: display, brand_name: brand },
  coach_display_name_at_end: null,
});
const ACTIVE = [coach("rel-1", "Coach Marek", "Marek Boxing"), coach("rel-2", "Alex Novak", null)];
const ENDED = [
  {
    ...coach("rel-9", "x", null),
    status: "ended",
    ended_at: "2026-10-02T10:00:00Z",
    ended_by: "fighter",
    disclosed_fields: [],
    coach: null,
    coach_display_name_at_end: "Sam R.",
  },
];

function story({
  view = "active",
  list = ok({ relationships: ACTIVE, next_cursor: null }),
  end = ok(undefined, 204),
  play,
}: {
  view?: "active" | "ended";
  list?: Answer | Answer[];
  end?: Answer;
  play?: StoryObj["play"];
} = {}): StoryObj {
  return {
    parameters: { nextjs: { appDirectory: true, navigation: { pathname: "/en/app/coaches" } } },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/entry": ok(ENTRY),
        "/api/v1/me/fighter-profile": ok({ fighter_profile: FIGHTER }),
        "/api/v1/me/first-run": ok({
          experiences: [{ experience: "fighter_web_tour", status: "completed", recorded_at: null }],
        }),
        "/api/v1/me/coaches": list,
        "POST /api/v1/me/coaches/rel-1/end": end,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <FighterGate pending={<LaunchScreen />} failure={<EntryFailure />}>
          <WorkspaceShell shell="web.app.fighter">
            <FighterCoaches view={view} />
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

const meta = {
  title: "Fighter Coaches/My coaches",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const T = { timeout: 5000 };
const expand = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await canvas.findByText("Coach Marek", {}, T);
  await userEvent.click(canvas.getAllByRole("button", { name: "What they see" })[0]!);
};
const endFirst = async (canvasElement: HTMLElement) => {
  await expand(canvasElement);
  await userEvent.click(within(canvasElement).getByRole("button", { name: "End relationship" }));
  return within(document.body).findByRole("alertdialog", {}, T);
};

export const Multiple = story({
  play: async ({ canvasElement }) =>
    void (await within(canvasElement).findByText("Alex Novak", {}, T)),
});
Multiple.name = "WFC1 · several coaches";

export const One = story({ list: ok({ relationships: ACTIVE.slice(0, 1), next_cursor: null }) });
One.name = "WFC1 · one coach";

export const Expanded = story({ play: async ({ canvasElement }) => expand(canvasElement) });
Expanded.name = "WFC1 · what a coach sees";

export const Ended = story({
  view: "ended",
  list: ok({ relationships: ENDED, next_cursor: null }),
  play: async ({ canvasElement }) => void (await within(canvasElement).findByText("Sam R.", {}, T)),
});
Ended.name = "WFC1 · ended relationships";

export const Paginated = story({
  list: [
    ok({ relationships: ACTIVE.slice(0, 1), next_cursor: "c2" }),
    ok({ relationships: ACTIVE.slice(1), next_cursor: null }),
  ],
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Show more" }, T),
    );
    await within(canvasElement).findByText("Alex Novak", {}, T);
  },
});
Paginated.name = "WFC1 · show more (cursor)";

export const Loading = story({ list: "pending" });
Loading.name = "WFC1 · loading";

export const Empty = story({
  list: ok({ relationships: [], next_cursor: null }),
  play: async ({ canvasElement }) =>
    void (await within(canvasElement).findByText("No coaches yet", {}, T)),
});
Empty.name = "WFC1 · empty";

export const Failure = story({
  list: apiError(503, "service_unavailable"),
  play: async ({ canvasElement }) =>
    void (await within(canvasElement).findByText("We couldn’t load your coaches.", {}, T)),
});
Failure.name = "WFC1 · backend failure (recoverable)";

export const EndConfirm = story({
  play: async ({ canvasElement }) => void (await endFirst(canvasElement)),
});
EndConfirm.name = "WFC1 · end confirmation";

export const EndPending = story({
  end: "pending",
  play: async ({ canvasElement }) => {
    const dialog = await endFirst(canvasElement);
    await userEvent.click(within(dialog).getByRole("button", { name: "End relationship" }));
    await expect(await within(dialog).findByRole("button", { name: "Ending…" }, T)).toBeDisabled();
  },
});
EndPending.name = "WFC1 · ending";

export const EndFailed = story({
  end: apiError(503, "service_unavailable"),
  play: async ({ canvasElement }) => {
    const dialog = await endFirst(canvasElement);
    await userEvent.click(within(dialog).getByRole("button", { name: "End relationship" }));
    await within(dialog).findByText(/Nothing changed/, {}, T);
  },
});
EndFailed.name = "WFC1 · end failed";

export const EndSucceeded = story({
  list: [
    ok({ relationships: ACTIVE, next_cursor: null }),
    ok({ relationships: ACTIVE.slice(1), next_cursor: null }),
  ],
  play: async ({ canvasElement }) => {
    const dialog = await endFirst(canvasElement);
    await userEvent.click(within(dialog).getByRole("button", { name: "End relationship" }));
    await within(document.body).findByText("Coach Marek no longer sees your profile.", {}, T);
  },
});
EndSucceeded.name = "WFC1 · ended (204)";
