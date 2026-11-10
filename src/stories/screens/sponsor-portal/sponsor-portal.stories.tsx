import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, userEvent, within } from "storybook/test";

import { RequireSession, SponsorGate } from "@/features/session-gate";
import { signInRouteFor } from "@/shared/routes/routes";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import type { ReactNode } from "react";

import {
  SponsorApplicationPage,
  SponsorOverview,
  SponsorSettings,
  SponsorUnsupported,
  SponsorWorkspace,
  type SettingsSection,
} from "@/widgets/sponsor-workspace";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";

/*
 * The partner portal (SF-117; Claude Design SPX4 SponsorDashboard mode MVP,
 * SponsorNav mode=mvp, SPE1 system states and organization switcher) in the
 * route's own composition: session gate, SPONSOR_WORKSPACE gate and the portal
 * of the organization in the path, on a deterministic stand-in of the API
 * (`fetch` is replaced per story; nothing reaches a backend). Organizations
 * are Storybook fixtures; production shows only the backend's answers.
 */

const HAYMAKER = "4c2e8a1d-6b3f-4e7a-9c5d-2f1b8e3a7d60";
const AGENCY = "7e1d3b5f-9a2c-4d8e-b6f0-3a5c7e9b1d24";

type Role = "owner" | "manager" | "member";

const organization = (status: "active" | "suspended", role: Role) => ({
  organization: {
    sponsor_id: HAYMAKER,
    display_name: "Haymaker Drinks",
    legal_name: "Haymaker Drinks Sp. z o.o.",
    country_code: "PL",
    website: null,
    status,
    revision: 1,
    created_at: "2026-11-09T10:00:00Z",
  },
  membership: {
    membership_id: "1a3c5e7f-2b4d-4f6a-8c0e-9d1b3f5a7c2e",
    role,
    // As SimpleFit.Sponsors.Policy: business contacts for owner and manager only.
    permissions:
      role === "member"
        ? ["view_organization", "view_members"]
        : ["view_organization", "view_members", "view_contacts"],
    joined_at: "2026-11-09T10:00:00Z",
  },
});

const entry = (role: Role) => ({
  entry: {
    destination: "sponsor_home",
    reason: "storybook",
    mandatory: false,
    intent: null,
    context: null,
    account_registration: "complete",
    fighter_profile: "completed",
    coach_profile: "not_started",
    capabilities: ["FIGHTER", "SPONSOR_WORKSPACE"],
    gym_id: null,
    gym_workspaces: [],
    gym_workspace_count: 0,
    sponsor_id: HAYMAKER,
    sponsor_workspaces: [
      { sponsor_id: HAYMAKER, display_name: "Haymaker Drinks", role, selected: true },
      { sponsor_id: AGENCY, display_name: "Northside Agency", role: "member", selected: false },
    ],
    sponsor_workspace_count: 2,
  },
});

const member = (id: string, name: string | null, role: Role, viewer = false) => ({
  membership_id: id,
  short_name: name,
  role,
  status: "active",
  joined_at: "2026-11-09T10:00:00Z",
  is_viewer: viewer,
});

const MEMBERS = ok({
  members: [
    member("6b1d0000-0000-4000-8000-000000000001", "Alex N.", "owner", true),
    member("6b1d0000-0000-4000-8000-000000000002", "Ola K.", "manager"),
    member("6b1d0000-0000-4000-8000-000000000003", null, "member"),
  ],
  next_cursor: null,
});

const CONTACTS = ok({
  contacts: [
    {
      contact_id: "6c1d0000-0000-4000-8000-000000000001",
      kind: "primary",
      full_name: "Ada Nowak",
      job_title: "Partnerships",
      email: "ada@haymaker.example",
      phone: "+48123456789",
    },
  ],
});

const APPLICATION = ok({
  application: {
    application_id: "6a1d0000-0000-4000-8000-000000000001",
    status: "approved",
    sponsor_id: HAYMAKER,
    submitted_at: "2026-11-01T10:00:00Z",
    answers: {
      budget_band: null,
      company_name: "Haymaker Drinks",
      contact_email: "ada@haymaker.example",
      contact_full_name: "Ada Nowak",
      contact_phone: null,
      contact_position: "Partnerships",
      country_code: "PL",
      goals: null,
      industry: null,
      interests: [],
      market_cities: [],
      market_countries: [],
      market_scope: null,
      website: null,
    },
  },
});

