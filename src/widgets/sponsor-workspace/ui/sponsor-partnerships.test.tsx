import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  SponsorOrganizationResponse,
  SponsorPartnershipProposal,
} from "@/shared/api/generated/model";
import { locales } from "@/shared/i18n/routing";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { requestFilter } from "../model/requests";
import { SponsorInterestsView } from "./sponsor-interests";
import { SponsorOpportunitiesView } from "./sponsor-opportunities";
import { SponsorRequestDetailView } from "./sponsor-request-detail";
import { SponsorRequestNewView } from "./sponsor-request-new";
import { SponsorRequestsView } from "./sponsor-requests";

/*
 * SF-131: the partnership pages of the partner portal on the SF-130 API, with
 * the network mocked at `fetch` (component tests, not a backend). Everything
 * shown is the API's answer; every write names the revision it read and only
 * the actions the backend allows are offered.
 */

const push = vi.fn();
const replace = vi.fn();
vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  SessionChangedError: class SessionChangedError extends Error {},
}));
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={`/en${href}`} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push, replace }),
  usePathname: () => "/sponsor",
}));

const ORG = "4c2e8a1d-6b3f-4e7a-9c5d-2f1b8e3a7d60";
const OTHER = "7e1d3b5f-9a2c-4d8e-b6f0-3a5c7e9b1d24";
const P1 = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const BASE = `/api/v1/sponsor-organizations/${ORG}`;

type Role = "owner" | "manager" | "member";

const access = (
  role: Role = "owner",
  status: "active" | "suspended" = "active",
): SponsorOrganizationResponse => ({
  organization: {
    sponsor_id: ORG,
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

const POLICY = {
  policy: {
    version: "sponsor-partnership-2026-11.v1",
    interests: ["sponsored_events", "community_campaigns", "content"],
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
};

const proposal = (
  overrides: Partial<SponsorPartnershipProposal> = {},
): SponsorPartnershipProposal => ({
  proposal_id: P1,
  sponsor_id: ORG,
  kind: "general_inquiry",
  status: "draft",
  revision: 2,
  binding: false,
  answers: {
    title: "Spring events",
    interests: ["sponsored_events"],
    market_scope: "countries",
    market_countries: ["PL"],
    market_cities: [],
    summary: "Amateur events in Warsaw.",
  },
  missing_fields: [],
  allowed_actions: { edit: true, submit: true, withdraw: true },
  change_request: null,
  submissions: [],
  history: [
    {
      from_status: null,
      to_status: "draft",
      occurred_at: "2026-11-12T10:00:00Z",
      actor: "sponsor_member",
    },
  ],
  created_by: { short_name: "Alex N.", is_viewer: true },
  created_at: "2026-11-12T10:00:00Z",
  updated_at: "2026-11-12T10:00:00Z",
  submitted_at: null,
  decided_at: null,
  withdrawn_at: null,
  ...overrides,
});

type Answer = { status: number; body?: unknown } | "network";
type Call = { method: string; path: string; body: unknown };

/** `fetch` answering `"METHOD /path"` (or `"/path"` for GET) from queues; records every call. */
function api(routes: Record<string, Answer[]>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const { pathname, search } = new URL(url);
      const method = (init.method ?? "GET").toUpperCase();
      const body = typeof init.body === "string" ? (JSON.parse(init.body) as unknown) : undefined;
      calls.push({ method, path: pathname + search, body });
      const queue = routes[method === "GET" ? pathname : `${method} ${pathname}`];
      if (!queue) throw new Error(`unexpected ${method} ${pathname}`);
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      if (answer === "network") return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve(
        answer.body === undefined
          ? new Response(null, { status: answer.status })
          : jsonResponse(answer.body, { status: answer.status }),
      );
    }),
  );
  return calls;
}
const ok = (body: unknown) => ({ status: 200, body });
const error = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  body: { error: { code, message: "x", details } },
});

const user = userEvent.setup();
afterEach(() => {
  vi.unstubAllGlobals();
  push.mockReset();
  replace.mockReset();
});

const preferences = (saved: boolean, canEdit: boolean) => ({
  sponsor_id: ORG,
  preferences: saved
    ? {
        revision: 3,
        interests: ["content"],
        market_scope: "global",
        market_countries: [],
        market_cities: [],
        goals: "Grow amateur boxing.",
        updated_at: "2026-11-12T10:00:00Z",
      }
    : null,
  application_answers: {
    submitted_at: "2026-11-09T10:00:00Z",
    policy_version: "sponsor-application-2026-11.v1",
    interests: ["sponsored_events"],
    market_scope: "countries",
    market_countries: ["PL", "DE"],
    market_cities: [],
    goals: "Support amateur events.",
  },
  can_edit: canEdit,
});

