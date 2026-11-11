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
import { ReviewDetail, ReviewQueue } from "@/widgets/admin-sponsor-review";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

/*
 * AS1 and AS2 (SF-124; Claude Design `AdminSponsors`, `AdminSponsorDetail`, MVP) on a
 * deterministic stand-in of the API: `fetch` is replaced per story and nothing reaches
 * a backend. Applications and organizations are Storybook fixtures.
 */

const ID = "4a1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const ORG = "6a1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const REVIEWER = [
  "sponsors.applications.read",
  "sponsors.applications.claim",
  "sponsors.applications.request_changes",
  "sponsors.applications.approve",
  "sponsors.applications.reject",
  "sponsors.applications.read_files",
  "sponsors.restrict",
];

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

const row = (n: number, status: string) => ({
  application_id: `${ID.slice(0, -1)}${n}`,
  status,
  revision: n + 1,
  submitted_at: `2026-11-0${n + 1}T10:00:00Z`,
  decided_at: null,
  company_name: ["Haymaker GmbH", "Northpaw Wraps", "Vistula Water"][n % 3],
  country_code: ["DE", "PL", "CZ"][n % 3],
  industry: ["boxing_equipment", "sports_apparel", "nutrition"][n % 3],
  submissions: n + 1,
  submitted_documents: n,
  change_request_open: status === "changes_requested",
});

const application = (overrides: Record<string, unknown> = {}) =>
  ok({
    application: {
      application_id: ID,
      status: "under_review",
      revision: 3,
      submitted_at: "2026-11-01T10:00:00Z",
      decided_at: null,
      organization: null,
      viewer_is_party: false,
      latest_submission: {
        submission_id: "5a1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b",
        sequence: 2,
        submitted_at: "2026-11-01T10:00:00Z",
        policy_version: "sponsor-application-2026-11.v1",
        answers: {
          company_name: "Haymaker GmbH",
          website: "https://haymaker.example",
          country_code: "DE",
          industry: "boxing_equipment",
          contact_full_name: "Laura Weiss",
          contact_position: "Head of Partnerships",
          contact_email: "laura@haymaker.example",
          contact_phone: "+49301234567",
          interests: ["sponsored_events", "gym_partnerships"],
          market_scope: "countries",
          market_countries: ["PL", "CZ", "DE"],
          market_cities: [],
          budget_band: "to_be_discussed",
          goals: "Participation among amateur boxers; brand awareness in partner gyms.",
        },
        contact_email_verified: true,
        declaration_version: "sponsor-application-declaration-1",
        declaration_language: "en",
      },
      change_request: null,
      evidence: [
        {
          evidence_id: "9a1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b",
          kind: "brand_deck",
          content_type: "application/pdf",
          byte_size: 4404019,
          scanned: false,
        },
      ],
      history: [
        {
          event: "sponsor_application.submitted",
          actor: "applicant",
          from_status: "draft",
          to_status: "submitted",
          reason_code: null,
          occurred_at: "2026-10-30T10:00:00Z",
        },
        {
          event: "sponsor_application.claimed",
          actor: "operator",
          from_status: "submitted",
          to_status: "under_review",
          reason_code: null,
          occurred_at: "2026-11-01T11:00:00Z",
        },
      ],
      ...overrides,
    },
  });

const preview = ok({
  preview: {
    action: "sponsor_application.approve",
    target: { type: "sponsor_application", id: ID, status: "under_review" },
    expected_revision: 3,
    current_state: "under_review",
    proposed_state: "approved",
    permission: null,
    impact: [
      "organization_created",
      "applicant_becomes_owner",
      "applicant_notified",
      "no_commercial_rights",
    ],
    required_permission: "sponsors.applications.approve",
    required_assurance: "fresh_key",
    reason_code: "review_complete",
    confirmation: { required: true, token: "sfc_story", expires_at: "2099-01-01T00:00:00Z" },
  },
});

