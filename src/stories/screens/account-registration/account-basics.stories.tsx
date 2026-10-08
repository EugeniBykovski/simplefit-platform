import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, userEvent, within } from "storybook/test";

import { OnboardingGate, RequireSession } from "@/features/session-gate";
import { signInRouteFor } from "@/shared/routes/routes";
import { apiError, installApi, ok, SESSION, VIEWER } from "@/stories/support/auth-story-api";
import { AccountRegistration } from "@/widgets/account-registration";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";

/*
 * WA5 Account basics & consent (SF-46; Claude Design V78 WebAccountBasics):
 * the route's own composition (session gate, onboarding gate, widget) on a
 * deterministic stand-in of the SF-44 account registration and the SF-45
 * resolver (`fetch` is replaced per story; nothing reaches a backend, no
 * real account). State stories reach their state with a play function,
 * through the real components.
 */

type Fields = {
  full_name?: string;
  date_of_birth?: string;
  terms?: string;
  privacy?: string;
  product_news?: boolean;
};

const VERSIONS = { terms: "terms-v1", privacy: "privacy-v1" };
const ALL: Fields = {
  full_name: "Alex Kowalski",
  date_of_birth: "2000-05-17",
  terms: "terms-v1",
  privacy: "privacy-v1",
  product_news: true,
};

function account(
  fields: Fields,
  status: "not_started" | "in_progress" | "complete" = "in_progress",
  versions = VERSIONS,
) {
  const consent = (kind: "terms" | "privacy") => ({
    accepted: fields[kind] !== undefined,
    accepted_version: fields[kind] ?? null,
    accepted_at: fields[kind] === undefined ? null : "2026-10-08T10:00:00Z",
    current_version: versions[kind],
    current: fields[kind] === versions[kind],
  });
  const missing = [
    fields.full_name ? null : "full_name",
    fields.date_of_birth ? null : "date_of_birth",
    consent("terms").current ? null : "terms",
    consent("privacy").current ? null : "privacy",
  ].filter((item) => item !== null);
  return {
    account_profile: {
      registration: {
        status,
        completed_at: status === "complete" ? "2026-10-08T12:00:00Z" : null,
        missing_requirements: status === "complete" ? [] : missing,
      },
      full_name: fields.full_name ?? null,
      date_of_birth: fields.date_of_birth ?? null,
      consents: { terms: consent("terms"), privacy: consent("privacy") },
      product_news: {
        subscribed: fields.product_news ?? false,
        updated_at: fields.product_news === undefined ? null : "2026-10-08T10:00:00Z",
      },
    },
  };
}

const entry = (destination: string) =>
  ok({
    entry: {
      account_registration: destination === "account_registration" ? "in_progress" : "complete",
      capabilities: [],
      destination,
      fighter_profile: "not_started",
      intent: null,
      mandatory: destination === "account_registration",
      reason: "storybook",
    },
  });

const validation = (field_codes: Record<string, string[]>) => ({
  status: 422,
  body: {
    error: { code: "validation_error", message: "storybook", details: { fields: {}, field_codes } },
  },
});

const signedIn = {
  "/api/me": ok({ user: VIEWER }),
  "/api/auth/session/refresh": ok(SESSION),
  "/api/v1/me/entry": entry("account_registration"),
};

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

function story(routes: Parameters<typeof installApi>[0], play?: StoryObj["play"]): StoryObj {
  return {
    beforeEach: () => installApi({ ...signedIn, ...routes }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <OnboardingGate pending={<LaunchScreen />} failure={<EntryFailure />}>
          <AccountRegistration />
        </OnboardingGate>
      </RequireSession>
    ),
    play,
  };
}

const meta = {
  title: "Account Registration/Account basics",
  parameters: {
    layout: "fullscreen",
    nextjs: { appDirectory: true, navigation: { pathname: "/en/app/onboarding/account" } },
  },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const ready = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await canvas.findByRole("heading", { level: 1, name: "Before you start" });
  await canvas.findByLabelText("Full name");
  return canvas;
};

async function fill(canvasElement: HTMLElement, { date = "2000-05-17", privacy = true } = {}) {
  const canvas = await ready(canvasElement);
  await userEvent.type(canvas.getByLabelText("Full name"), "Alex Kowalski");
  await userEvent.type(canvas.getByLabelText("Date of birth"), date);
  await userEvent.click(canvas.getByRole("checkbox", { name: /Terms of Service/ }));
  if (privacy) await userEvent.click(canvas.getByRole("checkbox", { name: /Privacy Policy/ }));
  await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
  return canvas;
}

/* ── Load ───────────────────────────────────────────────────────────── */

export const Empty = story({ "GET /api/v1/me/account-profile": ok(account({}, "not_started")) });
Empty.name = "Empty · not started";

export const Loading = story({ "GET /api/v1/me/account-profile": "pending" });
Loading.name = "Loading";

export const PartiallyCompleted = story({
  "GET /api/v1/me/account-profile": ok(account({ full_name: "Alex Kowalski", terms: "terms-v1" })),
});
PartiallyCompleted.name = "Partially completed";

export const Resumed = story({ "GET /api/v1/me/account-profile": ok(account(ALL)) });
Resumed.name = "Persisted values loaded";

