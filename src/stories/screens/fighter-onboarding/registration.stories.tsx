import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, userEvent, within } from "storybook/test";

import { apiError, installApi, ok, SESSION, VIEWER } from "@/stories/support/auth-story-api";
import { FighterOnboarding } from "@/widgets/fighter-onboarding";

/*
 * Fighter web registration (SF-38; Claude Design FIGHTER 5c, V78): the
 * production widget on a deterministic stand-in of the SF-25 API (`fetch` is
 * replaced per story, nothing reaches a backend). The step comes from
 * `?step=`, as on the route; state stories reach their state with a play
 * function, through the real components.
 */

const BASICS = { display_name: "Alex K.", username: "alex_k", country_code: "PL", city: "Warsaw" };
const BOXING = {
  experience_level: "competitive_amateur",
  stance: "orthodox",
  amateur_bout_count: 14,
  goals: ["improve_technique", "competition"],
  weight_class: "minus_75",
  current_weight_kg: 73.8,
  height_cm: 178,
  next_fight_on: "2026-11-03",
  next_fight_name: "Warsaw Cup",
};
const EMPTY = {
  display_name: null,
  username: null,
  country_code: null,
  city: null,
  experience_level: null,
  stance: null,
  amateur_bout_count: null,
  goals: [],
  weight_class: null,
  current_weight_kg: null,
  height_cm: null,
  next_fight_on: null,
  next_fight_name: null,
};
const REQUIRED = ["display_name", "username", "country_code", "city", "experience_level", "stance"];

function profile(fields: Record<string, unknown>, status = "in_progress") {
  const all = { ...EMPTY, ...fields } as Record<string, unknown>;
  return {
    fighter_profile: {
      ...all,
      onboarding: {
        status,
        completed_at: status === "completed" ? "2026-10-08T12:00:00Z" : null,
        missing_requirements: REQUIRED.filter((field) => all[field] === null),
      },
    },
  };
}

const validation = (field_codes: Record<string, string[]>) => ({
  status: 422,
  body: {
    error: {
      code: "validation_error",
      message: "storybook",
      details: { fields: {}, field_codes },
    },
  },
});

const signedIn = { "/api/me": ok({ user: VIEWER }), "/api/auth/session/refresh": ok(SESSION) };

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

function story(
  step: "basics" | "profile",
  routes: Parameters<typeof installApi>[0],
  play?: StoryObj["play"],
): StoryObj {
  return {
    parameters: {
      nextjs: {
        appDirectory: true,
        navigation: { pathname: "/en/app/onboarding/fighter", query: { step } },
      },
    },
    beforeEach: () => installApi({ ...signedIn, ...routes }),
    render: () => <FighterOnboarding />,
    play,
  };
}

const meta = {
  title: "Fighter Onboarding/Registration",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const heading = (canvasElement: HTMLElement, name: string) =>
  within(canvasElement).findByRole("heading", { level: 1, name });

/* ── WF0 · Profile basics ───────────────────────────────────────────── */

export const BasicsEmpty = story("basics", {
  "GET /api/v1/me/fighter-profile": ok(profile({}, "not_started")),
});
BasicsEmpty.name = "WF0 · empty";

export const BasicsResumed = story("basics", {
  "GET /api/v1/me/fighter-profile": ok(profile(BASICS)),
});
BasicsResumed.name = "WF0 · resumed";

export const BasicsInvalid = story(
  "basics",
  { "GET /api/v1/me/fighter-profile": ok(profile({ display_name: "Alex K." })) },
  async ({ canvasElement }) => {
    await heading(canvasElement, "Your fighter profile");
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("textbox", { name: "Username" }), "_alex");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(await canvas.findByText("Check the highlighted fields.")).toBeVisible();
    await expect(canvas.getByText("Enter your city.")).toBeVisible();
  },
);
BasicsInvalid.name = "WF0 · field validation";

export const BasicsConflict = story(
  "basics",
  {
    "GET /api/v1/me/fighter-profile": ok(profile({ ...BASICS, username: "alex" })),
    "PATCH /api/v1/me/fighter-profile": validation({ username: ["already_exists"] }),
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "Your fighter profile");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Continue" }));
    await expect(
      await within(canvasElement).findByText("That username is taken. Try another."),
    ).toBeVisible();
  },
);
BasicsConflict.name = "WF0 · username taken";

export const BasicsSaving = story(
  "basics",
  {
    "GET /api/v1/me/fighter-profile": ok(profile(BASICS)),
    "PATCH /api/v1/me/fighter-profile": "pending",
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "Your fighter profile");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Continue" }));
    await expect(
      await within(canvasElement).findByRole("button", { name: "Saving…" }),
    ).toBeDisabled();
  },
);
BasicsSaving.name = "WF0 · saving";

