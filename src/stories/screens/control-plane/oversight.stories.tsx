import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
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
import { GymDetail, GymList } from "@/widgets/admin-gyms";
import { UserExplorer } from "@/widgets/admin-users";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

/*
 * AD2, AD12 and AD7's Fighters and Coaches tabs (SF-123; Claude Design `AdminTenants`,
 * `AdminTenantDetail`, `AdminUsers`, MVP) on a deterministic stand-in of the API:
 * `fetch` is replaced per story and nothing reaches a backend. Gyms, coaches and
 * fighters are Storybook fixtures.
 */

const GYM = "7b1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const OWNER = "1a1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const FIGHTER = "5f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const COACH = "6f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const USER = "8f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";

const operator = (permissions: string[]) =>
  ok({
    operator: {
      id: "5b0c7f1e-3a2d-4c6b-9e8f-1d2a3b4c5d6e",
      status: "active",
      permissions,
      security_keys: { registered: 2, required: 2 },
      step_up: {
        verified_at: "2026-11-10T12:00:00Z",
        expires_at: new Date(Date.now() + 29 * 60_000).toISOString(),
        fresh_seconds_remaining: 300,
      },
      enrollment_expires_at: null,
      activated_at: "2026-11-09T10:00:00Z",
    },
  });

const row = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: `${GYM.slice(0, -1)}${n}`,
  name: ["Alpha Boxing", "Brno Combat Club", "Fitness Box Studio Warszawa"][n % 3],
  gym_type: ["boxing_club", "combat_sports_gym", "fitness_boxing_studio"][n % 3],
  lifecycle: n === 2 ? "draft" : "completed",
  verification_status: ["approved", "submitted", "not_started"][n % 3],
  country_code: n === 2 ? null : ["PL", "CZ"][n % 2],
  city: n === 2 ? null : ["Kraków", "Brno"][n % 2],
  staff_count: [4, 9, 1][n % 3],
  created_at: `2026-10-0${n + 1}T10:00:00Z`,
  ...overrides,
});
const gym = (overrides: Record<string, unknown> = {}) =>
  ok({
    gym: {
      ...row(0, { id: GYM }),
      revision: 3,
      owner: { user_id: OWNER, short_name: "Natalia W." },
      staff: { manager: 1, coach: 2, front_desk: 0 },
      staff_invitations_pending: 1,
      members: { active: 184, requested: 3 },
      verification: {
        status: "approved",
        revision: 2,
        submitted_at: "2026-10-02T10:00:00Z",
        decided_at: "2026-10-03T10:00:00Z",
      },
      ...overrides,
    },
  });
const fighterSummary = {
  id: FIGHTER,
  user_id: USER,
  display_name: "Alex K.",
  username: "alex_k",
  profile_status: "completed",
  account_status: "active",
  active_relationships: 1,
};
const coachSummary = {
  id: COACH,
  user_id: USER,
  display_name: "Coach Marek",
  brand_name: "Marek Boxing",
  profile_status: "completed",
  account_status: "active",
  active_relationships: 3,
};

function story(
  permissions: string[],
  routes: Record<string, Answer | Answer[]>,
  render: () => ReactNode,
  play?: StoryObj["play"],
  pathname = "/en/admin/tenants",
): StoryObj {
  return {
    parameters: { nextjs: { appDirectory: true, navigation: { pathname, segments: [] } } },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/admin/me": operator(permissions),
        ...routes,
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web.admin")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        {render()}
      </RequireSession>
    ),
    play,
  };
}

const findText = (canvasElement: HTMLElement, text: string) =>
  within(canvasElement).findByText(text, {}, { timeout: 5000 });

export const GymsReady = story(
  ["gyms.read"],
  {
    "/api/v1/admin/gyms": ok({ gyms: [row(0), row(1), row(2)], next_cursor: "next" }),
  },
  () => <GymList />,
  async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("table", {}, { timeout: 5000 }),
    ).toBeVisible();
  },
);
GymsReady.name = "AD2 · ready";

export const GymsEmpty = story(
  ["gyms.read"],
  { "/api/v1/admin/gyms": ok({ gyms: [], next_cursor: null }) },
  () => <GymList />,
  async ({ canvasElement }) => {
    await expect(await findText(canvasElement, "No gyms match")).toBeVisible();
  },
);
GymsEmpty.name = "AD2 · empty";

export const GymsError = story(
  ["gyms.read"],
  { "/api/v1/admin/gyms": apiError(500, "internal_error") },
  () => <GymList />,
  async ({ canvasElement }) => {
    await expect(await findText(canvasElement, "We couldn’t load this")).toBeVisible();
  },
);
GymsError.name = "AD2 · error";

export const GymsRestricted = story(
  [],
  { "/api/v1/admin/gyms": apiError(403, "forbidden") },
  () => <GymList />,
  async ({ canvasElement }) => {
    await expect(
      await findText(canvasElement, "You don’t have access to this section"),
    ).toBeVisible();
  },
);
GymsRestricted.name = "AD2 · restricted";

