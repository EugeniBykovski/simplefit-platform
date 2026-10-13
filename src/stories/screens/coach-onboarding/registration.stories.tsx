import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, userEvent, within } from "storybook/test";

import { apiError, installApi, ok, SESSION, VIEWER } from "@/stories/support/auth-story-api";
import { CoachOnboarding } from "@/widgets/coach-onboarding";

/*
 * Coach web registration (SF-52; Claude Design COACH 5d, 1791896379-65b7):
 * the production widget on a deterministic stand-in of the SF-50 / SF-51 API
 * (`fetch` is replaced per story, nothing reaches a backend). The step comes
 * from `?step=`, as on the route; state stories reach their state with a
 * play function, through the real components. Sample values are fixtures of
 * the stand-in API only.
 */

const PROFILE = {
  display_name: "Coach Alex",
  brand_name: "Alex Boxing",
  country_code: "PL",
  city: "Warsaw",
  bio: "Footwork-first boxing. Ten-week camps for amateurs.",
  languages: ["pl", "en"],
};
const TYPE = {
  coaching_formats: ["personal_training", "fight_camps"],
  competition_levels: ["amateur"],
};
const EMPTY = {
  display_name: null,
  brand_name: null,
  country_code: null,
  city: null,
  bio: null,
  languages: [],
  coaching_formats: [],
  competition_levels: [],
};
const REQUIRED = ["display_name", "country_code", "city", "coaching_formats"];

function coach(fields: Record<string, unknown>, status = "in_progress") {
  const all = { ...EMPTY, ...fields } as Record<string, unknown>;
  const missing = REQUIRED.filter((field) => {
    const value = all[field];
    return value === null || (Array.isArray(value) && value.length === 0);
  });
  return {
    coach_profile: {
      ...all,
      onboarding: {
        status,
        completed_at: status === "completed" ? "2026-10-13T12:00:00Z" : null,
        missing_requirements: status === "completed" ? [] : missing,
      },
    },
  };
}

const account = (full_name: string | null) => ({
  account_profile: {
    registration: {
      status: "complete",
      completed_at: "2026-10-13T10:00:00Z",
      missing_requirements: [],
    },
    full_name,
    date_of_birth: "1994-05-01",
    consents: {},
    product_news: { subscribed: false, updated_at: null },
  },
});

const validation = (field_codes: Record<string, string[]>) => ({
  status: 422,
  body: {
    error: { code: "validation_error", message: "storybook", details: { fields: {}, field_codes } },
  },
});

const signedIn = { "/api/me": ok({ user: VIEWER }), "/api/auth/session/refresh": ok(SESSION) };

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

function story(
  step: "profile" | "type",
  routes: Parameters<typeof installApi>[0],
  play?: StoryObj["play"],
): StoryObj {
  return {
    parameters: {
      nextjs: {
        appDirectory: true,
        navigation: { pathname: "/en/app/onboarding/coach", query: { step } },
      },
    },
    beforeEach: () => installApi({ ...signedIn, ...routes }),
    render: () => <CoachOnboarding />,
    play,
  };
}

const meta = {
  title: "Coach Onboarding/Registration",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const heading = (canvasElement: HTMLElement, name: string) =>
  within(canvasElement).findByRole("heading", { level: 1, name });

/* ── WCR1 · Coach profile ───────────────────────────────────────────── */

export const ProfileEmpty = story("profile", {
  "GET /api/v1/me/coach-profile": ok(coach({}, "not_started")),
  "GET /api/v1/me/account-profile": ok(account("Alex Kowalski")),
});
ProfileEmpty.name = "WCR1 · empty (account-name suggestion)";

export const ProfileResumed = story("profile", {
  "GET /api/v1/me/coach-profile": ok(coach(PROFILE)),
});
ProfileResumed.name = "WCR1 · resumed";

export const ProfileInvalid = story(
  "profile",
  {
    "GET /api/v1/me/coach-profile": ok(coach({ ...PROFILE, display_name: null, city: null })),
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "Your coach profile");
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(await canvas.findByText("Check the highlighted fields.")).toBeVisible();
    await expect(canvas.getByText("Enter your coach name.")).toBeVisible();
    await expect(canvas.getByText("Enter your city.")).toBeVisible();
  },
);
ProfileInvalid.name = "WCR1 · invalid";

export const ProfileSaving = story(
  "profile",
  {
    "GET /api/v1/me/coach-profile": ok(coach(PROFILE)),
    "PATCH /api/v1/me/coach-profile": "pending",
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "Your coach profile");
    await userEvent.type(within(canvasElement).getByLabelText("City"), " Centre");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Continue" }));
    await expect(
      await within(canvasElement).findByRole("button", { name: "Saving…" }),
    ).toBeDisabled();
  },
);
ProfileSaving.name = "WCR1 · saving";

