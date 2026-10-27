import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";

import { apiError, installApi, ok, SESSION, VIEWER } from "@/stories/support/auth-story-api";
import { GymOnboarding } from "@/widgets/gym-onboarding";

import deGymOnboarding from "../../../../messages/de/gymOnboarding.json";

/*
 * Gym owner web registration (SF-86; Claude Design GYM 5e, 1792675284-1046,
 * with the approved SF-86 differences): the production widget on a
 * deterministic stand-in of the SF-83 / SF-84 / SF-85 API (`fetch` is
 * replaced per story, nothing reaches a backend). The step comes from
 * `?step=`, as on the route; state stories reach their state with a play
 * function, through the real components. Sample values are fixtures of the
 * stand-in API only.
 */

const GYM_ID = "5f0c3d0e-4a1b-4c2d-9e8f-0a1b2c3d4e5f";
const LOCATION = {
  id: "c1d2e3f4-0000-4000-8000-000000000001",
  name: "Warsaw",
  country_code: "PL",
  city: "Warsaw",
  address_line: "ul. Ząbkowska 31, 03-736",
  entrance_note: "Entrance from the courtyard, 1st floor",
  is_primary: true,
};

function gymSetup(fields: Record<string, unknown> = {}, status = "draft") {
  const all = {
    gym_id: GYM_ID,
    name: "Simple Boxing Gym",
    gym_type: "boxing_gym",
    phone: "+48 22 000 00 00",
    website: "https://simpleboxing.pl",
    tagline: null,
    accent_color: null,
    primary_location: null,
    revision: 4,
    viewer: {
      role: "owner",
      permissions: ["gym.settings.manage"],
      staff_membership_id: "7a1b2c3d-0000-4000-8000-000000000002",
    },
    ...fields,
  } as Record<string, unknown>;
  const missing = status === "completed" || all.primary_location ? [] : ["primary_location"];
  return { setup: { ...all, setup_status: status, missing_requirements: missing } };
}

const summary = (status = "draft") => ({
  id: GYM_ID,
  name: "Simple Boxing Gym",
  gym_type: "boxing_gym",
  setup_status: status,
  inserted_at: "2026-10-27T08:00:00Z",
  updated_at: "2026-10-27T08:00:00Z",
  viewer: {
    role: "owner",
    permissions: [],
    staff_membership_id: "7a1b2c3d-0000-4000-8000-000000000002",
  },
});

const conflict = (details: Record<string, unknown>) => ({
  status: 409,
  body: { error: { code: "conflict", message: "storybook", details } },
});

const noGyms = { "GET /api/v1/me/gyms": ok({ gyms: [], next_cursor: null }) };
const withDraft = { "GET /api/v1/me/gyms": ok({ gyms: [summary()], next_cursor: null }) };
const signedIn = { "/api/me": ok({ user: VIEWER }), "/api/auth/session/refresh": ok(SESSION) };
const setupPath = `/api/v1/gyms/${GYM_ID}/setup`;

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

