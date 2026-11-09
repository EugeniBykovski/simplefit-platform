import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, userEvent, within } from "storybook/test";

import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import type { SponsorApplication } from "@/entities/sponsor-application";
import { Button } from "@/shared/ui/button";
import { SponsorApplicationFlow, SubmittedPanel } from "@/widgets/sponsor-application";

/*
 * The sponsor application (SF-115; Claude Design SPA0, SPA1 / SP1–SP7 and
 * review, SP9, SPX5 at canvas 1794214317-c2e0): the production widget on a
 * deterministic stand-in of the SF-113 / SF-114 API (`fetch` is replaced per
 * story; nothing reaches a backend or storage). The screen comes from
 * `?step=`, as on the route; states reached by interaction use a play
 * function through the real components. The company and its answers are
 * fixtures of the stand-in only: no real brand, figure or logo.
 */

const ID = "5b0c3d0e-4a1b-4c2d-9e8f-0a1b2c3d4e5f";
const DECLARATION = {
  available: true,
  document_id: "sponsor-application-declaration",
  version: "storybook-1",
  languages: ["en"],
};
const UPLOADS_OFF: SponsorApplication["uploads"] = {
  available: false,
  reason: "file_scanning_unavailable",
  content_types: [],
  max_bytes: 0,
  max_documents: 0,
  kinds: [],
  scanned: false,
};
const UPLOADS_ON: SponsorApplication["uploads"] = {
  available: true,
  reason: null,
  content_types: ["application/pdf", "image/jpeg", "image/png"],
  max_bytes: 10485760,
  max_documents: 5,
  kinds: ["logo", "brand_deck", "campaign_brief", "other"],
  scanned: false,
};

const policy = (uploads = UPLOADS_OFF, declaration = DECLARATION) => ({
  policy: {
    version: "sponsor-application-2026-11.v1",
    steps: [
      { step: "company", fields: ["company_name", "website", "country_code", "industry"] },
      {
        step: "contact",
        fields: ["contact_full_name", "contact_position", "contact_email", "contact_phone"],
      },
      { step: "interests", fields: ["interests"] },
      { step: "markets", fields: ["market_scope", "market_countries", "market_cities"] },
      { step: "budget", fields: ["budget_band"] },
      { step: "goals", fields: ["goals"] },
    ],
    required: [
      "company_name",
      "country_code",
      "industry",
      "contact_full_name",
      "contact_position",
      "contact_email",
      "interests",
      "market_scope",
      "budget_band",
      "goals",
    ],
    industries: [
      "boxing_equipment",
      "sports_apparel",
      "nutrition",
      "recovery",
      "fitness_technology",
      "events",
      "other",
    ],
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
    budget_bands: [
      { code: "eur_under_5000", currency: "EUR", min: null, max: 5000 },
      { code: "eur_5000_20000", currency: "EUR", min: 5000, max: 20000 },
      { code: "eur_20000_50000", currency: "EUR", min: 20000, max: 50000 },
      { code: "eur_50000_100000", currency: "EUR", min: 50000, max: 100000 },
      { code: "eur_100000_plus", currency: "EUR", min: 100000, max: null },
      { code: "to_be_discussed", currency: "EUR", min: null, max: null },
    ],
    uploads,
    declaration,
  },
});

const ANSWERS = {
  company_name: "Example Brand Sp. z o.o.",
  website: "https://brand.example",
  country_code: "PL",
  industry: "nutrition",
  contact_full_name: "Ada Example",
  contact_position: "Brand lead",
  contact_email: "ada@brand.example",
  contact_phone: null,
  interests: ["sponsored_events", "gym_partnerships"],
  market_scope: "countries",
  market_countries: ["PL", "CZ"],
  market_cities: ["Warsaw"],
  budget_band: "to_be_discussed",
  goals: "Support amateur boxing events in Poland and Czechia.",
};
const SUBMISSION = {
  submission_id: "c1d2e3f4-0000-4000-8000-000000000001",
  sequence: 1,
  submitted_at: "2026-11-09T11:00:00Z",
  policy_version: "sponsor-application-2026-11.v1",
};

