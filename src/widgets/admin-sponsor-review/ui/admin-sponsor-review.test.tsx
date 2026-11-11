import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { ReviewDetail } from "./review-detail";
import { ReviewQueue } from "./review-queue";

/*
 * AS1 and AS2 (SF-124) with the network mocked at `fetch`: filters go to the server,
 * each action is the backend's preview then execution of exactly that request, nothing
 * shows as done before the backend answers, an unanswered decision is reconciled by
 * sending the very same request again, and a document link is used once, never kept.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));
const verifyKey = vi.fn();
const permissions = vi.hoisted(() => ({ current: [] as string[] }));
vi.mock("@/entities/operator", () => ({
  useOperator: () => ({ data: { permissions: permissions.current } }),
  useOperatorKeys: () => ({ verifyKey }),
  grants: (operator: { permissions: string[] }, permission: string) =>
    operator.permissions.includes(permission),
}));
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={`/en${href}`} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const ID = "4a1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const DOC = "9a1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const READ = ["sponsors.applications.read"];
const DECIDE = [
  ...READ,
  "sponsors.applications.claim",
  "sponsors.applications.request_changes",
  "sponsors.applications.approve",
  "sponsors.applications.reject",
  "sponsors.applications.read_files",
  "sponsors.restrict",
];

const answers = {
  company_name: "Haymaker GmbH",
  website: "https://haymaker.example",
  country_code: "DE",
  industry: "boxing_equipment",
  contact_full_name: "Laura Weiss",
  contact_position: "Head of Partnerships",
  contact_email: "laura@haymaker.example",
  contact_phone: null,
  interests: ["sponsored_events"],
  market_scope: "countries",
  market_countries: ["PL", "DE"],
  market_cities: [],
  budget_band: "eur_5000_20000",
  goals: "Grow among amateur boxers.",
};
const application = (overrides: Record<string, unknown> = {}) => ({
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
      sequence: 1,
      submitted_at: "2026-11-01T10:00:00Z",
      policy_version: "sponsor-application-2026-11.v1",
      answers,
      contact_email_verified: true,
      declaration_version: "decl-1",
      declaration_language: "en",
    },
    change_request: null,
    evidence: [
      {
        evidence_id: DOC,
        kind: "brand_deck",
        content_type: "application/pdf",
        byte_size: 204800,
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
        occurred_at: "2026-11-01T10:00:00Z",
      },
    ],
    ...overrides,
  },
});
const preview = (action: string, token: string | null = "sfc_once") => ({
  status: 200,
  body: {
    preview: {
      action: `sponsor_application.${action}`,
      target: { type: "sponsor_application", id: ID, status: "under_review" },
      expected_revision: 3,
      current_state: "under_review",
      proposed_state: action === "approve" ? "approved" : "changes_requested",
      permission: null,
      impact: ["organization_created", "applicant_becomes_owner", "no_commercial_rights"],
      required_permission: `sponsors.applications.${action}`,
      required_assurance: "fresh_key",
      reason_code: "review_complete",
      confirmation: token
        ? { required: true, token, expires_at: "2099-01-01T00:00:00Z" }
        : { required: false, token: null, expires_at: null },
    },
  },
});
const error = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  body: { error: { code, message: "x", details } },
});

type Answer = { status: number; body?: unknown } | "offline";

function api(routes: Record<string, Answer[]>) {
  const calls: { key: string; url: URL; body: Record<string, unknown> | undefined }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      const key = `${init.method ?? "GET"} ${url.pathname}`;
      calls.push({ key, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url.pathname === "/api/v1/sponsor-application-policy")
        return Promise.resolve(jsonResponse(error(404, "not_found").body, { status: 404 }));
      const queue = routes[key];
      if (!queue) throw new Error(`unexpected ${key}`);
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      if (answer === "offline") return Promise.reject(new TypeError("Failed to fetch"));
      return Promise.resolve(jsonResponse(answer.body, { status: answer.status }));
    }),
  );
  return calls;
}

const user = userEvent.setup();
const DETAIL = `GET /api/v1/admin/sponsor-applications/${ID}`;
const action = (name: string) => `POST /api/v1/admin/sponsor-applications/${ID}/${name}`;

afterEach(() => {
  vi.unstubAllGlobals();
  verifyKey.mockReset();
  permissions.current = [];
});

describe("AS1 queue (SF-124)", () => {
  it("lists the backend's applications; filters by status and dates on the server", async () => {
    permissions.current = READ;
    const row = {
      application_id: ID,
      status: "submitted",
      revision: 1,
      submitted_at: "2026-11-01T10:00:00Z",
      decided_at: null,
      company_name: "Haymaker GmbH",
      country_code: "DE",
      industry: "boxing_equipment",
      submissions: 2,
      submitted_documents: 1,
      change_request_open: false,
    };
    const calls = api({
      "GET /api/v1/admin/sponsor-applications": [
        { status: 200, body: { applications: [row], next_cursor: null } },
      ],
    });
    await renderWithProviders(<ReviewQueue />);

    const table = await screen.findByRole("table", { name: /oldest submission first/ });
    expect(within(table).getByRole("link", { name: "Haymaker GmbH" })).toHaveAttribute(
      "href",
      `/en/admin/sponsors/${ID}`,
    );
    expect(table.querySelector("[data-application-status=submitted]")).toHaveTextContent(
      "Submitted",
    );
    expect(within(table).getByText(/2 submissions/)).toBeInTheDocument();
    expect(calls[0]!.url.searchParams.get("limit")).toBe("25");

    await user.click(screen.getByRole("combobox", { name: "Status" }));
    await user.click(await screen.findByRole("option", { name: "Under review" }));
    await waitFor(() => expect(calls.at(-1)!.url.searchParams.get("status")).toBe("under_review"));

    await user.type(screen.getByLabelText("Submitted from"), "2026-11-01");
    await user.type(screen.getByLabelText("Submitted until"), "2026-11-03");
    await waitFor(() => {
      const last = calls.at(-1)!.url.searchParams;
      expect(last.get("submitted_after")).toBe("2026-11-01T00:00:00Z");
      expect(last.get("submitted_before")).toBe("2026-11-04T00:00:00.000Z");
    });
  });

  it("empty and restricted", async () => {
    permissions.current = READ;
    api({
      "GET /api/v1/admin/sponsor-applications": [
        { status: 200, body: { applications: [], next_cursor: null } },
      ],
    });
    const first = await renderWithProviders(<ReviewQueue />);
    expect(await screen.findByText("No applications match")).toBeInTheDocument();
    first.unmount();

    permissions.current = ["sponsors.restrict"];
    await renderWithProviders(<ReviewQueue />);
    expect(screen.getByText("You don’t have access to this section")).toBeInTheDocument();
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
  });
});

describe("AS2 detail (SF-124)", () => {
  it("shows what was submitted and only the actions the state and permissions allow", async () => {
    permissions.current = READ;
    api({ [DETAIL]: [{ status: 200, body: application() }] });
    const first = await renderWithProviders(<ReviewDetail applicationId={ID} />);

    const answersSection = await screen.findByRole("region", { name: "Submitted answers" });
    expect(within(answersSection).getByText("Haymaker GmbH")).toBeInTheDocument();
    expect(within(answersSection).getByText("(verified by code)")).toBeInTheDocument();
    expect(screen.getByText("Read only · revision 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByText(/your permissions don’t include them/)).toBeInTheDocument();
    expect(screen.getByText("Needs document access")).toBeInTheDocument();
    first.unmount();

    permissions.current = DECIDE;
    api({ [DETAIL]: [{ status: 200, body: application() }] });
    await renderWithProviders(<ReviewDetail applicationId={ID} />);
    const review = await screen.findByRole("region", { name: "Review" });
    expect(
      within(review)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Request changes", "Reject…", "Approve"]);
  });

  it("a party to the application gets no actions, by the backend's flag", async () => {
    permissions.current = DECIDE;
    api({ [DETAIL]: [{ status: 200, body: application({ viewer_is_party: true }) }] });
    await renderWithProviders(<ReviewDetail applicationId={ID} />);
    expect(await screen.findByText(/you’re a party to it/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Download" })).not.toBeInTheDocument();
  });

  it("approve: preview, key check when asked, then exactly that request; success only after the answer", async () => {
    permissions.current = DECIDE;
    verifyKey.mockResolvedValue(undefined);
    const calls = api({
      [DETAIL]: [
        { status: 200, body: application() },
        {
          status: 200,
          body: application({
            status: "approved",
            organization: { sponsor_id: "6a1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b", status: "active" },
          }),
        },
      ],
      [action("approve/preview")]: [error(403, "step_up_required"), preview("approve")],
      [action("approve")]: [{ status: 200, body: application({ status: "approved" }) }],
    });
    await renderWithProviders(<ReviewDetail applicationId={ID} />);

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    const box = await screen.findByRole("dialog");
    expect(within(box).getByText(/No contract, verification, payment/)).toBeInTheDocument();
    await user.click(within(box).getByRole("button", { name: "Review" }));
    await user.click(await within(box).findByRole("button", { name: "Use security key" }));
    expect(verifyKey).toHaveBeenCalledTimes(1);

    expect(await within(box).findByText("The organization is created")).toBeInTheDocument();
    expect(within(box).getByText("Under review → Approved, at revision 3")).toBeInTheDocument();
    await user.click(within(box).getByRole("button", { name: "Approve" }));
    expect(await within(box).findByText("Done. Recorded in the audit log.")).toBeInTheDocument();

    const executed = calls.find((call) => call.key === action("approve"))!;
    expect(executed.body).toMatchObject({
      reason_code: "review_complete",
      expected_revision: 3,
      confirmation_token: "sfc_once",
    });
    expect(executed.body!.operation_id).toEqual(expect.any(String));
    await waitFor(() => expect(calls.filter((call) => call.key === DETAIL).length).toBe(2));
  });

  it("a stale or conflicting decision is shown as a conflict, never as done", async () => {
    permissions.current = DECIDE;
    api({
      [DETAIL]: [{ status: 200, body: application() }],
      [action("reject/preview")]: [preview("reject")],
      [action("reject")]: [error(409, "revision_conflict", { current_revision: 4 })],
    });
    await renderWithProviders(<ReviewDetail applicationId={ID} />);
    await user.click(await screen.findByRole("button", { name: "Reject…" }));
    const box = await screen.findByRole("dialog");
    await user.click(within(box).getByRole("combobox", { name: /Reason code/ }));
    await user.click(await screen.findByRole("option", { name: "Not a business" }));
    await user.click(within(box).getByRole("button", { name: "Review" }));
    await user.click(await within(box).findByRole("button", { name: "Reject" }));
    expect(
      await within(box).findByText(/Someone else changed this application first/),
    ).toBeInTheDocument();
    expect(within(box).queryByText("Done. Recorded in the audit log.")).not.toBeInTheDocument();
  });

  it("a preview refused because the application moved on re-reads it and shows its state", async () => {
    permissions.current = DECIDE;
    const calls = api({
      [DETAIL]: [
        { status: 200, body: application() },
        { status: 200, body: application({ status: "approved" }) },
      ],
      [action("reject/preview")]: [error(409, "conflict", { status: "approved" })],
    });
    await renderWithProviders(<ReviewDetail applicationId={ID} />);
    await user.click(await screen.findByRole("button", { name: "Reject…" }));
    const box = await screen.findByRole("dialog");
    await user.click(within(box).getByRole("combobox", { name: /Reason code/ }));
    await user.click(await screen.findByRole("option", { name: "Not a business" }));
    await user.click(within(box).getByRole("button", { name: "Review" }));
    expect(
      await within(box).findByText(/Someone else changed this application first/),
    ).toBeInTheDocument();
    await waitFor(() => expect(calls.filter((call) => call.key === DETAIL).length).toBe(2));
    await user.click(within(box).getByRole("button", { name: "Reload" }));
    await waitFor(() =>
      expect(document.querySelector("[data-review-application]")).toHaveAttribute(
        "data-application-status",
        "approved",
      ),
    );
  });

  it("no answer: checking sends the very same request (same operation and confirmation)", async () => {
    permissions.current = DECIDE;
    const calls = api({
      [DETAIL]: [{ status: 200, body: application() }],
      [action("approve/preview")]: [preview("approve")],
      [action("approve")]: ["offline", { status: 200, body: application({ status: "approved" }) }],
    });
    await renderWithProviders(<ReviewDetail applicationId={ID} />);
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    const box = await screen.findByRole("dialog");
    await user.click(within(box).getByRole("button", { name: "Review" }));
    await user.click(await within(box).findByRole("button", { name: "Approve" }));
    expect(
      await within(box).findByText(/We don’t know whether this went through/),
    ).toBeInTheDocument();

    await user.click(within(box).getByRole("button", { name: "Check the outcome" }));
    expect(await within(box).findByText("Done. Recorded in the audit log.")).toBeInTheDocument();
    const [first, second] = calls.filter((call) => call.key === action("approve"));
    expect(second!.body).toEqual(first!.body);
    expect(calls.filter((call) => call.key === action("approve/preview"))).toHaveLength(1);
  });

  it("request changes needs answers and a message; it carries no confirmation", async () => {
    permissions.current = DECIDE;
    const calls = api({
      [DETAIL]: [{ status: 200, body: application() }],
      [action("request-changes/preview")]: [preview("request_changes", null)],
      [action("request-changes")]: [
        { status: 200, body: application({ status: "changes_requested" }) },
      ],
    });
    await renderWithProviders(<ReviewDetail applicationId={ID} />);
    await user.click(await screen.findByRole("button", { name: "Request changes" }));
    const box = await screen.findByRole("dialog");
    await user.click(within(box).getByRole("combobox", { name: /Reason code/ }));
    await user.click(await screen.findByRole("option", { name: "Missing information" }));
    expect(within(box).getByRole("button", { name: "Review" })).toBeDisabled();
    await user.click(within(box).getByRole("checkbox", { name: "Goals" }));
    await user.type(
      within(box).getByRole("textbox", { name: /Message to the applicant/ }),
      "Tell us more.",
    );
    await user.click(within(box).getByRole("button", { name: "Review" }));
    await user.click(await within(box).findByRole("button", { name: "Send request" }));
    expect(await within(box).findByText("Done. Recorded in the audit log.")).toBeInTheDocument();

    const executed = calls.find((call) => call.key === action("request-changes"))!;
    expect(executed.body).toMatchObject({
      reason_code: "missing_information",
      fields: ["goals"],
      message: "Tell us more.",
      expected_revision: 3,
    });
    expect(executed.body).not.toHaveProperty("confirmation_token");
  });

  it("a document link is used once at once and never shown or kept", async () => {
    permissions.current = DECIDE;
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    api({
      [DETAIL]: [{ status: 200, body: application() }],
      [`POST /api/v1/admin/sponsor-applications/${ID}/documents/${DOC}/download`]: [
        {
          status: 200,
          body: {
            download: {
              method: "GET",
              url: "https://storage.example/signed?sig=secret",
              expires_at: "2026-11-11T12:05:00Z",
            },
          },
        },
      ],
    });
    await renderWithProviders(<ReviewDetail applicationId={ID} />);
    await user.click(await screen.findByRole("button", { name: "Download" }));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://storage.example/signed?sig=secret"),
    );
    expect(document.body.innerHTML).not.toContain("sig=secret");
  });
});