export const ProfileFailure = story(
  "profile",
  {
    "GET /api/v1/me/coach-profile": ok(coach(PROFILE)),
    "PATCH /api/v1/me/coach-profile": apiError(503, "service_unavailable"),
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "Your coach profile");
    await userEvent.type(within(canvasElement).getByLabelText("City"), " Centre");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Continue" }));
    await expect(
      await within(canvasElement).findByText("We couldn’t save your changes."),
    ).toBeVisible();
  },
);
ProfileFailure.name = "WCR1 · save failed";

/* ── WCR2 · Coaching type ───────────────────────────────────────────── */

export const TypeEmpty = story("type", {
  "GET /api/v1/me/coach-profile": ok(coach(PROFILE)),
});
TypeEmpty.name = "WCR2 · empty";

export const TypeResumed = story("type", {
  "GET /api/v1/me/coach-profile": ok(coach({ ...PROFILE, ...TYPE })),
});
TypeResumed.name = "WCR2 · resumed";

export const TypeInvalid = story(
  "type",
  { "GET /api/v1/me/coach-profile": ok(coach(PROFILE)) },
  async ({ canvasElement }) => {
    await heading(canvasElement, "How do you coach?");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Finish" }));
    await expect(await within(canvasElement).findByText("Pick at least one format.")).toBeVisible();
  },
);
TypeInvalid.name = "WCR2 · invalid";

export const TypeIncomplete = story(
  "type",
  {
    "GET /api/v1/me/coach-profile": ok(coach({ ...PROFILE, city: null, ...TYPE })),
    "POST /api/v1/me/coach-profile/complete-onboarding": validation({ city: ["required"] }),
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "How do you coach?");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Finish" }));
    await expect(
      await within(canvasElement).findByText("Your coach profile is missing details."),
    ).toBeVisible();
    await expect(within(canvasElement).getByText("Add your city to finish.")).toBeVisible();
  },
);
TypeIncomplete.name = "WCR2 · incomplete";

export const TypeFinishing = story(
  "type",
  {
    "GET /api/v1/me/coach-profile": ok(coach({ ...PROFILE, ...TYPE })),
    "POST /api/v1/me/coach-profile/complete-onboarding": "pending",
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "How do you coach?");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Finish" }));
    await expect(
      await within(canvasElement).findByRole("button", { name: "Finishing…" }),
    ).toBeDisabled();
  },
);
TypeFinishing.name = "WCR2 · finishing";

export const TypeFailure = story(
  "type",
  {
    "GET /api/v1/me/coach-profile": ok(coach({ ...PROFILE, ...TYPE })),
    "POST /api/v1/me/coach-profile/complete-onboarding": apiError(503, "service_unavailable"),
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "How do you coach?");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Finish" }));
    await expect(
      await within(canvasElement).findByText("We couldn’t finish your coach sign-up."),
    ).toBeVisible();
  },
);
TypeFailure.name = "WCR2 · backend failure";

/* ── WCR7 · Complete ────────────────────────────────────────────────── */

const completedRoutes = {
  "GET /api/v1/me/coach-profile": ok(coach({ ...PROFILE, ...TYPE })),
  "POST /api/v1/me/coach-profile/complete-onboarding": ok(
    coach({ ...PROFILE, ...TYPE }, "completed"),
  ),
};

export const Completed = story("type", completedRoutes, async ({ canvasElement }) => {
  await heading(canvasElement, "How do you coach?");
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Finish" }));
  await heading(canvasElement, "Your coach profile is ready.");
  await expect(within(canvasElement).getByText("Coach tools are not available yet.")).toBeVisible();
});
Completed.name = "WCR7 · ready (after Finish)";

export const CompletedOpening = story(
  "type",
  { ...completedRoutes, "PUT /api/v1/me/entry/context": "pending" },
  async ({ canvasElement }) => {
    await heading(canvasElement, "How do you coach?");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Finish" }));
    await heading(canvasElement, "Your coach profile is ready.");
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Continue to coach home" }),
    );
    await expect(
      await within(canvasElement).findByRole("button", { name: "Opening…" }),
    ).toBeDisabled();
  },
);
CompletedOpening.name = "WCR7 · opening";

export const CompletedOpenFailure = story(
  "type",
  { ...completedRoutes, "PUT /api/v1/me/entry/context": apiError(503, "service_unavailable") },
  async ({ canvasElement }) => {
    await heading(canvasElement, "How do you coach?");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Finish" }));
    await heading(canvasElement, "Your coach profile is ready.");
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Continue to coach home" }),
    );
    await expect(
      await within(canvasElement).findByText("We couldn’t open your coach home."),
    ).toBeVisible();
  },
);
CompletedOpenFailure.name = "WCR7 · failure";

/* ── Loading and failure ────────────────────────────────────────────── */

export const Loading = story("profile", { "GET /api/v1/me/coach-profile": "pending" });
Loading.name = "Loading the profile";

export const LoadFailure = story("profile", {
  "GET /api/v1/me/coach-profile": apiError(500, "internal_error"),
});
LoadFailure.name = "Profile could not load";