function application(fields: Record<string, unknown> = {}) {
  return {
    application: {
      application_id: ID,
      status: "draft",
      revision: 6,
      answers: ANSWERS,
      contact_email_verified: false,
      missing_fields: [],
      allowed_actions: ["edit", "submit"],
      submit_blockers: [],
      submitted_at: null,
      submissions: [],
      declaration: DECLARATION,
      uploads: UPLOADS_OFF,
      evidence: [],
      change_request: null,
      sponsor_id: null,
      created_at: "2026-11-09T10:00:00Z",
      updated_at: "2026-11-09T10:40:00Z",
      ...fields,
    },
  };
}
const review = (status: string, fields: Record<string, unknown> = {}) =>
  application({
    status,
    allowed_actions: [],
    submitted_at: SUBMISSION.submitted_at,
    submissions: [SUBMISSION],
    ...fields,
  });
const CHANGES = {
  status: "changes_requested",
  allowed_actions: ["edit", "submit"],
  submissions: [SUBMISSION],
  submitted_at: SUBMISSION.submitted_at,
  change_request: {
    fields: ["goals"],
    message: "Which events would you like to support, and where?",
    reason_code: "unclear_answers",
    requested_at: "2026-11-10T09:00:00Z",
  },
};

const signedIn = { "/api/me": ok({ user: VIEWER }), "/api/auth/session/refresh": ok(SESSION) };
const signedOut = { "/api/auth/session/refresh": apiError(401, "unauthorized") };
const entry = (destination = "role_selection") =>
  ok({
    entry: { destination, mandatory: destination === "account_registration", capabilities: [] },
  });
const legal = ok({
  document: {
    checkbox:
      "I’m authorized to apply for this business, and I’ve read the privacy notice. (Storybook stand-in text.)",
    full: "# Declaration\n\nStorybook stand-in text, not the published declaration.",
    language: "en",
  },
});

function api(app: Answer, extra: Record<string, Answer | Answer[]> = {}, uploads = UPLOADS_OFF) {
  return {
    ...signedIn,
    "/api/v1/me/entry": entry(),
    "/api/v1/sponsor-application-policy": ok(policy(uploads)),
    "GET /api/v1/me/sponsor-application": app,
    "/api/v1/me/sponsor-organizations": ok({ organizations: [] }),
    "/api/v1/legal-documents/sponsor-application-declaration/versions/storybook-1": legal,
    ...extra,
  };
}

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

function story(
  step: string,
  routes: Record<string, Answer | Answer[]>,
  play?: StoryObj["play"],
): StoryObj {
  return {
    parameters: {
      nextjs: {
        appDirectory: true,
        navigation: { pathname: "/en/partners/apply", query: { step } },
      },
    },
    beforeEach: () => installApi(routes),
    render: () => <SponsorApplicationFlow />,
    play,
  };
}

const meta = {
  title: "Sponsor Application/Application",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const heading = (canvasElement: HTMLElement, name: string) =>
  within(canvasElement).findByRole("heading", { level: 1, name });
const notFound = apiError(404, "not_found");

/* ── SPA0 · entry and account continuation ─────────────────────────── */

export const EntrySignedOut = story("start", signedOut, async ({ canvasElement }) => {
  await heading(canvasElement, "Sign in to start your application");
});
EntrySignedOut.name = "SPA0 · signed out";

export const EntryRegistration = story(
  "start",
  { ...api(notFound), "/api/v1/me/entry": entry("account_registration") },
  async ({ canvasElement }) => {
    await heading(canvasElement, "First, finish your account");
  },
);
EntryRegistration.name = "SPA0 · finish account first";

export const EntryReady = story("start", api(notFound), async ({ canvasElement }) => {
  await heading(canvasElement, "You’re ready to start");
});
EntryReady.name = "SPA0 · ready";

export const EntryResume = story(
  "start",
  api(ok(application({ missing_fields: ["budget_band", "goals"] }))),
  async ({ canvasElement }) => {
    await heading(canvasElement, "Continue your application?");
  },
);
EntryResume.name = "SPA0 · resume a draft";

export const EntryExists = story(
  "start",
  api(ok(review("submitted"))),
  async ({ canvasElement }) => {
    await heading(canvasElement, "You’ve already applied");
  },
);
EntryExists.name = "SPA0 · already applied";

export const EntryError = story(
  "start",
  { ...signedIn, "/api/v1/me/entry": "offline" },
  async ({ canvasElement }) => {
    await heading(canvasElement, "We couldn’t check your account");
  },
);
EntryError.name = "SPA0 · error";

/* ── SPA1 · the form ───────────────────────────────────────────────── */

export const CompanyEmpty = story("company", api(notFound), async ({ canvasElement }) => {
  await heading(canvasElement, "Company");
});
CompanyEmpty.name = "SP1 · company, empty";

export const CompanyInvalid = story("company", api(notFound), async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await heading(canvasElement, "Company");
  await userEvent.click(canvas.getByRole("button", { name: "Save and continue" }));
  await expect(await canvas.findByText("3 answers to check")).toBeVisible();
});
CompanyInvalid.name = "SP1 · validation summary";

