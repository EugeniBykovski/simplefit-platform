import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { expect, within } from "storybook/test";

import { GymGate, RequireSession } from "@/features/session-gate";
import { formats } from "@/shared/i18n/formats";
import { signInRouteFor } from "@/shared/routes/routes";
import { installApi, ok, SESSION, VIEWER, type Answer } from "@/stories/support/auth-story-api";
import { GymSettingsHeader } from "@/widgets/gym-billing";
import { GymCommunityDefaults, GymGoLive, GymVerification } from "@/widgets/gym-verification";
import { GymWorkspace, useGymWorkspace } from "@/widgets/gym-workspace";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";

import deGymBilling from "../../../../messages/de/gymBilling.json";
import deGymGoLive from "../../../../messages/de/gymGoLive.json";
import deGymVerification from "../../../../messages/de/gymVerification.json";

/*
 * Business verification (OG7), community defaults (WG10 / OG13) and go-live
 * readiness (OG14) (SF-103) in the route's own composition (session gate,
 * GYM_WORKSPACE gate, the console of the gym in the path) on a
 * deterministic stand-in of the SF-103 API (`fetch` is replaced per story;
 * nothing reaches a backend or storage). Business details, documents,
 * decisions and checks are Storybook fixtures; production pages show only
 * the backend's answers. No story approves or publishes anything.
 */

const RING = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const VIEWER_ROW = "5e2c7a91-3f4b-4d6e-8a0c-1b9d7f3e5a24";
const APP = "8a1b2c3d-0000-4000-8000-000000000801";

type Role = "owner" | "manager" | "coach";
type Page = "verification" | "community" | "goLive";

const PERMISSIONS: Record<Role, string[]> = {
  owner: [
    "view_workspace",
    "view_staff",
    "manage_billing",
    "manage_business_verification",
    "view_go_live",
  ],
  manager: ["view_workspace", "view_staff", "view_go_live"],
  coach: ["view_workspace", "view_staff"],
};

const gym = (role: Role) => ({
  gym: {
    id: RING,
    name: "Ring One Boxing",
    gym_type: "boxing_club",
    setup_status: "completed",
    inserted_at: "2026-10-27T10:00:00Z",
    updated_at: "2026-10-27T10:00:00Z",
    locations: [],
    viewer: { role, staff_membership_id: VIEWER_ROW, permissions: PERMISSIONS[role] },
  },
});

const entry = (role: Role) => ({
  entry: {
    destination: "gym_home",
    reason: "storybook",
    mandatory: false,
    intent: null,
    context: null,
    account_registration: "complete",
    fighter_profile: "completed",
    coach_profile: "not_started",
    capabilities: ["FIGHTER", "GYM_WORKSPACE"],
    gym_id: RING,
    gym_workspaces: [
      {
        gym_id: RING,
        name: "Ring One Boxing",
        role,
        setup_status: "completed",
        available_actions: ["enter"],
        selected: false,
      },
    ],
    gym_workspace_count: 1,
    sponsor_id: null,
    sponsor_workspaces: [],
    sponsor_workspace_count: 0,
  },
});

const REQUIREMENTS = {
  policy_version: "sf103-generic-1",
  required_fields: ["legal_name", "registration_country"],
  min_evidence: 1,
  max_evidence: 10,
  max_bytes: 10485760,
  content_types: ["application/pdf", "image/jpeg", "image/png"],
  kinds: ["registration_extract", "proof_of_address", "other"],
};

const application = (revision: number, extra: Record<string, unknown> = {}) => ({
  id: APP,
  revision,
  policy_version: "sf103-generic-1",
  legal_name: "Ring One Boxing Sp. z o.o.",
  registration_country: "PL",
  registration_number: "0000123456",
  address_line: "Ząbkowska 12",
  postal_code: "03-736",
  city: "Warszawa",
  website: "https://ringone.example",
  submitted_at: null,
  decided_at: null,
  created_at: "2026-11-04T10:00:00Z",
  updated_at: "2026-11-04T10:00:00Z",
  ...extra,
});

const doc = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `9a1b2c3d-0000-4000-8000-00000000090${n}`,
  kind: n === 1 ? "registration_extract" : "proof_of_address",
  status: "uploaded",
  file_name: n === 1 ? "krs-extract-2026.pdf" : "lease-zabkowska.pdf",
  content_type: "application/pdf",
  byte_size: 182311,
  uploaded_at: "2026-11-04T10:02:00Z",
  submitted: false,
  created_at: "2026-11-04T10:01:00Z",
  ...extra,
});

const verification = (extra: Record<string, unknown> = {}) => ({
  verification: {
    gym_id: RING,
    status: "not_started",
    application: null,
    evidence: [],
    latest_decision: null,
    missing: ["legal_name", "registration_country", "evidence"],
    can_edit: true,
    can_submit: false,
    requirements: REQUIREMENTS,
    ...extra,
  },
});