const detail = (permissions: string[], answer: Answer, text: string) =>
  story(
    permissions,
    { [`/api/v1/admin/gyms/${GYM}`]: answer },
    () => <GymDetail gymId={GYM} initialReason="support_request" />,
    async ({ canvasElement }) => {
      await expect(await findText(canvasElement, text)).toBeVisible();
    },
    `/en/admin/tenants/${GYM}`,
  );

export const GymReady = detail(["gyms.read", "users.read"], gym(), "Business verification");
GymReady.name = "AD12 · ready";

export const GymDraft = detail(
  ["gyms.read"],
  gym({
    lifecycle: "draft",
    country_code: null,
    city: null,
    staff: { manager: 0, coach: 0, front_desk: 0 },
    staff_count: 1,
    members: { active: 0, requested: 0 },
    verification: { status: "not_started", revision: null, submitted_at: null, decided_at: null },
  }),
  "Setting up",
);
GymDraft.name = "AD12 · draft, nothing verified";

export const GymReason = story(
  ["gyms.read"],
  { [`/api/v1/admin/gyms/${GYM}`]: gym() },
  () => <GymDetail gymId={GYM} initialReason={null} />,
  undefined,
  `/en/admin/tenants/${GYM}`,
);
GymReason.name = "AD12 · reason first";

export const GymNotFound = detail(["gyms.read"], apiError(404, "not_found"), "No such gym");
GymNotFound.name = "AD12 · not found";

export const GymRestricted = detail(
  [],
  apiError(403, "forbidden"),
  "You don’t have access to this section",
);
GymRestricted.name = "AD12 · restricted";

async function lookup(canvasElement: HTMLElement, label: RegExp, query: string) {
  const canvas = within(canvasElement);
  await userEvent.type(
    await canvas.findByRole("textbox", { name: label }, { timeout: 5000 }),
    query,
  );
  await userEvent.click(canvas.getByRole("combobox", { name: /Reason/ }));
  await userEvent.click(
    await within(document.body).findByRole("option", { name: "Support request" }),
  );
  await userEvent.click(canvas.getByRole("button", { name: "Search" }));
}

export const FighterProfile = story(
  ["users.read", "fighters.read", "coaches.read"],
  {
    "/api/v1/admin/fighters": ok({ fighters: [fighterSummary] }),
    [`/api/v1/admin/fighters/${FIGHTER}`]: ok({
      fighter: {
        ...fighterSummary,
        country_code: "PL",
        city: "Warsaw",
        experience_level: "amateur",
        stance: "southpaw",
        created_at: "2026-10-01T10:00:00Z",
        relationships: { active: 1, ended: 2 },
        gym_memberships: 1,
      },
    }),
  },
  () => <UserExplorer initialTab="fighters" />,
  async ({ canvasElement }) => {
    await lookup(canvasElement, /@username, exact email or user ID/, "@alex_k");
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Show profile" }),
    );
    await expect(await findText(canvasElement, "Southpaw")).toBeVisible();
  },
  "/en/admin/users",
);
FighterProfile.name = "AD7 · fighter profile";

export const CoachProfile = story(
  ["coaches.read", "gyms.read"],
  {
    "/api/v1/admin/coaches": ok({ coaches: [{ ...coachSummary, account_status: "suspended" }] }),
    [`/api/v1/admin/coaches/${COACH}`]: ok({
      coach: {
        ...coachSummary,
        account_status: "suspended",
        country_code: "PL",
        city: "Warsaw",
        languages: ["pl", "en"],
        coaching_formats: ["personal_training", "group_coaching"],
        competition_levels: ["amateur"],
        created_at: "2026-10-01T10:00:00Z",
        relationships: { active: 3, ended: 1, invitations_pending: 2 },
        gyms: [{ gym_id: GYM, since: "2026-10-05T10:00:00Z" }],
      },
    }),
  },
  () => <UserExplorer initialTab="coaches" />,
  async ({ canvasElement }) => {
    await lookup(canvasElement, /Exact email or user ID/, USER);
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Show profile" }),
    );
    await expect(await findText(canvasElement, "Coaching relationships")).toBeVisible();
  },
  "/en/admin/users",
);
CoachProfile.name = "AD7 · coach profile (suspended account)";

export const CoachNoMatch = story(
  ["coaches.read"],
  { "/api/v1/admin/coaches": ok({ coaches: [] }) },
  () => <UserExplorer initialTab="coaches" />,
  async ({ canvasElement }) => {
    await lookup(canvasElement, /Exact email or user ID/, "nobody@example.com");
    await expect(await findText(canvasElement, "No coach matches")).toBeVisible();
  },
  "/en/admin/users",
);
CoachNoMatch.name = "AD7 · coach, no match";

export const PeopleRestricted = story(
  ["gyms.read"],
  {},
  () => <UserExplorer initialTab={null} />,
  async ({ canvasElement }) => {
    await expect(
      await findText(canvasElement, "You don’t have access to this section"),
    ).toBeVisible();
  },
  "/en/admin/users",
);
PeopleRestricted.name = "AD7 · no people permission";

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

const meta = {
  title: "Control Plane/Oversight",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;