function story(
  permissions: string[],
  routes: Record<string, Answer | Answer[]>,
  render: () => ReactNode,
  play?: StoryObj["play"],
  pathname = "/en/admin/sponsors",
): StoryObj {
  return {
    parameters: { nextjs: { appDirectory: true, navigation: { pathname, segments: [] } } },
    beforeEach: () =>
      installApi({
        "/api/me": ok({ user: VIEWER }),
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/admin/me": operator(permissions),
        "/api/v1/sponsor-application-policy": apiError(404, "not_found"),
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

const queue = (answer: Answer, text: string, permissions = REVIEWER) =>
  story(
    permissions,
    { "/api/v1/admin/sponsor-applications": answer },
    () => <ReviewQueue />,
    async ({ canvasElement }) => {
      await expect(await findText(canvasElement, text)).toBeVisible();
    },
  );

export const QueueReady = queue(
  ok({
    applications: [row(0, "submitted"), row(1, "under_review"), row(2, "changes_requested")],
    next_cursor: "next",
  }),
  "Haymaker GmbH",
);
QueueReady.name = "AS1 · ready";

export const QueueEmpty = queue(
  ok({ applications: [], next_cursor: null }),
  "No applications match",
);
QueueEmpty.name = "AS1 · empty";

export const QueueError = queue(apiError(500, "internal_error"), "We couldn’t load this");
QueueError.name = "AS1 · error";

export const QueueRestricted = queue(
  apiError(403, "forbidden"),
  "You don’t have access to this section",
  [],
);
QueueRestricted.name = "AS1 · restricted";

const detail = (
  answer: Answer,
  text: string,
  permissions = REVIEWER,
  play?: StoryObj["play"],
  extra: Record<string, Answer | Answer[]> = {},
) =>
  story(
    permissions,
    { [`/api/v1/admin/sponsor-applications/${ID}`]: answer, ...extra },
    () => <ReviewDetail applicationId={ID} />,
    play ??
      (async ({ canvasElement }) => {
        await expect(await findText(canvasElement, text)).toBeVisible();
      }),
    `/en/admin/sponsors/${ID}`,
  );

export const DetailSubmitted = detail(
  application({ status: "submitted", history: [] }),
  "Nobody has claimed this yet.",
);
DetailSubmitted.name = "AS2 · submitted (claim)";

export const DetailUnderReview = detail(application(), "Submitted answers");
DetailUnderReview.name = "AS2 · under review";

export const DetailReadOnly = detail(
  application(),
  "Some actions aren’t shown: your permissions don’t include them.",
  ["sponsors.applications.read"],
);
DetailReadOnly.name = "AS2 · read only (no decision permissions)";

export const DetailChangesRequested = detail(
  application({
    status: "changes_requested",
    change_request: {
      reason_code: "missing_information",
      fields: ["goals"],
      message: "Tell us which events you'd like to support.",
      requested_at: "2026-11-02T10:00:00Z",
    },
  }),
  "Open change request",
);
DetailChangesRequested.name = "AS2 · changes requested";

export const DetailApproved = detail(
  application({
    status: "approved",
    decided_at: "2026-11-03T10:00:00Z",
    organization: { sponsor_id: ORG, status: "active" },
  }),
  "Suspend organization",
);
DetailApproved.name = "AS2 · approved, organization active";

export const DetailSuspended = detail(
  application({
    status: "approved",
    decided_at: "2026-11-03T10:00:00Z",
    organization: { sponsor_id: ORG, status: "suspended" },
  }),
  "Reinstate organization",
);
DetailSuspended.name = "AS2 · approved, organization suspended";

export const DetailRejected = detail(
  application({ status: "rejected", decided_at: "2026-11-03T10:00:00Z" }),
  "Rejected. Decisions don’t reopen.",
);
DetailRejected.name = "AS2 · rejected";

export const DetailParty = detail(
  application({ viewer_is_party: true }),
  "You can’t review this application: you’re a party to it. Another operator must decide.",
);
DetailParty.name = "AS2 · you're a party";

export const DetailNotFound = detail(apiError(404, "not_found"), "No such application");
DetailNotFound.name = "AS2 · not found";

export const ApprovePreview = detail(
  application(),
  "",
  REVIEWER,
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Approve" }, { timeout: 5000 }),
    );
    const box = await within(document.body).findByRole("dialog");
    await userEvent.click(within(box).getByRole("button", { name: "Review" }));
    await expect(await within(box).findByText("The organization is created")).toBeVisible();
  },
  { [`POST /api/v1/admin/sponsor-applications/${ID}/approve/preview`]: preview },
);
ApprovePreview.name = "AS2 · approve: confirm";

export const RejectConflict = detail(
  application(),
  "",
  REVIEWER,
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Reject…" }, { timeout: 5000 }),
    );
    const box = await within(document.body).findByRole("dialog");
    await userEvent.click(within(box).getByRole("combobox", { name: /Reason code/ }));
    await userEvent.click(
      await within(document.body).findByRole("option", { name: "Not a business" }),
    );
    await userEvent.click(within(box).getByRole("button", { name: "Review" }));
    await expect(await within(box).findByRole("alert")).toBeVisible();
  },
  {
    [`POST /api/v1/admin/sponsor-applications/${ID}/reject/preview`]: apiError(409, "conflict"),
  },
);
RejectConflict.name = "AS2 · reject: conflict";

export const RequestChanges = detail(application(), "", REVIEWER, async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(
    await canvas.findByRole("button", { name: "Request changes" }, { timeout: 5000 }),
  );
  const box = await within(document.body).findByRole("dialog");
  await expect(
    within(box).getByRole("textbox", { name: /Message to the applicant/ }),
  ).toBeVisible();
});
RequestChanges.name = "AS2 · request changes";

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

const meta = {
  title: "Control Plane/Sponsor review",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;
