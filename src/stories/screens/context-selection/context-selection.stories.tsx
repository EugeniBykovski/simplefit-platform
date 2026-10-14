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
import { ContextSelection } from "@/widgets/context-selection";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

/*
 * WCX1 Choose where to continue (SF-54; Claude Design 1791982482-71e3
 * WebContextSelect): the production widget behind the session gate on a
 * deterministic stand-in of the SF-51 entry (`fetch` is replaced per story).
 */

const entry = (scenario: "completed" | "setup") => ({
  entry: {
    destination: "context_selection",
    reason: scenario === "completed" ? "context_choice_required" : "multiple_roles_in_progress",
    mandatory: false,
    intent: null,
    context: null,
    account_registration: "complete",
    fighter_profile: scenario === "completed" ? "completed" : "in_progress",
    coach_profile: scenario === "completed" ? "completed" : "in_progress",
    capabilities: scenario === "completed" ? ["FIGHTER", "COACH"] : [],
  },
});

function story(
  scenario: "completed" | "setup",
  choice: Answer = ok(undefined, 204),
  play?: StoryObj["play"],
): StoryObj {
  return {
    parameters: {
      nextjs: { appDirectory: true, navigation: { pathname: "/en/app/context" } },
    },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/entry": ok(entry(scenario)),
        "/api/v1/me/fighter-profile": ok({ fighter_profile: { display_name: "Alex N." } }),
        "/api/v1/me/coach-profile": ok({ coach_profile: { display_name: "Alex Novak" } }),
        "PUT /api/v1/me/entry/context": choice,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <ContextSelection />
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
  title: "Context Selection/Choose where to continue",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const heading = (canvasElement: HTMLElement, name: string) =>
  within(canvasElement).findByRole("heading", { level: 1, name }, { timeout: 5000 });

export const Completed = story("completed", undefined, async ({ canvasElement }) => {
  await heading(canvasElement, "Where do you want to go?");
});
Completed.name = "WCX1 · two completed contexts";

export const Setup = story("setup", undefined, async ({ canvasElement }) => {
  await heading(canvasElement, "Which setup do you want to continue?");
});
Setup.name = "WCX1 · two unfinished journeys (E11)";

export const Pending = story("completed", "pending", async ({ canvasElement }) => {
  await heading(canvasElement, "Where do you want to go?");
  await userEvent.click(within(canvasElement).getByRole("button", { name: /Coach/ }));
  await expect(await within(canvasElement).findByText("Opening…")).toBeVisible();
});
Pending.name = "WCX1 · opening";

export const Failed = story(
  "completed",
  apiError(503, "service_unavailable"),
  async ({ canvasElement }) => {
    await heading(canvasElement, "Where do you want to go?");
    await userEvent.click(within(canvasElement).getByRole("button", { name: /Coach/ }));
    await expect(await within(canvasElement).findByRole("alert")).toHaveTextContent(
      "We couldn’t open that.",
    );
  },
);
Failed.name = "WCX1 · failed (retry)";

export const Phone = {
  ...story("completed"),
  globals: { viewport: { value: "phone", isRotated: false } },
} satisfies StoryObj;
Phone.name = "WCX1 · phone 390";
