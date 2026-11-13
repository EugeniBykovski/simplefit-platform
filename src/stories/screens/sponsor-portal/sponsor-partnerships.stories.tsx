import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
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
import {
  SponsorInterests,
  SponsorOpportunities,
  SponsorRequestDetail,
  SponsorRequestNew,
  SponsorRequests,
  SponsorWorkspace,
} from "@/widgets/sponsor-workspace";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";

/*
 * SF-131 partnership pages (SF-130 API) inside the partner portal, in the
 * route's own composition: session gate, SPONSOR_WORKSPACE gate and the portal
 * of the organization in the path, on a deterministic stand-in of the API
 * (`fetch` is replaced per story). Organizations, requests and interests are
 * Storybook fixtures; production shows only the backend's answers. No
 * opportunity inventory exists (D-SA21), so none is drawn here either.
 */

const HAYMAKER = "4c2e8a1d-6b3f-4e7a-9c5d-2f1b8e3a7d60";
const REQUEST = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const BASE = `/api/v1/sponsor-organizations/${HAYMAKER}`;

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
    permissions:
      role === "member"
        ? ["view_organization", "view_members", "view_partnerships"]
        : [
            "view_organization",
            "view_members",
            "view_contacts",
            "view_partnerships",
            "manage_partnerships",
          ],
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
    ],
    sponsor_workspace_count: 1,
  },
});

const POLICY = ok({
  policy: {
    version: "sponsor-partnership-2026-11.v1",
    interests: [
      "sponsored_challenges",
      "sponsored_events",
      "equipment_partnerships",
      "gym_partnerships",
      "coach_partnerships",
      "marketplace",
      "community_campaigns",
      "content",
      "other",
    ],
    scopes: ["global", "countries", "cities"],
    preference_fields: ["interests", "market_scope", "market_countries", "market_cities", "goals"],
    proposal_fields: [
      "title",
      "interests",
      "market_scope",
      "market_countries",
      "market_cities",
      "summary",
    ],
    required: ["title", "interests", "market_scope", "summary"],
    open_limit: 25,
    statuses: [
      "draft",
      "submitted",
      "under_review",
      "changes_requested",
      "accepted",
      "declined",
      "withdrawn",
    ],
  },
});

const preferences = (saved: boolean, canEdit: boolean) =>
  ok({
    sponsor_id: HAYMAKER,
    preferences: saved
      ? {
          revision: 3,
          interests: ["sponsored_events", "community_campaigns"],
          market_scope: "countries",
          market_countries: ["PL", "DE"],
          market_cities: ["Warsaw"],
          goals: "Support amateur boxing events and the clubs that run them.",
          updated_at: "2026-11-12T10:00:00Z",
        }
      : null,
    application_answers: {
      submitted_at: "2026-11-01T10:00:00Z",
      policy_version: "sponsor-application-2026-11.v1",
      interests: ["sponsored_events"],
      market_scope: "countries",
      market_countries: ["PL"],
      market_cities: [],
      goals: "Reach amateur boxers in Poland.",
    },
    can_edit: canEdit,
  });

const summary = (id: string, status: string, title: string, submitted: string | null) => ({
  proposal_id: id,
  kind: "general_inquiry",
  status,
  revision: 2,
  title,
  interests: ["sponsored_events"],
  change_request_open: status === "changes_requested",
  created_at: "2026-11-10T10:00:00Z",
  updated_at: "2026-11-12T10:00:00Z",
  submitted_at: submitted,
  decided_at: null,
  withdrawn_at: null,
});

const LIST = (canCreate: boolean, empty = false) =>
  ok({
    sponsor_id: HAYMAKER,
    proposals: empty
      ? []
      : [
          summary(REQUEST, "changes_requested", "Spring amateur events", "2026-11-11T10:00:00Z"),
          summary("9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5e", "draft", "Youth club equipment", null),
          summary(
            "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5f",
            "accepted",
            "Coach education content",
            "2026-11-05T10:00:00Z",
          ),
        ],
    next_cursor: null,
    can_create: canCreate,
  });