function German({ children }: { children: ReactNode }) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider
      locale="de"
      timeZone="UTC"
      messages={{ ...messages, gymOnboarding: deGymOnboarding }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

function story(
  step: "type" | "location" | "branding",
  routes: Parameters<typeof installApi>[0],
  play?: StoryObj["play"],
): StoryObj {
  return {
    parameters: {
      nextjs: {
        appDirectory: true,
        navigation: { pathname: "/en/app/onboarding/gym", query: { step } },
      },
    },
    beforeEach: () => installApi({ ...signedIn, ...routes }),
    render: () => <GymOnboarding />,
    play,
  };
}

const meta = {
  title: "Gym Onboarding/Registration",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const heading = (canvasElement: HTMLElement, name: string) =>
  within(canvasElement).findByRole("heading", { level: 1, name });

async function fillCreate(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await heading(canvasElement, "Gym name & type");
  await userEvent.type(canvas.getByRole("textbox", { name: "Gym name" }), "Simple Boxing Gym");
  await userEvent.click(canvas.getByRole("radio", { name: "Boxing gym" }));
  await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
}

/* ── OG1 · Gym name & type ──────────────────────────────────────────── */

export const CreateEmpty = story("type", noGyms);
CreateEmpty.name = "OG1 · new gym (empty)";

export const CreateAnother = story("type", {
  "GET /api/v1/me/gyms": ok({ gyms: [summary("completed")], next_cursor: null }),
});
CreateAnother.name = "OG1 · owner of a gym starts another";

export const CreateResumed = story("type", {
  ...withDraft,
  [`GET ${setupPath}`]: ok(gymSetup()),
});
CreateResumed.name = "OG1 · resumed draft";

export const CreateInvalid = story("type", noGyms, async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await heading(canvasElement, "Gym name & type");
  await userEvent.type(canvas.getByRole("textbox", { name: "Phone · optional" }), "call me");
  await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
  await expect(await canvas.findByText("Check the highlighted fields.")).toBeVisible();
  await expect(canvas.getByText("Enter your gym’s name.")).toBeVisible();
  await expect(canvas.getByText("Choose a gym type.")).toBeVisible();
});
CreateInvalid.name = "OG1 · invalid";

export const Creating = story(
  "type",
  { ...noGyms, "POST /api/v1/gyms": "pending" },
  async ({ canvasElement }) => {
    await fillCreate(canvasElement);
    await expect(
      await within(canvasElement).findByRole("button", { name: "Creating…" }),
    ).toBeDisabled();
  },
);
Creating.name = "OG1 · creating";

export const CreateOffline = story(
  "type",
  { ...noGyms, "POST /api/v1/gyms": "offline" },
  async ({ canvasElement }) => {
    await fillCreate(canvasElement);
    await expect(
      await within(canvasElement).findByText("We couldn’t confirm your gym was created."),
    ).toBeVisible();
  },
);
CreateOffline.name = "OG1 · offline (unconfirmed, safe retry)";

export const CreateRateLimited = story(
  "type",
  {
    ...noGyms,
    "POST /api/v1/gyms": apiError(429, "rate_limited", { "retry-after": "5400" }),
  },
  async ({ canvasElement }) => {
    await fillCreate(canvasElement);
    await expect(
      await within(canvasElement).findByText("You’ve started several gyms today."),
    ).toBeVisible();
  },
);
CreateRateLimited.name = "OG1 · rate limited";

export const CreateDiscarded = story(
  "type",
  {
    ...noGyms,
    "POST /api/v1/gyms": conflict({ client_request_id: "discarded" }),
  },
  async ({ canvasElement }) => {
    await fillCreate(canvasElement);
    await expect(
      await within(canvasElement).findByText("That gym draft was discarded."),
    ).toBeVisible();
  },
);
CreateDiscarded.name = "OG1 · create key discarded";

export const TypeConflict = story(
  "type",
  {
    ...withDraft,
    [`GET ${setupPath}`]: [
      ok(gymSetup()),
      ok(gymSetup({ name: "Praga Boxing Club", revision: 5 })),
    ],
    [`PATCH ${setupPath}`]: conflict({ revision: "stale" }),
  },
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await heading(canvasElement, "Gym name & type");
    await userEvent.type(canvas.getByRole("textbox", { name: "Website · optional" }), "/praga");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(
      await canvas.findByText("This gym changed on another device or tab."),
    ).toBeVisible();
  },
);
TypeConflict.name = "OG1 · conflict (stale revision)";

export const SaveAndExit = story(
  "type",
  { ...withDraft, [`GET ${setupPath}`]: ok(gymSetup()), [`PATCH ${setupPath}`]: "pending" },
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await heading(canvasElement, "Gym name & type");
    await userEvent.type(canvas.getByRole("textbox", { name: "Gym name" }), " Club");
    await expect(canvas.getByText("Unsaved changes")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Save & exit" }));
    await expect(await canvas.findByRole("button", { name: "Saving…" })).toBeDisabled();
  },
);
SaveAndExit.name = "OG1 · Save & exit (saving)";

export const SessionExpired = story(
  "type",
  {
    ...withDraft,
    [`GET ${setupPath}`]: ok(gymSetup()),
    [`PATCH ${setupPath}`]: apiError(401, "unauthorized"),
    // The first refresh opens the session; the one after the 401 is refused.
    "/api/auth/session/refresh": [ok(SESSION), apiError(401, "unauthorized")],
  },
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await heading(canvasElement, "Gym name & type");
    await userEvent.type(canvas.getByRole("textbox", { name: "Gym name" }), " Club");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(await canvas.findByText("Your session ended.")).toBeVisible();
  },
);
SessionExpired.name = "OG1 · session expired";

/* ── OG2 · Location ─────────────────────────────────────────────────── */

export const LocationEmpty = story("location", {
  ...withDraft,
  [`GET ${setupPath}`]: ok(gymSetup()),
});
LocationEmpty.name = "OG2 · empty";

export const LocationSaved = story("location", {
  ...withDraft,
  [`GET ${setupPath}`]: ok(gymSetup({ primary_location: LOCATION })),
});
LocationSaved.name = "OG2 · saved";

export const LocationInvalid = story(
  "location",
  {
    ...withDraft,
    [`GET ${setupPath}`]: ok(gymSetup()),
  },
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await heading(canvasElement, "Location");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(await canvas.findByText("Choose a country.")).toBeVisible();
    await expect(canvas.getByText("Enter the street address.")).toBeVisible();
  },
);
LocationInvalid.name = "OG2 · invalid";