const decision = (value: string, reason: string | null) => ({
  decision: value,
  reason_code: reason,
  decided_at: "2026-11-05T09:00:00Z",
});

const check = (
  key: string,
  status: string,
  requiredness: string,
  reason: string,
  action: string | null,
  source: string,
) => ({ key, status, requiredness, reason_code: reason, action, source });

const goLive = (met: boolean) => ({
  go_live: {
    gym_id: RING,
    policy_version: "sf103-golive-1",
    evaluated_at: "2026-11-05T09:30:00Z",
    prerequisites_met: met,
    checks: [
      check("setup_completed", "passed", "required", "setup_completed", null, "gym_setup"),
      check("primary_location", "passed", "required", "location_set", null, "gym_setup"),
      met
        ? check(
            "business_verification",
            "passed",
            "required",
            "approved",
            "open_verification",
            "business_verification",
          )
        : check(
            "business_verification",
            "pending",
            "required",
            "in_review",
            "open_verification",
            "business_verification",
          ),
      check(
        "upcoming_class",
        met ? "passed" : "failed",
        "recommended",
        met ? "class_scheduled" : "no_upcoming_class",
        "open_timetable",
        "timetable",
      ),
      check("staff", "failed", "optional", "no_active_staff", "open_staff", "gym_staff"),
      check("members", "passed", "optional", "members_active", "open_members", "gym_members"),
      check(
        "member_products",
        "failed",
        "optional",
        "no_published_product",
        "open_memberships",
        "member_products",
      ),
      check("member_payments", "blocked", "optional", "decisions_not_approved", null, "payments"),
      check(
        "public_profile",
        "unavailable",
        "future",
        "public_surface_not_available",
        null,
        "publication",
      ),
      check(
        "community_settings",
        "unavailable",
        "future",
        "community_features_not_available",
        null,
        "community",
      ),
    ],
    publication: { status: "unavailable", reason_code: "public_surface_not_available" },
  },
});

function Screen({ page }: { page: Page }) {
  const gymValue = useGymWorkspace();
  return (
    <div className="flex min-h-full flex-col">
      <GymSettingsHeader gymId={gymValue.id} active={page} />
      {page === "verification" && (
        <GymVerification gym={gymValue} upload={() => Promise.resolve(new Response(null))} />
      )}
      {page === "community" && <GymCommunityDefaults gym={gymValue} />}
      {page === "goLive" && <GymGoLive gym={gymValue} />}
    </div>
  );
}

function AppFormats({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale={useLocale()}
      timeZone="UTC"
      messages={useMessages()}
      formats={formats}
    >
      {children}
    </NextIntlClientProvider>
  );
}

const PATHS: Record<Page, string> = {
  verification: "verification",
  community: "community",
  goLive: "go-live",
};

