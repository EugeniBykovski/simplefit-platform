import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as SessionModule from "@/entities/session";
import type { SponsorApplication } from "@/entities/sponsor-application";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { decide, SponsorApplicationFlow } from "./sponsor-application";

/*
 * The SF-115 guardrails of the sponsor application on `web.partners.apply`:
 * nothing is created by visiting or signing in, the first save creates the
 * draft with one key, a stale revision never overwrites and never loses
 * input, the backend's missing answers stop "Save and continue", a
 * submission is shown only once the backend confirmed it (a lost answer is
 * reconciled by reading the application, never by submitting again), and a
 * submitted application opens its status, never a form or a workspace.
 */

const session = vi.hoisted(() => ({
  current: {
    status: "authenticated",
    viewer: { id: "user-a", created_at: "2026-11-01T00:00:00Z" },
  } as {
    status: string;
    viewer?: { id: string; created_at: string };
    ended?: string;
  },
}));
vi.mock("@/entities/session", async (importOriginal) => ({
  ...(await importOriginal<typeof SessionModule>()),
  useSession: () => session.current,
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer sfa_test" } }),
  restoreSession: vi.fn(async () => "authenticated"),
  signOut: vi.fn(async () => "revoked"),
}));

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), search: "" }));
vi.mock("@/shared/i18n/navigation", () => ({
  useRouter: () => router,
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(router.search) }));

const API = "http://api.test";
const ID = "11111111-1111-4111-8111-111111111111";

const policy = {
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
  industries: ["boxing_equipment", "nutrition", "other"],
  interests: ["sponsored_events", "content"],
  scopes: ["global", "countries", "cities"],
  budget_bands: [
    { code: "eur_under_5000", currency: "EUR", min: null, max: 5000 },
    { code: "to_be_discussed", currency: "EUR", min: null, max: null },
  ],
  uploads: {
    available: false,
    reason: "file_scanning_unavailable",
    content_types: [],
    max_bytes: 0,
    max_documents: 0,
    kinds: [],
    scanned: false,
  },
  declaration: {
    available: true,
    document_id: "sponsor-application-declaration",
    version: "test-1",
    languages: ["en"],
  },
};

const complete: SponsorApplication["answers"] = {
  company_name: "Acme",
  website: null,
  country_code: "PL",
  industry: "nutrition",
  contact_full_name: "Ada Lovelace",
  contact_position: "Brand lead",
  contact_email: "ada@acme.example",
  contact_phone: null,
  interests: ["content"],
  market_scope: "global",
  market_countries: [],
  market_cities: [],
  budget_band: "to_be_discussed",
  goals: "Support amateur events.",
};

function app(overrides: Partial<SponsorApplication> = {}): SponsorApplication {
  return {
    application_id: ID,
    status: "draft",
    revision: 4,
    answers: { ...complete },
    contact_email_verified: false,
    missing_fields: [],
    allowed_actions: ["edit", "submit"],
    submit_blockers: [],
    submitted_at: null,
    submissions: [],
    declaration: policy.declaration,
    uploads: policy.uploads,
    evidence: [],
    change_request: null,
    sponsor_id: null,
    created_at: "2026-11-09T10:00:00Z",
    updated_at: "2026-11-09T10:00:00Z",
    ...overrides,
  } as SponsorApplication;
}

const submitted = (overrides: Partial<SponsorApplication> = {}) =>
  app({
    status: "submitted",
    allowed_actions: [],
    submitted_at: "2026-11-09T11:00:00Z",
    submissions: [
      {
        submission_id: "s1",
        sequence: 1,
        submitted_at: "2026-11-09T11:00:00Z",
        policy_version: policy.version,
      },
    ],
    ...overrides,
  });

const error = (status: number, code: string, details: Record<string, unknown> = {}) =>
  jsonResponse({ error: { code, message: "ignored", details } }, { status });

type Handler = (body: unknown) => Response | Promise<Response>;
type Call = { key: string; body: unknown; headers: Headers };