export const NewDocumentVersion = story({
  "GET /api/v1/me/account-profile": ok(
    account({ ...ALL, terms: "terms-v1" }, "in_progress", { ...VERSIONS, terms: "terms-v2" }),
  ),
});
NewDocumentVersion.name = "Consent version mismatch";

export const NetworkUnavailable = story({ "GET /api/v1/me/account-profile": "offline" });
NetworkUnavailable.name = "Network unavailable";

export const SessionExpired = story({
  "/api/auth/session/refresh": apiError(401, "unauthorized"),
  "/api/me": apiError(401, "unauthorized"),
});
SessionExpired.name = "Session expired (to sign-in)";

/* ── Validation ─────────────────────────────────────────────────────── */

export const MissingConsent = story(
  {
    "GET /api/v1/me/account-profile": ok(account({}, "not_started")),
    "PATCH /api/v1/me/account-profile": ok(
      account({ full_name: "Alex Kowalski", date_of_birth: "2000-05-17", terms: "terms-v1" }),
    ),
  },
  async ({ canvasElement }) => {
    const canvas = await fill(canvasElement, { privacy: false });
    await expect(await canvas.findByText("Accept the Privacy Policy to continue.")).toBeVisible();
  },
);
MissingConsent.name = "Missing consent";

export const InvalidDate = story(
  {
    "GET /api/v1/me/account-profile": ok(account({}, "not_started")),
    // The valid fields are saved; the date is not sent.
    "PATCH /api/v1/me/account-profile": ok(
      account({ full_name: "Alex Kowalski", terms: "terms-v1", privacy: "privacy-v1" }),
    ),
  },
  async ({ canvasElement }) => {
    const canvas = await fill(canvasElement, { date: "2999-01-01" });
    await expect(await canvas.findByText("Enter a real date, not in the future.")).toBeVisible();
  },
);
InvalidDate.name = "Invalid date of birth";

export const TooYoung = story(
  {
    "GET /api/v1/me/account-profile": ok(account({}, "not_started")),
    "PATCH /api/v1/me/account-profile": validation({ date_of_birth: ["too_young"] }),
  },
  async ({ canvasElement }) => {
    const canvas = await fill(canvasElement, { date: "2012-03-12" });
    await expect(
      await canvas.findByText("You must be 16 or older to use SimpleFit."),
    ).toBeVisible();
  },
);
TooYoung.name = "Too young";

export const MissingRequirements = story(
  {
    // Loaded with every requirement met; a new Terms version comes into force
    // before Continue, so completion is refused and the reload reopens the box.
    "GET /api/v1/me/account-profile": [
      ok(account(ALL)),
      ok(account(ALL, "in_progress", { ...VERSIONS, terms: "terms-v2" })),
    ],
    "POST /api/v1/me/account-profile/complete-registration": validation({ terms: ["required"] }),
  },
  async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(await canvas.findByText("Accept the Terms of Service to continue.")).toBeVisible();
    await expect(
      await canvas.findByText("A new version is in force: accept it to continue."),
    ).toBeVisible();
  },
);
MissingRequirements.name = "Backend missing requirements";

/* ── Saving and completion ──────────────────────────────────────────── */

export const Saving = story(
  {
    "GET /api/v1/me/account-profile": ok(account({}, "not_started")),
    "PATCH /api/v1/me/account-profile": "pending",
  },
  async ({ canvasElement }) => {
    const canvas = await fill(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Saving…" })).toBeVisible();
  },
);
Saving.name = "Saving";

export const SaveFailure = story(
  {
    "GET /api/v1/me/account-profile": ok(account({}, "not_started")),
    "PATCH /api/v1/me/account-profile": apiError(503, "service_unavailable"),
  },
  async ({ canvasElement }) => {
    const canvas = await fill(canvasElement);
    await expect(await canvas.findByText("We couldn’t save your details.")).toBeVisible();
  },
);
SaveFailure.name = "Save failure";

export const SaveOffline = story(
  {
    "GET /api/v1/me/account-profile": ok(account({}, "not_started")),
    "PATCH /api/v1/me/account-profile": "offline",
  },
  async ({ canvasElement }) => {
    const canvas = await fill(canvasElement);
    await expect(await canvas.findByText("We couldn’t save your details.")).toBeVisible();
  },
);
SaveOffline.name = "Save failure · offline";

export const Completing = story(
  {
    "GET /api/v1/me/account-profile": ok(account(ALL)),
    "POST /api/v1/me/account-profile/complete-registration": "pending",
  },
  async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    await expect(await canvas.findByRole("button", { name: "Saving…" })).toBeVisible();
  },
);
Completing.name = "Completing";

export const Completed = story({
  "GET /api/v1/me/account-profile": ok(account(ALL, "complete")),
});
Completed.name = "Completed (continuing)";

export const ContinuationRetry = story(
  {
    "GET /api/v1/me/account-profile": ok(account(ALL)),
    "POST /api/v1/me/account-profile/complete-registration": ok(account(ALL, "complete")),
    // Registration completes; the resolver then fails, and the gate offers a retry.
    "/api/v1/me/entry": [entry("account_registration"), apiError(503, "service_unavailable")],
  },
  async ({ canvasElement }) => {
    const canvas = await ready(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }));
    const alert = await canvas.findByRole("alert");
    await expect(within(alert).getByRole("button")).toBeVisible();
  },
);
ContinuationRetry.name = "Continuation retry";