describe("partnership interests (SF-131)", () => {
  it("members read the current interests and the application's answers, with no edit", async () => {
    api({ [`${BASE}/partnership-preferences`]: [ok(preferences(true, false))] });
    await renderWithProviders(<SponsorInterestsView access={access("member")} />);
    const current = await screen.findByRole("region", { name: "Your current interests" });
    expect(within(current).getByText("Grow amateur boxing.")).toBeVisible();
    expect(
      within(current).getByText(
        "Owners and managers can change these while the organization is active.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    const application = screen.getByRole("region", { name: "From your application" });
    expect(within(application).getByText("Support amateur events.")).toBeVisible();
    expect(within(application).getByText("Poland and Germany")).toBeVisible();
    // No budget is shown (D-SA39): no band or amount from the application.
    expect(screen.queryByText(/€|EUR/)).toBeNull();
  });

  it("an owner adds interests at revision 0, sending only what changed", async () => {
    const calls = api({
      [`${BASE}/partnership-preferences`]: [
        ok(preferences(false, true)),
        ok(preferences(true, true)),
      ],
      "/api/v1/sponsor-partnership-policy": [ok(POLICY)],
      [`PATCH ${BASE}/partnership-preferences`]: [ok(preferences(true, true))],
    });
    await renderWithProviders(<SponsorInterestsView access={access("owner")} />);
    await user.click(await screen.findByRole("button", { name: "Add interests" }));
    await user.click(await screen.findByRole("checkbox", { name: "Content" }));
    await user.click(screen.getByRole("radio", { name: "Global" }));
    await user.click(screen.getByRole("button", { name: "Save interests" }));
    await waitFor(() =>
      expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({
        expected_revision: 0,
        interests: ["content"],
        market_scope: "global",
      }),
    );
    expect(await screen.findByText("Grow amateur boxing.")).toBeVisible();
  });

  it("a stale save says so, keeps nothing and offers the latest", async () => {
    api({
      [`${BASE}/partnership-preferences`]: [ok(preferences(true, true))],
      "/api/v1/sponsor-partnership-policy": [ok(POLICY)],
      [`PATCH ${BASE}/partnership-preferences`]: [
        error(409, "revision_conflict", { current_revision: 4 }),
      ],
    });
    await renderWithProviders(<SponsorInterestsView access={access("manager")} />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.clear(await screen.findByRole("textbox", { name: "Goals" }));
    await user.type(screen.getByRole("textbox", { name: "Goals" }), "New goals");
    await user.click(screen.getByRole("button", { name: "Save interests" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /changed this in the meantime\. Nothing was saved/,
    );
    expect(screen.getByRole("button", { name: "Load the latest" })).toBeVisible();
  });
});

describe("opportunities (SF-131, D-SA21)", () => {
  it("shows the backend's no-inventory answer and no opportunity or apply action", async () => {
    api({
      [`${BASE}/partnership-opportunities`]: [
        ok({ sponsor_id: ORG, availability: "unavailable", reason: "no_inventory" }),
      ],
    });
    await renderWithProviders(<SponsorOpportunitiesView access={access("member")} />);
    expect(
      await screen.findByRole("heading", { name: "No sponsorship opportunities" }),
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: /apply|partner now/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Partnership requests" })).toHaveAttribute(
      "href",
      `/en/sponsor/${ORG}/requests`,
    );
  });
});

describe("partnership requests (SF-131)", () => {
  const summary = (id: string, status: string, title: string | null) => ({
    proposal_id: id,
    kind: "general_inquiry",
    status,
    revision: 1,
    title,
    interests: [],
    change_request_open: status === "changes_requested",
    created_at: "2026-11-12T10:00:00Z",
    updated_at: "2026-11-12T10:00:00Z",
    submitted_at: status === "draft" ? null : "2026-11-12T11:00:00Z",
    decided_at: null,
    withdrawn_at: null,
  });

  it("lists this organization's requests by status, with New only when the backend allows", async () => {
    const calls = api({
      [`${BASE}/partnership-proposals`]: [
        ok({
          sponsor_id: ORG,
          proposals: [
            summary(P1, "changes_requested", "Spring events"),
            summary(OTHER, "rocketed", null),
          ],
          next_cursor: "c2",
          can_create: true,
        }),
        ok({ sponsor_id: ORG, proposals: [], next_cursor: null, can_create: true }),
      ],
    });
    await renderWithProviders(<SponsorRequestsView access={access("owner")} status={undefined} />);
    const list = await screen.findByRole("list", { name: "Requests" });
    expect(within(list).getByRole("link", { name: /Spring events/ })).toHaveAttribute(
      "href",
      `/en/sponsor/${ORG}/requests/${P1}`,
    );
    expect(within(list).getByText("Changes requested")).toBeVisible();
    // A status this client doesn't know is said to be unknown, never guessed.
    expect(within(list).getByText("Unknown status")).toBeVisible();
    expect(within(list).getByText("Untitled request")).toBeVisible();
    expect(screen.getByRole("link", { name: "New request" })).toBeVisible();
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(calls.at(-1)?.path).toContain("cursor=c2"));
  });

  it("a member gets the list read-only", async () => {
    api({
      [`${BASE}/partnership-proposals`]: [
        ok({ sponsor_id: ORG, proposals: [], next_cursor: null, can_create: false }),
      ],
    });
    await renderWithProviders(<SponsorRequestsView access={access("member")} status="submitted" />);
    expect(await screen.findByText("No requests with this status")).toBeVisible();
    expect(screen.queryByRole("link", { name: "New request" })).toBeNull();
    expect(screen.getByRole("link", { name: "Submitted" })).toHaveAttribute("aria-current", "page");
  });

  it("reads ?status= as a documented status only", () => {
    expect(requestFilter("under_review")).toBe("under_review");
    expect(requestFilter("approved")).toBeUndefined();
    expect(requestFilter(["draft", "submitted"])).toBeUndefined();
    expect(requestFilter(undefined)).toBeUndefined();
  });
});

describe("a new request (SF-131)", () => {
  it("is read-only for a member", async () => {
    api({ "/api/v1/sponsor-partnership-policy": [ok(POLICY)] });
    await renderWithProviders(<SponsorRequestNewView access={access("member")} />);
    expect(screen.getByRole("heading", { name: "You can’t start a request" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
  });

  it("is read-only while the organization is suspended", async () => {
    api({ "/api/v1/sponsor-partnership-policy": [ok(POLICY)] });
    await renderWithProviders(<SponsorRequestNewView access={access("owner", "suspended")} />);
    expect(screen.getByText("This organization is suspended.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save draft" })).toBeNull();
  });

  it("saves a draft once: a retry after a lost answer reuses its key", async () => {
    const calls = api({
      "/api/v1/sponsor-partnership-policy": [ok(POLICY)],
      [`POST ${BASE}/partnership-proposals`]: [
        "network",
        { status: 201, body: { proposal: proposal() } },
      ],
    });
    await renderWithProviders(<SponsorRequestNewView access={access("manager")} />);
    await user.type(await screen.findByRole("textbox", { name: /Title/ }), "Spring events");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Trying again is safe/);
    expect(replace).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/sponsor/${ORG}/requests/${P1}`));
    const posts = calls.filter((call) => call.method === "POST");
    expect(posts).toHaveLength(2);
    const [first, second] = posts.map(
      (call) => call.body as { client_request_id: string; title: string },
    );
    expect(first!.client_request_id).toBe(second!.client_request_id);
    expect(first!.title).toBe("Spring events");
  });

  it("shows the open limit refusal", async () => {
    api({
      "/api/v1/sponsor-partnership-policy": [ok(POLICY)],
      [`POST ${BASE}/partnership-proposals`]: [error(409, "conflict", { proposals: "open_limit" })],
    });
    await renderWithProviders(<SponsorRequestNewView access={access("owner")} />);
    await user.type(await screen.findByRole("textbox", { name: /Title/ }), "One more");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/limit of open requests/);
  });
});

describe("one request (SF-131)", () => {
  const render = (
    answer: { status: number; body?: unknown }[],
    role: Role = "owner",
    writes: Record<string, Answer[]> = {},
  ) => {
    const calls = api({
      [`${BASE}/partnership-proposals/${P1}`]: answer,
      "/api/v1/sponsor-partnership-policy": [ok(POLICY)],
      ...writes,
    });
    return {
      calls,
      ...renderWithProviders(<SponsorRequestDetailView access={access(role)} requestId={P1} />),
    };
  };

  it("submits at the revision read, then shows the backend's new state", async () => {
    const { calls } = render([ok({ proposal: proposal() })], "owner", {
      [`POST ${BASE}/partnership-proposals/${P1}/submit`]: [
        ok({
          proposal: proposal({
            status: "submitted",
            revision: 3,
            allowed_actions: { edit: false, submit: false, withdraw: true },
            submissions: [
              { submission_id: OTHER, sequence: 1, submitted_at: "2026-11-12T11:00:00Z" },
            ],
          }),
        }),
      ],
    });
    await user.click(await screen.findByRole("button", { name: "Submit to SimpleFit" }));
    expect(
      await screen.findByText("SimpleFit has your request. Nothing is agreed yet."),
    ).toBeVisible();
    const submit = calls.find((call) => call.method === "POST");
    expect(submit?.body).toMatchObject({ expected_revision: 2 });
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("can't submit while answers are missing, and says which", async () => {
    await render([ok({ proposal: proposal({ missing_fields: ["summary", "market_scope"] }) })]);
    expect(await screen.findByRole("button", { name: "Submit to SimpleFit" })).toBeDisabled();
    expect(screen.getByText("Before submitting, add: Summary and Markets")).toBeVisible();
  });

  it("shows SimpleFit's change request and allows only the requested answers", async () => {
    await render([
      ok({
        proposal: proposal({
          status: "changes_requested",
          change_request: {
            fields: ["summary"],
            message: "Which cities?",
            requested_at: "2026-11-12T12:00:00Z",
          },
          history: [
            {
              from_status: null,
              to_status: "draft",
              occurred_at: "2026-11-12T10:00:00Z",
              actor: "sponsor_member",
            },
            {
              from_status: "under_review",
              to_status: "changes_requested",
              occurred_at: "2026-11-12T12:00:00Z",
              actor: "simplefit",
            },
          ],
        }),
      }),
    ]);
    expect(await screen.findByText("Which cities?")).toBeVisible();
    expect(screen.getByText("Answers you can change: Summary")).toBeVisible();
    expect(screen.getByRole("button", { name: "Submit again" })).toBeVisible();
    expect(screen.getByText(/· SimpleFit/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("textbox", { name: /Title/ })).toHaveAttribute("readonly");
    expect(
      screen.getByRole("textbox", { name: /What would you like to explore/ }),
    ).not.toHaveAttribute("readonly");
  });

  it("withdraws only after confirming, and says when the status moved on", async () => {
    const { calls } = render(
      [
        ok({
          proposal: proposal({
            status: "under_review",
            allowed_actions: { edit: false, submit: false, withdraw: true },
          }),
        }),
      ],
      "owner",
      {
        [`POST ${BASE}/partnership-proposals/${P1}/withdraw`]: [
          error(409, "conflict", { proposal: "not_withdrawable", status: "accepted" }),
        ],
      },
    );
    await user.click(await screen.findByRole("button", { name: "Withdraw" }));
    const dialog = await screen.findByRole("dialog", { name: "Withdraw this request?" });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Withdraw request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/status changed in the meantime/);
    expect(screen.getByRole("button", { name: "Load the latest" })).toBeVisible();
  });

  it("explains acceptance without any commitment, and offers nothing a member can't do", async () => {
    await render(
      [
        ok({
          proposal: proposal({
            status: "accepted",
            decided_at: "2026-11-13T10:00:00Z",
            allowed_actions: { edit: false, submit: false, withdraw: false },
          }),
        }),
      ],
      "member",
    );
    expect(
      await screen.findByText(
        "SimpleFit will follow up with you about this request. Nothing is agreed, booked or paid.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Accepted for follow-up")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Submit|Withdraw|Edit/ })).toBeNull();
  });

  it("an unknown status is shown as unknown", async () => {
    await render([
      ok({
        proposal: proposal({
          status: "rocketed" as "draft",
          allowed_actions: { edit: false, submit: false, withdraw: false },
        }),
      }),
    ]);
    expect(await screen.findByText("Unknown status")).toBeVisible();
    expect(screen.getByText(/a status this page doesn’t know yet/)).toBeVisible();
  });

  it("another organization's request is not found here", async () => {
    await render([error(404, "not_found")]);
    expect(await screen.findByText("Request not found")).toBeVisible();
  });

  it("an answer for another organization is never shown", async () => {
    await render([ok({ proposal: proposal({ sponsor_id: OTHER }) })]);
    await waitFor(() => expect(screen.queryByText("Spring events")).toBeNull());
    expect(screen.queryByRole("button", { name: "Submit to SimpleFit" })).toBeNull();
  });
});

describe("every locale has the partnership copy", () => {
  it.each(locales)("%s renders the opportunities state", async (locale) => {
    api({
      [`${BASE}/partnership-opportunities`]: [
        ok({ sponsor_id: ORG, availability: "unavailable", reason: "no_inventory" }),
      ],
    });
    await renderWithProviders(<SponsorOpportunitiesView access={access("member")} />, { locale });
    const heading = await screen.findByRole("heading", { level: 2 });
    expect(heading.textContent?.length).toBeGreaterThan(5);
    expect(document.body.textContent).not.toMatch(/sponsorPartnerships\./);
  });
});