export const BasicsFailure = story(
  "basics",
  {
    "GET /api/v1/me/fighter-profile": ok(profile(BASICS)),
    "PATCH /api/v1/me/fighter-profile": apiError(500, "internal_error"),
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "Your fighter profile");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Continue" }));
    await expect(
      await within(canvasElement).findByText("We couldn’t save your changes."),
    ).toBeVisible();
  },
);
BasicsFailure.name = "WF0 · save failed";

/* ── WF1 · Boxing profile ───────────────────────────────────────────── */

export const ProfileEmpty = story("profile", {
  "GET /api/v1/me/fighter-profile": ok(profile(BASICS)),
});
ProfileEmpty.name = "WF1 · empty";

export const ProfileResumed = story("profile", {
  "GET /api/v1/me/fighter-profile": ok(profile({ ...BASICS, ...BOXING })),
});
ProfileResumed.name = "WF1 · resumed";

export const ProfileOptionalOnly = story("profile", {
  "GET /api/v1/me/fighter-profile": ok(
    profile({ ...BASICS, experience_level: "new_to_boxing", stance: "switch" }),
  ),
});
ProfileOptionalOnly.name = "WF1 · requirements only (optional fields empty)";

export const ProfilePrecision = story(
  "profile",
  {
    "GET /api/v1/me/fighter-profile": ok(profile({ ...BASICS, ...BOXING })),
    "PATCH /api/v1/me/fighter-profile": validation({ current_weight_kg: ["invalid_format"] }),
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "Your boxing profile");
    const canvas = within(canvasElement);
    const weight = canvas.getByLabelText("Current weight · optional");
    await userEvent.clear(weight);
    await userEvent.type(weight, "73.85");
    await userEvent.click(canvas.getByRole("button", { name: "Finish" }));
    await expect(
      await canvas.findByText("Use at most one decimal place, like 73.8."),
    ).toBeVisible();
  },
);
ProfilePrecision.name = "WF1 · weight precision";

export const ProfileBlocked = story(
  "profile",
  {
    "GET /api/v1/me/fighter-profile": ok(
      profile({ ...BASICS, city: null, ...BOXING, stance: null }),
    ),
    "PATCH /api/v1/me/fighter-profile": ok(
      profile({ ...BASICS, city: null, ...BOXING, stance: null }),
    ),
    "POST /api/v1/me/fighter-profile/complete-onboarding": validation({
      city: ["required"],
      stance: ["required"],
    }),
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "Your boxing profile");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Finish" }));
    await expect(
      await within(canvasElement).findByText("A few details are still missing."),
    ).toBeVisible();
  },
);
ProfileBlocked.name = "WF1 · completion blocked";

export const ProfileFinishing = story(
  "profile",
  {
    "GET /api/v1/me/fighter-profile": ok(profile({ ...BASICS, ...BOXING })),
    "PATCH /api/v1/me/fighter-profile": ok(profile({ ...BASICS, ...BOXING })),
    "POST /api/v1/me/fighter-profile/complete-onboarding": "pending",
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "Your boxing profile");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Finish" }));
    await expect(
      await within(canvasElement).findByRole("button", { name: "Finishing…" }),
    ).toBeDisabled();
  },
);
ProfileFinishing.name = "WF1 · finishing";

export const ProfileFailure = story(
  "profile",
  {
    "GET /api/v1/me/fighter-profile": ok(profile({ ...BASICS, ...BOXING })),
    "PATCH /api/v1/me/fighter-profile": apiError(503, "service_unavailable"),
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "Your boxing profile");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Finish" }));
    await expect(
      await within(canvasElement).findByText("We couldn’t save your changes."),
    ).toBeVisible();
  },
);
ProfileFailure.name = "WF1 · backend failure";

/* ── WF6 · Complete ─────────────────────────────────────────────────── */

export const Completed = story(
  "profile",
  {
    "GET /api/v1/me/fighter-profile": ok(profile({ ...BASICS, ...BOXING })),
    "PATCH /api/v1/me/fighter-profile": ok(profile({ ...BASICS, ...BOXING })),
    "POST /api/v1/me/fighter-profile/complete-onboarding": ok(
      profile({ ...BASICS, ...BOXING }, "completed"),
    ),
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "Your boxing profile");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Finish" }));
    await heading(canvasElement, "You’re in, Alex.");
    await expect(
      within(canvasElement).getByRole("link", { name: "Go to my home" }),
    ).toHaveAttribute("href", "/en/app");
  },
);
Completed.name = "WF6 · completed (after Finish)";

/* ── Loading and failure ────────────────────────────────────────────── */

export const Loading = story("basics", { "GET /api/v1/me/fighter-profile": "pending" });
Loading.name = "Loading the profile";

export const LoadFailure = story("basics", {
  "GET /api/v1/me/fighter-profile": apiError(500, "internal_error"),
});
LoadFailure.name = "Profile could not load";