export const ContactSaving = story(
  "contact",
  api(ok(application()), { "PATCH /api/v1/me/sponsor-application": "pending" }),
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const name = await canvas.findByRole("textbox", { name: /Full name/ });
    await userEvent.type(name, " Jr");
    await userEvent.click(canvas.getByRole("button", { name: "Save and continue" }));
    await expect(await canvas.findByText("Saving…")).toBeVisible();
  },
);
ContactSaving.name = "SP2 · saving";

export const ContactSaveFailed = story(
  "contact",
  api(ok(application()), { "PATCH /api/v1/me/sponsor-application": "offline" }),
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByRole("textbox", { name: /Position/ }), "!");
    await userEvent.click(canvas.getByRole("button", { name: "Save and continue" }));
    await expect(await canvas.findByText("We couldn’t save your last change.")).toBeVisible();
  },
);
ContactSaveFailed.name = "SP2 · save failed";

export const InterestsSaved = story(
  "interests",
  api(ok(application())),
  async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("Saved to your account")).toBeVisible();
  },
);
InterestsSaved.name = "SP3 · saved";

export const Markets = story("markets", api(ok(application())));
Markets.name = "SP4 · markets";

export const Budget = story("budget", api(ok(application())));
Budget.name = "SP5 · estimated budget";

export const GoalsStale = story(
  "goals",
  api(ok(application()), {
    "PATCH /api/v1/me/sponsor-application": {
      status: 409,
      body: {
        error: {
          code: "revision_conflict",
          message: "storybook",
          details: { current_revision: 7 },
        },
      },
    },
  }),
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      await canvas.findByRole("textbox", { name: /Your goals/ }),
      " And clinics.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Save and continue" }));
    await expect(await canvas.findByText("This draft changed somewhere else.")).toBeVisible();
  },
);
GoalsStale.name = "SP6 · changed elsewhere (stale)";

export const UploadsUnavailable = story("uploads", api(ok(application())));
UploadsUnavailable.name = "SP7 · uploads unavailable (D-SA09)";

export const UploadsWithDocuments = story(
  "uploads",
  api(
    ok(
      application({
        uploads: UPLOADS_ON,
        evidence: [
          {
            evidence_id: "e1000000-0000-4000-8000-000000000001",
            kind: "brand_deck",
            status: "uploaded",
            file_name: "brand-deck.pdf",
            content_type: "application/pdf",
            byte_size: 1843200,
            uploaded_at: "2026-11-09T10:30:00Z",
            submitted: false,
            scanned: false,
          },
          {
            evidence_id: "e1000000-0000-4000-8000-000000000002",
            kind: "campaign_brief",
            status: "pending_upload",
            file_name: "brief.pdf",
            content_type: "application/pdf",
            byte_size: 20480,
            uploaded_at: null,
            submitted: false,
            scanned: false,
          },
        ],
      }),
    ),
    {},
    UPLOADS_ON,
  ),
);
UploadsWithDocuments.name = "SP7 · uploaded and unfinished documents";