function story({
  read,
  role = "owner",
  application = apiError(404, "not_found"),
  page = <SponsorOverview />,
  path = "dashboard",
  contacts = CONTACTS,
  play,
}: {
  read: Answer;
  role?: Role;
  application?: Answer;
  page?: ReactNode;
  path?: string;
  contacts?: Answer;
  play?: StoryObj["play"];
}): StoryObj {
  return {
    parameters: {
      nextjs: {
        appDirectory: true,
        navigation: { pathname: `/en/sponsor/${HAYMAKER}/${path}`, segments: [] },
      },
    },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/entry": ok(entry(role)),
        "/api/v1/me/fighter-profile": ok({ fighter_profile: { display_name: "Alex N." } }),
        "/api/v1/me/gym-memberships": ok({ memberships: [], next_cursor: null }),
        [`/api/v1/sponsor-organizations/${HAYMAKER}`]: read,
        "/api/v1/me/sponsor-application": application,
        [`/api/v1/sponsor-organizations/${HAYMAKER}/members`]: MEMBERS,
        [`/api/v1/sponsor-organizations/${HAYMAKER}/contacts`]: contacts,
        "PUT /api/v1/me/entry/context": ok(undefined, 204),
      }),
    render: () => (
      <RequireSession
        signIn={signInRouteFor("web.sponsor")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <SponsorGate pending={<LaunchScreen />} failure={<EntryFailure />}>
          <SponsorWorkspace sponsorId={HAYMAKER}>{page}</SponsorWorkspace>
        </SponsorGate>
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
  title: "Sponsor Portal/Overview",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const overview = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole("heading", { level: 1, name: "Overview" }, { timeout: 5000 });

export const Owner = story({
  read: ok(organization("active", "owner")),
  application: ok({ application: { status: "approved", sponsor_id: HAYMAKER } }),
  play: async ({ canvasElement }) => {
    await overview(canvasElement);
    await expect(within(canvasElement).getByText("Reviewed by SimpleFit")).toBeVisible();
  },
});
Owner.name = "SPX4 · owner (approved application)";

export const Member = story({
  read: ok(organization("active", "member")),
  role: "member",
  play: async ({ canvasElement }) => {
    await overview(canvasElement);
    await expect(within(canvasElement).getByText("Your role: Member")).toBeVisible();
  },
});
Member.name = "SPX4 · member";

export const Suspended = story({
  read: ok(organization("suspended", "owner")),
  play: async ({ canvasElement }) => {
    await overview(canvasElement);
    await expect(within(canvasElement).getByText("This organization is suspended.")).toBeVisible();
  },
});
Suspended.name = "SPX4 · suspended (read-only)";

export const NotAvailable = story({
  read: apiError(404, "not_found"),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("We can’t find that page", {}, { timeout: 5000 }),
    ).toBeVisible();
  },
});
NotAvailable.name = "SPE1 · not available (404: unknown, foreign or revoked)";

export const Failure = story({ read: apiError(503, "service_unavailable") });
Failure.name = "SPE1 · data unavailable (retry)";

export const Loading = story({ read: "pending" });
Loading.name = "SPE1 · loading";

export const Switcher = story({
  read: ok(organization("active", "owner")),
  play: async ({ canvasElement }) => {
    await overview(canvasElement);
    const [trigger] = within(canvasElement).getAllByRole("button", {
      name: "Haymaker Drinks, Owner. Switch organization or profile",
    });
    if (!trigger) throw new Error("no switcher");
    await userEvent.click(trigger);
    const menu = await within(document.body).findByRole("menu");
    await expect(
      within(menu).getByRole("menuitemradio", { name: /Northside Agency/ }),
    ).toBeVisible();
  },
});
Switcher.name = "SPE1 · organization switcher (open)";

export const Phone = {
  ...story({ read: ok(organization("active", "owner")) }),
  globals: { viewport: { value: "phone", isRotated: false } },
} satisfies StoryObj;
Phone.name = "SPX4 · phone 390";

const settings = (
  section: SettingsSection,
  role: Role = "owner",
  status: "active" | "suspended" = "active",
  text?: string,
) =>
  story({
    read: ok(organization(status, role)),
    role,
    page: <SponsorSettings section={section} />,
    path: "settings",
    play: async ({ canvasElement }) => {
      await within(canvasElement).findByRole(
        "heading",
        { level: 1, name: "Settings" },
        { timeout: 5000 },
      );
      if (text) await expect(await within(canvasElement).findByText(text)).toBeVisible();
    },
  });

export const SettingsOrganization = settings("organization", "owner", "active", "Company profile");
SettingsOrganization.name = "SPX9 · organization (read-only)";

export const SettingsContact = settings("contact", "owner", "active", "Ada Nowak");
SettingsContact.name = "SPX9 · contact (owner)";

export const SettingsContactRestricted = settings(
  "contact",
  "member",
  "active",
  "Business contacts are visible to an owner or manager of this organization.",
);
SettingsContactRestricted.name = "SPX9 · contact (member: restricted)";

export const SettingsMembers = settings("members", "owner", "active", "Ola K.");
SettingsMembers.name = "SPX9 · members (read-only)";

export const SettingsAccount = settings("account", "owner", "active", "Your account");
SettingsAccount.name = "SPX9 · your account (settings Soon)";

export const SettingsSuspended = settings(
  "organization",
  "owner",
  "suspended",
  "This organization is suspended.",
);
SettingsSuspended.name = "SPX9 · suspended";

export const ApplicationOwn = story({
  read: ok(organization("active", "owner")),
  application: APPLICATION,
  page: <SponsorApplicationPage />,
  path: "application",
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("Reviewed by SimpleFit", {}, { timeout: 5000 }),
    ).toBeVisible();
  },
});
ApplicationOwn.name = "Application · the applicant's own";

export const ApplicationOther = story({
  read: ok(organization("active", "member")),
  role: "member",
  page: <SponsorApplicationPage />,
  path: "application",
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        "Only the person who applied can see it",
        {},
        { timeout: 5000 },
      ),
    ).toBeVisible();
  },
});
ApplicationOther.name = "Application · another member";

export const Unsupported = story({
  read: ok(organization("active", "owner")),
  page: <SponsorUnsupported />,
  path: "campaigns",
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole(
      "heading",
      { level: 1, name: "This isn’t part of SimpleFit yet" },
      { timeout: 5000 },
    );
  },
});
Unsupported.name = "SPE1 · unsupported feature (campaigns, analytics, invoices)";