function screenStory({
  page = "verification",
  role = "owner",
  state = ok(verification()),
  readiness = ok(goLive(false)),
  play,
}: {
  page?: Page;
  role?: Role;
  state?: Answer | Answer[];
  readiness?: Answer | Answer[];
  play?: StoryObj["play"];
} = {}): StoryObj {
  const base = `/api/v1/gyms/${RING}`;
  return {
    parameters: {
      nextjs: {
        appDirectory: true,
        navigation: { pathname: `/en/app/gyms/${RING}/settings/${PATHS[page]}` },
      },
    },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/entry": ok(entry(role)),
        [base]: ok(gym(role)),
        [`${base}/business-verification`]: state,
        [`${base}/go-live`]: readiness,
      }),
    render: () => (
      <AppFormats>
        <RequireSession
          signIn={signInRouteFor("web")}
          pending={<LaunchScreen />}
          unavailable={<SessionFailure />}
        >
          <GymGate pending={<LaunchScreen />} failure={<EntryFailure />}>
            <GymWorkspace gymId={RING}>
              <Screen page={page} />
            </GymWorkspace>
          </GymGate>
        </RequireSession>
      </AppFormats>
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
  title: "Gym Console/Business verification",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const T = 5000;
const status = (canvasElement: HTMLElement) =>
  within(canvasElement).findByRole("region", { name: "Business verification" }, { timeout: T });

export const NotStarted = screenStory({
  play: async ({ canvasElement }) => {
    await expect(within(await status(canvasElement)).getByText("Not started")).toBeVisible();
    await expect(
      within(canvasElement).getByRole("button", { name: "Submit for review" }),
    ).toBeDisabled();
  },
});

export const Draft = screenStory({
  state: ok(
    verification({
      status: "draft",
      application: application(4),
      evidence: [doc(1), doc(2, { status: "pending_upload", uploaded_at: null })],
      missing: [],
      can_submit: false,
    }),
  ),
  play: async ({ canvasElement }) => {
    await expect(within(await status(canvasElement)).getByText("Draft")).toBeVisible();
    await expect(within(canvasElement).getByText("Uploading")).toBeVisible();
  },
});

export const InReview = screenStory({
  state: ok(
    verification({
      status: "submitted",
      application: application(5, { submitted_at: "2026-11-04T11:00:00Z" }),
      evidence: [doc(1, { submitted: true })],
      missing: [],
      can_edit: false,
    }),
  ),
  play: async ({ canvasElement }) => {
    await expect(within(await status(canvasElement)).getByText("In review")).toBeVisible();
    await expect(within(canvasElement).getByLabelText("Legal name")).toBeDisabled();
  },
});

export const ChangesRequested = screenStory({
  state: ok(
    verification({
      status: "changes_requested",
      application: application(5, {
        submitted_at: "2026-11-04T11:00:00Z",
        decided_at: "2026-11-05T09:00:00Z",
      }),
      evidence: [doc(1, { submitted: true })],
      latest_decision: decision("changes_requested", "document_unreadable"),
      missing: [],
      can_submit: true,
    }),
  ),
  play: async ({ canvasElement }) => {
    await expect(within(await status(canvasElement)).getByText("Changes requested")).toBeVisible();
    await expect(within(canvasElement).getByRole("button", { name: "Submit again" })).toBeEnabled();
  },
});

export const Approved = screenStory({
  state: ok(
    verification({
      status: "approved",
      application: application(5, {
        submitted_at: "2026-11-04T11:00:00Z",
        decided_at: "2026-11-05T09:00:00Z",
      }),
      evidence: [doc(1, { submitted: true })],
      latest_decision: decision("approved", null),
      missing: [],
      can_edit: false,
    }),
  ),
  play: async ({ canvasElement }) => {
    await expect(within(await status(canvasElement)).getByText("Verified")).toBeVisible();
  },
});

export const Rejected = screenStory({
  state: ok(
    verification({
      status: "rejected",
      application: application(5, {
        submitted_at: "2026-11-04T11:00:00Z",
        decided_at: "2026-11-05T09:00:00Z",
      }),
      latest_decision: decision("rejected", "business_not_verifiable"),
      missing: ["evidence"],
    }),
  ),
  play: async ({ canvasElement }) => {
    await expect(within(await status(canvasElement)).getByText("Not approved")).toBeVisible();
  },
});

export const Revoked = screenStory({
  state: ok(
    verification({
      status: "revoked",
      application: application(5, {
        submitted_at: "2026-11-04T11:00:00Z",
        decided_at: "2026-11-06T09:00:00Z",
      }),
      latest_decision: decision("revoked", "business_closed"),
      missing: ["evidence"],
    }),
  ),
  play: async ({ canvasElement }) => {
    await expect(within(await status(canvasElement)).getByText("Revoked")).toBeVisible();
  },
});

export const RestrictedToOwner = screenStory({
  role: "manager",
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        "Only the gym's owner manages business verification",
        {},
        { timeout: T },
      ),
    ).toBeVisible();
  },
});

export const GoLiveNotMet = screenStory({
  page: "goLive",
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        "Some required steps aren't done yet.",
        {},
        { timeout: T },
      ),
    ).toBeVisible();
    await expect(within(canvasElement).getByText("Not available yet")).toBeVisible();
  },
});

export const GoLivePrerequisitesMet = screenStory({
  page: "goLive",
  role: "manager",
  readiness: ok(goLive(true)),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/Every required step is done/, {}, { timeout: T }),
    ).toBeVisible();
  },
});

export const GoLiveRestricted = screenStory({
  page: "goLive",
  role: "coach",
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        "Only the owner and managers see go-live readiness",
        {},
        { timeout: T },
      ),
    ).toBeVisible();
  },
});

export const Community = screenStory({
  page: "community",
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("Gym community feed", {}, { timeout: T }),
    ).toBeVisible();
  },
});

function German({ children }: { children: ReactNode }) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider
      locale="de"
      timeZone="UTC"
      messages={{
        ...messages,
        gymBilling: deGymBilling,
        gymVerification: deGymVerification,
        gymGoLive: deGymGoLive,
      }}
      formats={formats}
    >
      {children}
    </NextIntlClientProvider>
  );
}

export const GermanCopy: StoryObj = {
  ...screenStory({
    state: ok(
      verification({
        status: "changes_requested",
        application: application(5, { submitted_at: "2026-11-04T11:00:00Z" }),
        evidence: [doc(1, { submitted: true })],
        latest_decision: decision("changes_requested", "details_mismatch"),
        missing: [],
        can_submit: true,
      }),
    ),
  }),
  decorators: [(Story) => <German>{Story()}</German>],
};