/** Answers each `METHOD /path` with its queue of handlers (the last one repeats). */
function api(routes: Record<string, Handler | Handler[]>) {
  const calls: Call[] = [];
  const queues = Object.fromEntries(
    Object.entries(routes).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : [value],
    ]),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const path = url.replace(API, "").split("?")[0] ?? "";
      const key = `${init.method ?? "GET"} ${path}`;
      const body = init.body === undefined ? undefined : (JSON.parse(String(init.body)) as unknown);
      calls.push({ key, body, headers: new Headers(init.headers) });
      const queue = queues[key];
      if (queue === undefined) throw new Error(`unexpected request ${key}`);
      const handler = queue.length > 1 ? queue.shift() : queue[0];
      return (handler as Handler)(body);
    }),
  );
  return calls;
}

const entry =
  (destination = "role_selection") =>
  () =>
    jsonResponse({
      entry: { destination, mandatory: destination === "account_registration", capabilities: [] },
    });
const signedIn = (
  application: SponsorApplication | null,
  extra: Record<string, Handler | Handler[]> = {},
) => ({
  "GET /api/v1/me/entry": entry(),
  "GET /api/v1/sponsor-application-policy": () => jsonResponse({ policy }),
  "GET /api/v1/me/sponsor-application": () =>
    application === null ? error(404, "not_found") : jsonResponse({ application }),
  "GET /api/v1/me/sponsor-organizations": () => jsonResponse({ organizations: [] }),
  ...extra,
});

const writes = (calls: Call[]) => calls.filter((call) => !call.key.startsWith("GET"));

beforeEach(() => {
  session.current = {
    status: "authenticated",
    viewer: { id: "user-a", created_at: "2026-11-01T00:00:00Z" },
  };
  router.search = "";
  router.push.mockClear();
  router.replace.mockClear();
});