const proposal = (status: string, overrides: Record<string, unknown> = {}) =>
  ok({
    proposal: {
      proposal_id: REQUEST,
      sponsor_id: HAYMAKER,
      kind: "general_inquiry",
      status,
      revision: 4,
      binding: false,
      answers: {
        title: "Spring amateur events",
        interests: ["sponsored_events", "community_campaigns"],
        market_scope: "cities",
        market_countries: ["PL"],
        market_cities: ["Warsaw", "Kraków"],
        summary:
          "We would like to support amateur boxing nights in Warsaw and Kraków in spring, with drinks for participants.",
      },
      missing_fields: [],
      allowed_actions: {
        edit: status === "draft" || status === "changes_requested",
        submit: status === "draft" || status === "changes_requested",
        withdraw: ["draft", "submitted", "under_review", "changes_requested"].includes(status),
      },
      change_request:
        status === "changes_requested"
          ? {
              fields: ["summary"],
              message: "Could you say which clubs or event formats you have in mind?",
              requested_at: "2026-11-12T09:00:00Z",
            }
          : null,
      submissions:
        status === "draft"
          ? []
          : [{ submission_id: REQUEST, sequence: 1, submitted_at: "2026-11-11T10:00:00Z" }],
      history: [
        {
          from_status: null,
          to_status: "draft",
          occurred_at: "2026-11-10T10:00:00Z",
          actor: "sponsor_member",
        },
        ...(status === "draft"
          ? []
          : [
              {
                from_status: "draft",
                to_status: "submitted",
                occurred_at: "2026-11-11T10:00:00Z",
                actor: "sponsor_member",
              },
            ]),
        ...(["changes_requested", "accepted", "declined"].includes(status)
          ? [
              {
                from_status: "under_review",
                to_status: status,
                occurred_at: "2026-11-12T09:00:00Z",
                actor: "simplefit",
              },
            ]
          : []),
      ],
      created_by: { short_name: "Ola K.", is_viewer: false },
      created_at: "2026-11-10T10:00:00Z",
      updated_at: "2026-11-12T09:00:00Z",
      submitted_at: status === "draft" ? null : "2026-11-11T10:00:00Z",
      decided_at: ["accepted", "declined"].includes(status) ? "2026-11-12T09:00:00Z" : null,
      withdrawn_at: null,
      ...overrides,
    },
  });