export const LocationConflict = story(
  "location",
  {
    ...withDraft,
    [`GET ${setupPath}`]: [
      ok(gymSetup({ primary_location: LOCATION })),
      ok(gymSetup({ primary_location: { ...LOCATION, city: "Kraków" }, revision: 5 })),
    ],
    [`PUT ${setupPath}/primary-location`]: conflict({ revision: "stale" }),
  },
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await heading(canvasElement, "Location");
    const note = canvas.getByRole("textbox", { name: "Entrance note · optional" });
    await userEvent.clear(note);
    await userEvent.type(note, "Ring the bell");
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(
      await canvas.findByText("This gym changed on another device or tab."),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Save my changes" })).toBeVisible();
    await expect(note).toHaveValue("Ring the bell");
  },
);
LocationConflict.name = "OG2 · conflict (stale revision)";

/* ── OG3 · Branding ─────────────────────────────────────────────────── */

const ready = gymSetup({ primary_location: LOCATION });

export const BrandingEmpty = story("branding", {
  ...withDraft,
  [`GET ${setupPath}`]: ok(ready),
});
BrandingEmpty.name = "OG3 · empty (Logo and Cover not available yet)";

export const BrandingChosen = story("branding", {
  ...withDraft,
  [`GET ${setupPath}`]: ok(
    gymSetup({
      primary_location: LOCATION,
      accent_color: "#e3a24f",
      tagline: "Boxing for everyone. Fighters welcome.",
    }),
  ),
});
BrandingChosen.name = "OG3 · colour and tagline";

export const BrandingMissingLocation = story(
  "branding",
  {
    ...withDraft,
    [`GET ${setupPath}`]: ok(gymSetup()),
    [`POST /api/v1/gyms/${GYM_ID}/complete-setup`]: {
      status: 422,
      body: {
        error: {
          code: "validation_error",
          message: "storybook",
          details: { fields: {}, field_codes: { primary_location: ["required"] } },
        },
      },
    },
  },
  async ({ canvasElement }) => {
    await heading(canvasElement, "Branding");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Create gym" }));
    await expect(
      await within(canvasElement).findByText("Your gym is missing details."),
    ).toBeVisible();
  },
);
BrandingMissingLocation.name = "OG3 · completion rejected";

const completedRoutes = {
  ...withDraft,
  [`GET ${setupPath}`]: ok(ready),
  [`POST /api/v1/gyms/${GYM_ID}/complete-setup`]: ok(
    gymSetup({ primary_location: LOCATION }, "completed"),
  ),
};

/* ── OG6b · Gym created ─────────────────────────────────────────────── */

export const Created = story("branding", completedRoutes, async ({ canvasElement }) => {
  await heading(canvasElement, "Branding");
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Skip for now" }));
  await heading(canvasElement, "Simple Boxing Gym is created.");
  await expect(within(canvasElement).getByRole("button", { name: "Go to gym" })).toBeVisible();
});
Created.name = "OG6b · gym created (after Skip)";

export const CreatedOpenFailure = story(
  "branding",
  { ...completedRoutes, "PUT /api/v1/me/entry/context": "offline" },
  async ({ canvasElement }) => {
    await heading(canvasElement, "Branding");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Create gym" }));
    await heading(canvasElement, "Simple Boxing Gym is created.");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Go to gym" }));
    await expect(
      await within(canvasElement).findByText("We couldn’t open your gym."),
    ).toBeVisible();
  },
);
CreatedOpenFailure.name = "OG6b · open failed";

/* ── Loading, failure and locales ───────────────────────────────────── */

export const Loading = story("type", { "GET /api/v1/me/gyms": "pending" });
Loading.name = "Loading the setup";

export const LoadFailure = story("type", {
  "GET /api/v1/me/gyms": apiError(500, "internal_error"),
});
LoadFailure.name = "Setup could not load";

export const LoadOffline = story("type", { "GET /api/v1/me/gyms": "offline" });
LoadOffline.name = "Setup offline";

export const DraftGone = story("location", {
  ...withDraft,
  [`GET ${setupPath}`]: apiError(404, "not_found"),
});
DraftGone.name = "Draft no longer available";

export const GermanLocation: StoryObj = {
  ...story("location", {
    ...withDraft,
    [`GET ${setupPath}`]: ok(gymSetup({ primary_location: LOCATION })),
  }),
  decorators: [
    (Story) => (
      <German>
        <Story />
      </German>
    ),
  ],
};
GermanLocation.name = "OG2 · German (long copy)";

export const PhoneCreate: StoryObj = {
  ...story("type", noGyms),
  globals: { viewport: { value: "phone", isRotated: false } },
};
PhoneCreate.name = "OG1 · phone 390";

export const LightBranding: StoryObj = {
  ...story("branding", {
    ...withDraft,
    [`GET ${setupPath}`]: ok(
      gymSetup({ primary_location: LOCATION, accent_color: "#7fa7c9", tagline: "Box on." }),
    ),
  }),
  globals: { theme: "Light", viewport: { value: "desktop", isRotated: false } },
};
LightBranding.name = "OG3 · light theme";
