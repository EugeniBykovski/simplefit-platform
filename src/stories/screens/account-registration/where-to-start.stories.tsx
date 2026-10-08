import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";

import { OnboardingGate, RequireSession } from "@/features/session-gate";
import { signInRouteFor } from "@/shared/routes/routes";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import { RoleSelection } from "@/widgets/role-selection";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";

import deAccountRegistration from "../../../../messages/de/accountRegistration.json";
import deRoleSelection from "../../../../messages/de/roleSelection.json";

/*
 * WA6 Choose where to start (SF-47; Claude Design V78 WebRoleSelect): the
 * route's own composition (session gate, onboarding gate, widget) on a
 * deterministic stand-in of the SF-45 entry resolver (`fetch` is replaced per
 * story; nothing reaches a backend). The gate's resolution answers
 * `role_selection`; a choice's resolution answers what each story needs.
 * State stories reach their state with a play function, through the real
 * components.
 */

const entry = (destination: string, intent: string | null = null) =>
  ok({
    entry: {
      account_registration: "complete",
      capabilities: [],
      destination,
      fighter_profile: "not_started",
      intent,
      mandatory: destination === "fighter_onboarding",
      reason: "storybook",
    },
  });

const signedIn = { "/api/me": ok({ user: VIEWER }), "/api/auth/session/refresh": ok(SESSION) };

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

/** The German copy of WA6 over the English messages: the longest labels of the locales. */
function German({ children }: { children: ReactNode }) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider
      locale="de"
      timeZone="UTC"
      messages={{
        ...messages,
        roleSelection: deRoleSelection,
        accountRegistration: deAccountRegistration,
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

const withGerman: Decorator = (Story) => (
  <German>
    <Story />
  </German>
);

/** `choice`: the resolver's answers after the gate's own `role_selection`. */
function story(choice: Answer[] = [], play?: StoryObj["play"]): StoryObj {
  return {
    beforeEach: () =>
      installApi({ ...signedIn, "/api/v1/me/entry": [entry("role_selection"), ...choice] }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <OnboardingGate pending={<LaunchScreen />} failure={<EntryFailure />}>
          <RoleSelection />
        </OnboardingGate>
      </RequireSession>
    ),
    play,
  };
}

const meta = {
  title: "Account Registration/Where to start",
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/en/app/onboarding/role" } },
  },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const ready = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await canvas.findByRole("heading", { level: 1, name: "What would you like to set up first?" });
  return canvas;
};

const card = (canvasElement: HTMLElement, intent: string) => {
  const element = canvasElement.querySelector(`[data-journey=${intent}]`);
  if (!(element instanceof HTMLElement)) throw new Error(`no ${intent} card`);
  return element;
};

const choose = (intent: string, then?: (canvasElement: HTMLElement) => Promise<void>) =>
  (async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    await userEvent.click(card(canvasElement, intent));
    await expect(canvas.getByRole("radio", { checked: true })).toHaveAttribute("value", intent);
    await then?.(canvasElement);
  }) satisfies StoryObj["play"];

const proceed = async (canvasElement: HTMLElement) => {
  await userEvent.click(within(canvasElement).getByRole("button", { name: /setup|partner/ }));
};

/* ── Choice ─────────────────────────────────────────────────────────── */

export const Default = story();
Default.name = "Default · nothing picked";

export const FighterHovered = story([], async ({ canvasElement }) => {
  await ready(canvasElement);
  await userEvent.hover(card(canvasElement, "fighter"));
});
FighterHovered.name = "Fighter hovered";

export const FighterFocused = story([], async ({ canvasElement }) => {
  const canvas = await ready(canvasElement);
  canvas.getByRole("radio", { name: /^Fighter/ }).focus();
  await expect(canvas.getByRole("radio", { name: /^Fighter/ })).toHaveFocus();
});
FighterFocused.name = "Fighter focused";

export const FighterSelected = story([], choose("fighter"));
FighterSelected.name = "Fighter selected";

export const CoachSelected = story([], choose("coach"));
CoachSelected.name = "Coach selected";

export const GymSelected = story([], choose("gym"));
GymSelected.name = "Gym / Club selected";

export const SponsorSelected = story([], choose("sponsor"));
SponsorSelected.name = "Sponsor / Brand selected";

export const KeyboardInteraction = story([], async ({ canvasElement }) => {
  const canvas = await ready(canvasElement);
  canvas.getByRole("radio", { name: /^Fighter/ }).focus();
  await userEvent.keyboard("{ArrowRight}");
  await expect(canvas.getByRole("radio", { name: /^Coach/ })).toBeChecked();
  await userEvent.tab();
  await expect(canvas.getByRole("button", { name: "Start coach setup" })).toHaveFocus();
});
KeyboardInteraction.name = "Keyboard interaction";

/* ── Resolution ─────────────────────────────────────────────────────── */

export const Resolving = story(
  ["pending"],
  choose("fighter", async (canvasElement) => {
    await proceed(canvasElement);
    await expect(
      await within(canvasElement).findByRole("button", { name: "Opening…" }),
    ).toBeVisible();
  }),
);
Resolving.name = "Resolving destination";

export const ResolverError = story(
  [apiError(503, "service_unavailable")],
  choose("gym", async (canvasElement) => {
    await proceed(canvasElement);
    await expect(
      await within(canvasElement).findByText("We couldn’t open that setup."),
    ).toBeVisible();
  }),
);
ResolverError.name = "Resolver error";

export const Retry = story(
  [apiError(503, "service_unavailable"), "pending"],
  choose("coach", async (canvasElement) => {
    const canvas = within(canvasElement);
    await proceed(canvasElement);
    await userEvent.click(await canvas.findByRole("button", { name: "Retry" }));
    await expect(await canvas.findByRole("button", { name: "Opening…" })).toBeVisible();
  }),
);
Retry.name = "Retry";

export const UnexpectedDestination = story(
  [entry("coach_workspace", "coach")],
  choose("coach", async (canvasElement) => {
    await proceed(canvasElement);
    await expect(
      await within(canvasElement).findByText(
        "This version of SimpleFit can’t open it yet. Reload the page and try again.",
      ),
    ).toBeVisible();
  }),
);
UnexpectedDestination.name = "Unknown destination (newer API)";

/* ── Layout and copy ────────────────────────────────────────────────── */

export const Narrow: StoryObj = {
  ...story([], choose("sponsor")),
  globals: { viewport: { value: "phone", isRotated: false } },
};
Narrow.name = "Narrow viewport · 390";

export const LongerLabels: StoryObj = {
  ...story(),
  decorators: [withGerman],
};
LongerLabels.name = "Longer translated labels (de)";