function story({
  page,
  path,
  role = "owner",
  status = "active",
  routes = {},
  play,
}: {
  page: ReactNode;
  path: string;
  role?: Role;
  status?: "active" | "suspended";
  routes?: Record<string, Answer | Answer[]>;
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
        [BASE]: ok(organization(status, role)),
        "/api/v1/sponsor-partnership-policy": POLICY,
        ...routes,
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
  title: "Sponsor Portal/Partnerships",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const heading = (canvasElement: HTMLElement, name: string) =>
  within(canvasElement).findByRole("heading", { level: 1, name }, { timeout: 5000 });

export const Interests = story({
  page: <SponsorInterests />,
  path: "interests",
  routes: { [`${BASE}/partnership-preferences`]: preferences(true, true) },
  play: async ({ canvasElement }) => {
    await heading(canvasElement, "Partnership interests");
    await expect(within(canvasElement).getByRole("button", { name: "Edit" })).toBeVisible();
  },
});
Interests.name = "Interests · owner";

export const InterestsEditing = story({
  page: <SponsorInterests />,
  path: "interests",
  routes: { [`${BASE}/partnership-preferences`]: preferences(true, true) },
  play: async ({ canvasElement }) => {
    await heading(canvasElement, "Partnership interests");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit" }));
    await expect(
      await within(canvasElement).findByRole("button", { name: "Save interests" }),
    ).toBeVisible();
  },
});
InterestsEditing.name = "Interests · editing";

export const InterestsMember = story({
  page: <SponsorInterests />,
  path: "interests",
  role: "member",
  routes: { [`${BASE}/partnership-preferences`]: preferences(false, false) },
});
InterestsMember.name = "Interests · member, nothing saved (read-only)";

export const Opportunities = story({
  page: <SponsorOpportunities />,
  path: "opportunities",
  routes: {
    [`${BASE}/partnership-opportunities`]: ok({
      sponsor_id: HAYMAKER,
      availability: "unavailable",
      reason: "no_inventory",
    }),
  },
  play: async ({ canvasElement }) => {
    await heading(canvasElement, "Sponsorship opportunities");
    await expect(
      await within(canvasElement).findByRole("heading", { name: "No sponsorship opportunities" }),
    ).toBeVisible();
  },
});
Opportunities.name = "SPE1 · no opportunities (no_inventory)";

export const Requests = story({
  page: <SponsorRequests status={undefined} />,
  path: "requests",
  routes: { [`${BASE}/partnership-proposals`]: LIST(true) },
  play: async ({ canvasElement }) => {
    await heading(canvasElement, "Partnership requests");
    await expect(
      await within(canvasElement).findByRole("link", { name: "New request" }),
    ).toBeVisible();
  },
});
Requests.name = "Requests · owner";

export const RequestsEmptyMember = story({
  page: <SponsorRequests status={undefined} />,
  path: "requests",
  role: "member",
  routes: { [`${BASE}/partnership-proposals`]: LIST(false, true) },
});
RequestsEmptyMember.name = "Requests · member, none yet";

export const NewRequest = story({
  page: <SponsorRequestNew />,
  path: "requests/new",
  play: async ({ canvasElement }) => {
    await heading(canvasElement, "New partnership request");
    await expect(
      await within(canvasElement).findByRole("button", { name: "Save draft" }),
    ).toBeVisible();
  },
});
NewRequest.name = "New request · form";

export const NewRequestMember = story({
  page: <SponsorRequestNew />,
  path: "requests/new",
  role: "member",
});
NewRequestMember.name = "New request · member (read-only)";

const detail = (status: string, role: Role = "owner", overrides: Record<string, unknown> = {}) =>
  story({
    page: <SponsorRequestDetail requestId={REQUEST} />,
    path: `requests/${REQUEST}`,
    role,
    routes: { [`${BASE}/partnership-proposals/${REQUEST}`]: proposal(status, overrides) },
  });

export const Draft = detail("draft");
Draft.name = "Request · draft";

export const DraftIncomplete = detail("draft", "owner", {
  missing_fields: ["summary"],
  answers: {
    title: "Youth club equipment",
    interests: ["equipment_partnerships"],
    market_scope: "global",
    market_countries: [],
    market_cities: [],
    summary: null,
  },
});
DraftIncomplete.name = "Request · draft, incomplete";

export const ChangesRequested = detail("changes_requested");
ChangesRequested.name = "Request · changes requested";

export const UnderReview = detail("under_review");
UnderReview.name = "Request · in review";

export const Accepted = detail("accepted", "member");
Accepted.name = "Request · accepted (member)";

export const Declined = detail("declined");
Declined.name = "Request · declined";

export const UnknownStatus = detail("escalated");
UnknownStatus.name = "Request · unknown status";

export const NotFound = story({
  page: <SponsorRequestDetail requestId={REQUEST} />,
  path: `requests/${REQUEST}`,
  routes: { [`${BASE}/partnership-proposals/${REQUEST}`]: apiError(404, "not_found") },
});
NotFound.name = "Request · not found";

export const Suspended = story({
  page: <SponsorRequests status={undefined} />,
  path: "requests",
  status: "suspended",
  routes: { [`${BASE}/partnership-proposals`]: LIST(false) },
});
Suspended.name = "Requests · suspended organization (read-only)";

export const Failure = story({
  page: <SponsorRequests status={undefined} />,
  path: "requests",
  routes: { [`${BASE}/partnership-proposals`]: apiError(503, "service_unavailable") },
});
Failure.name = "Requests · data unavailable";

export const PhoneRequest = {
  ...detail("changes_requested"),
  globals: { viewport: { value: "phone", isRotated: false } },
} satisfies StoryObj;
PhoneRequest.name = "Request · phone 390";