export const UploadFailed = story(
  "uploads",
  api(
    ok(application({ uploads: UPLOADS_ON })),
    {
      "POST /api/v1/me/sponsor-application/evidence": {
        status: 503,
        body: { error: { code: "service_unavailable", message: "storybook", details: {} } },
      },
    },
    UPLOADS_ON,
  ),
  async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Brand deck");
    const input = canvasElement.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) throw new Error("no file input");
    await userEvent.upload(input, new File(["%PDF-1.4"], "deck.pdf", { type: "application/pdf" }));
    await expect(await canvas.findByText(/File storage isn’t available right now/)).toBeVisible();
  },
);
UploadFailed.name = "SP7 · upload failed";

export const ReviewReady = story("review", api(ok(application())), async ({ canvasElement }) => {
  await heading(canvasElement, "Review and submit");
});
ReviewReady.name = "Review · ready";

export const ReviewMissing = story(
  "review",
  api(ok(application({ missing_fields: ["goals"], submit_blockers: ["incomplete"] }))),
);
ReviewMissing.name = "Review · answers missing";

export const ReviewClosed = story(
  "review",
  api(
    ok(
      application({
        declaration: { ...DECLARATION, available: false, version: null, languages: [] },
        submit_blockers: ["declaration_unavailable"],
      }),
    ),
  ),
);
ReviewClosed.name = "Review · submissions closed";

const accept = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole("checkbox", { name: /authorized/ }));
  await userEvent.click(canvas.getByRole("button", { name: "Submit application" }));
  return canvas;
};

export const Submitting = story(
  "review",
  api(ok(application()), { "POST /api/v1/me/sponsor-application/submit": "pending" }),
  async ({ canvasElement }) => {
    const canvas = await accept(canvasElement);
    await expect(await canvas.findByRole("button", { name: "Submitting…" })).toBeDisabled();
  },
);
Submitting.name = "Review · submitting";

export const SubmitFailed = story(
  "review",
  api(ok(application()), {
    "POST /api/v1/me/sponsor-application/submit": apiError(500, "internal_error"),
  }),
  async ({ canvasElement }) => {
    const canvas = await accept(canvasElement);
    await expect(await canvas.findByText("We couldn’t submit your application.")).toBeVisible();
  },
);
SubmitFailed.name = "Review · submit failed";

export const ChangesRequested = story(
  "goals",
  api(ok(application(CHANGES))),
  async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/Which events would you like/),
    ).toBeVisible();
  },
);
ChangesRequested.name = "SP6 · correcting requested answers";

export const Resubmit = story(
  "review",
  api(ok(application(CHANGES))),
  async ({ canvasElement }) => {
    await within(canvasElement).findByRole("button", { name: "Send back to SimpleFit" });
  },
);
Resubmit.name = "Review · resubmit";

/* ── SP9 and SPX5 ──────────────────────────────────────────────────── */

/** SP9 is reached only through a confirmed submission; drawn here with the backend's answer. */
export const Submitted: StoryObj = {
  render: () => (
    <div className="px-4 py-10 sm:px-6 lg:px-16">
      <SubmittedPanel
        application={review("submitted").application as unknown as SponsorApplication}
        actions={
          <>
            <Button size="lg">View application</Button>
            <Button size="lg" variant="quiet">
              Back to SimpleFit
            </Button>
          </>
        }
      />
    </div>
  ),
};
Submitted.name = "SP9 · submitted (after the backend's answer)";

export const StatusSubmitted = story("status", api(ok(review("submitted"))));
StatusSubmitted.name = "SPX5 · submitted";

export const StatusUnderReview = story("status", api(ok(review("under_review"))));
StatusUnderReview.name = "SPX5 · under review";

export const StatusChangesRequested = story("status", api(ok(application(CHANGES))));
StatusChangesRequested.name = "SPX5 · changes requested";

export const StatusApproved = story(
  "status",
  api(ok(review("approved", { sponsor_id: "9a9a9a9a-0000-4000-8000-000000000009" }))),
);
StatusApproved.name = "SPX5 · approved (no approval exists in the API yet)";

export const StatusDraft = story("status", api(ok(application({ missing_fields: ["goals"] }))));
StatusDraft.name = "SPX5 · draft";