describe("entry (SPA0)", () => {
  it("asks a signed-out visitor to sign in, returning here, and calls no sponsor endpoint", async () => {
    session.current = { status: "anonymous" };
    router.search = "step=company";
    const calls = api({});
    await renderWithProviders(<SponsorApplicationFlow />);

    expect(
      screen.getByRole("heading", { name: "Sign in to start your application" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Continue with Email/ })).toHaveAttribute(
      "href",
      `/login?returnTo=${encodeURIComponent("/partners/apply?step=company")}`,
    );
    expect(calls).toEqual([]);
  });

  it("says a session ended rather than asking to start", async () => {
    session.current = { status: "anonymous", ended: "expired" };
    api({});
    await renderWithProviders(<SponsorApplicationFlow />);
    expect(screen.getByRole("heading", { name: "You’ve been signed out" })).toBeVisible();
  });

  it("sends an unfinished account to account registration first", async () => {
    router.search = "step=start";
    const calls = api({ ...signedIn(null), "GET /api/v1/me/entry": entry("account_registration") });
    await renderWithProviders(<SponsorApplicationFlow />);

    expect(
      await screen.findByRole("heading", { name: "First, finish your account" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Finish account setup" })).toHaveAttribute(
      "href",
      `/app/onboarding/account?returnTo=${encodeURIComponent("/partners/apply?step=start")}`,
    );
    expect(calls.map((call) => call.key)).toEqual(["GET /api/v1/me/entry"]);
  });

  it("offers to start without creating anything; a draft resumes where answers are missing", async () => {
    router.search = "step=start";
    const calls = api(signedIn(null));
    const { unmount } = await renderWithProviders(<SponsorApplicationFlow />);
    await userEvent.click(await screen.findByRole("button", { name: "Start application" }));
    expect(router.push).toHaveBeenCalledWith("/partners/apply?step=company");
    expect(writes(calls)).toEqual([]);
    unmount();

    api(signedIn(app({ missing_fields: ["budget_band", "goals"] })));
    await renderWithProviders(<SponsorApplicationFlow />);
    await userEvent.click(await screen.findByRole("button", { name: "Continue draft" }));
    expect(router.push).toHaveBeenLastCalledWith("/partners/apply?step=budget");
  });

  it("an existing submission opens its status, and a form URL is corrected to it", async () => {
    router.search = "step=goals";
    api(signedIn(submitted()));
    await renderWithProviders(<SponsorApplicationFlow />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/partners/apply?step=status"));
  });
});

describe("form (SPA1)", () => {
  it("creates the draft on the first save with one key, then stops on the backend's missing answers", async () => {
    router.search = "step=company";
    const created = app({
      revision: 1,
      answers: { ...complete, country_code: null, industry: null },
      missing_fields: ["country_code", "industry", "goals"],
    });
    const calls = api(
      signedIn(null, {
        "PATCH /api/v1/me/sponsor-application": [
          () => Promise.reject(new TypeError("Failed to fetch")),
          () => jsonResponse({ application: created }),
        ],
      }),
    );
    await renderWithProviders(<SponsorApplicationFlow />);

    await userEvent.type(await screen.findByRole("textbox", { name: /Company name/ }), "Acme");
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("We couldn’t save your last change.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    const summary = (await screen.findByText("2 answers to check")).closest(
      "[role=alert]",
    ) as HTMLElement;
    expect(summary).toHaveFocus();
    expect(screen.queryByText("We couldn’t save your last change.")).toBeNull();
    expect(within(summary).getByRole("link", { name: "Choose a country." })).toBeVisible();
    expect(router.push).not.toHaveBeenCalled();

    const [first, retry] = writes(calls);
    expect(first?.body).toMatchObject({ company_name: "Acme" });
    expect(first?.body).not.toHaveProperty("expected_revision");
    const key = (first?.body as { client_request_id: string }).client_request_id;
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect((retry?.body as { client_request_id: string }).client_request_id).toBe(key);
  });

  it("a stale revision re-reads the application and keeps the visitor's edit", async () => {
    router.search = "step=goals";
    const newer = app({ revision: 5, answers: { ...complete, goals: "Changed in another tab." } });
    const calls = api(
      signedIn(app(), {
        "PATCH /api/v1/me/sponsor-application": () =>
          error(409, "revision_conflict", { current_revision: 5 }),
        "GET /api/v1/me/sponsor-application": [
          () => jsonResponse({ application: app() }),
          () => jsonResponse({ application: newer }),
        ],
      }),
    );
    await renderWithProviders(<SponsorApplicationFlow />);

    const goals = await screen.findByRole("textbox", { name: /Your goals/ });
    await userEvent.clear(goals);
    await userEvent.type(goals, "My own words.");
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));

    expect(await screen.findByText("This draft changed somewhere else.")).toBeVisible();
    expect(goals).toHaveValue("My own words.");
    expect(writes(calls)[0]?.body).toEqual({ goals: "My own words.", expected_revision: 4 });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("after a change request only the requested answers can change", async () => {
    router.search = "step=goals";
    api(
      signedIn(
        app({
          status: "changes_requested",
          change_request: {
            fields: ["goals"],
            message: "Which events?",
            reason_code: "unclear_answers",
            requested_at: "2026-11-09T12:00:00Z",
          },
          submissions: [
            {
              submission_id: "s1",
              sequence: 1,
              submitted_at: "2026-11-09T11:00:00Z",
              policy_version: policy.version,
            },
          ],
        }),
      ),
    );
    await renderWithProviders(<SponsorApplicationFlow />);
    expect(await screen.findByText(/Which events\?/)).toBeVisible();
    expect(screen.getByRole("textbox", { name: /Your goals/ })).toBeEnabled();
  });
});

describe("submission", () => {
  const legal = () =>
    jsonResponse({
      document: {
        checkbox: "I’m authorized to apply for this business.",
        full: "# Declaration\n\nTest text.",
        language: "en",
      },
    });

  it("needs the declaration ticked, then submits once and shows SP9 only on the backend's answer", async () => {
    router.search = "step=review";
    const calls = api(
      signedIn(app(), {
        "GET /api/v1/legal-documents/sponsor-application-declaration/versions/test-1": legal,
        "POST /api/v1/me/sponsor-application/submit": () =>
          jsonResponse({ application: submitted() }),
      }),
    );
    await renderWithProviders(<SponsorApplicationFlow />);

    await userEvent.click(await screen.findByRole("button", { name: "Submit application" }));
    expect(screen.getByText("Confirm the declaration to submit.")).toBeVisible();
    expect(writes(calls)).toEqual([]);

    await userEvent.click(
      screen.getByRole("checkbox", { name: "I’m authorized to apply for this business." }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Submit application" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/partners/apply?step=submitted"));

    expect(writes(calls).map((call) => call.body)).toEqual([
      expect.objectContaining({
        expected_revision: 4,
        declaration_accepted: true,
        declaration_version: "test-1",
        declaration_language: "en",
        client_request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    ]);
  });

  it("a lost answer is reconciled by reading the application, never by submitting again", async () => {
    router.search = "step=review";
    const calls = api(
      signedIn(app(), {
        "GET /api/v1/legal-documents/sponsor-application-declaration/versions/test-1": legal,
        "POST /api/v1/me/sponsor-application/submit": () =>
          Promise.reject(new TypeError("Failed to fetch")),
        "GET /api/v1/me/sponsor-application": [
          () => jsonResponse({ application: app() }),
          () => jsonResponse({ application: submitted() }),
        ],
      }),
    );
    await renderWithProviders(<SponsorApplicationFlow />);

    await userEvent.click(await screen.findByRole("checkbox", { name: /authorized/ }));
    await userEvent.click(screen.getByRole("button", { name: "Submit application" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/partners/apply?step=submitted"));
    expect(writes(calls)).toHaveLength(1);
  });

  it("a failed submission that didn't happen says nothing was sent and retries with the same key", async () => {
    router.search = "step=review";
    const calls = api(
      signedIn(app(), {
        "GET /api/v1/legal-documents/sponsor-application-declaration/versions/test-1": legal,
        "POST /api/v1/me/sponsor-application/submit": [
          () => error(500, "internal_error"),
          () => jsonResponse({ application: submitted() }),
        ],
      }),
    );
    await renderWithProviders(<SponsorApplicationFlow />);

    await userEvent.click(await screen.findByRole("checkbox", { name: /authorized/ }));
    await userEvent.click(screen.getByRole("button", { name: "Submit application" }));
    expect(await screen.findByText("We couldn’t submit your application.")).toBeVisible();
    expect(router.push).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/partners/apply?step=submitted"));
    const [first, second] = writes(calls).map(
      (call) => (call.body as { client_request_id: string }).client_request_id,
    );
    expect(second).toBe(first);
  });

  it("closed submissions are said, and the button is disabled", async () => {
    router.search = "step=review";
    const closed = { ...policy.declaration, available: false, version: null, languages: [] };
    api(signedIn(app({ declaration: closed, submit_blockers: ["declaration_unavailable"] })));
    await renderWithProviders(<SponsorApplicationFlow />);
    expect(await screen.findByText("Applications can’t be submitted yet.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Submit application" })).toBeDisabled();
  });
});

describe("status (SPX5)", () => {
  it("shows the backend's status and answers, with no edit or workspace action", async () => {
    router.search = "step=status";
    api(signedIn(submitted()));
    await renderWithProviders(<SponsorApplicationFlow />);

    expect(
      await screen.findByRole("heading", { name: "We’ve received your application" }),
    ).toBeVisible();
    expect(screen.getByText("Acme")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Open workspace" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Update answers|Continue draft/ })).toBeNull();
  });

  it("decides screens from the backend's application, never from the URL", () => {
    expect(decide("review", null, null)).toBe("review");
    expect(decide("submitted", null, null)).toBe("start");
    expect(decide("company", submitted(), null)).toBe("status");
    expect(decide("submitted", submitted(), null)).toBe("status");
    expect(decide("submitted", submitted(), submitted())).toBe("submitted");
    expect(decide("goals", app({ status: "changes_requested" }), null)).toBe("goals");
  });
});
