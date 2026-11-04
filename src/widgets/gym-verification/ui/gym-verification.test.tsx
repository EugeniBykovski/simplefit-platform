import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  Gym,
  GymBusinessVerification,
  GymGoLive as Readiness,
  GymGoLiveCheck,
  GymViewerPermissionsItem,
} from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { GymCommunityDefaults } from "./gym-community-defaults";
import { GymGoLive } from "./gym-go-live";
import { GymVerification } from "./gym-verification";

/*
 * OG7, OG13 and OG14 (SF-103) with the network mocked at `fetch`: every
 * status is the backend's answer, only the owner reads or writes the
 * verification, documents go to the presigned URL the backend answered and
 * are confirmed by the backend, nothing approves or publishes, and the
 * community settings are not switches.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  onSessionBoundary: () => () => undefined,
}));
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const GYM = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const APP = "8a1b2c3d-0000-4000-8000-000000000801";
const DOC = "9a1b2c3d-0000-4000-8000-000000000901";
const OWNER: GymViewerPermissionsItem[] = [
  "view_workspace",
  "manage_business_verification",
  "view_go_live",
];

const gym = (permissions: GymViewerPermissionsItem[] = OWNER): Gym => ({
  id: GYM,
  name: "Ring One Boxing",
  gym_type: "boxing_club",
  setup_status: "completed",
  inserted_at: "2026-10-27T10:00:00Z",
  updated_at: "2026-10-27T10:00:00Z",
  locations: [],
  viewer: {
    role: permissions.includes("manage_business_verification") ? "owner" : "coach",
    staff_membership_id: "6a1b2c3d-0000-4000-8000-000000000101",
    permissions,
  },
});

const requirements = {
  policy_version: "sf103-generic-1",
  required_fields: ["legal_name", "registration_country"],
  min_evidence: 1,
  max_evidence: 10,
  max_bytes: 10485760,
  content_types: ["application/pdf", "image/jpeg", "image/png"],
  kinds: ["registration_extract", "proof_of_address", "other"],
} as GymBusinessVerification["requirements"];

const application = (revision = 1) => ({
  id: APP,
  revision,
  policy_version: "sf103-generic-1",
  legal_name: "Ring One Sp. z o.o.",
  registration_country: "PL",
  registration_number: null,
  address_line: null,
  postal_code: null,
  city: null,
  website: null,
  submitted_at: null,
  decided_at: null,
  created_at: "2026-11-04T10:00:00Z",
  updated_at: "2026-11-04T10:00:00Z",
});

const document = (overrides = {}) => ({
  id: DOC,
  kind: "registration_extract" as const,
  status: "uploaded" as const,
  file_name: "extract.pdf",
  content_type: "application/pdf" as const,
  byte_size: 2048,
  uploaded_at: "2026-11-04T10:01:00Z",
  submitted: false,
  created_at: "2026-11-04T10:00:30Z",
  ...overrides,
});

const verification = (
  overrides: Partial<GymBusinessVerification> = {},
): GymBusinessVerification => ({
  gym_id: GYM,
  status: "not_started",
  application: null,
  evidence: [],
  latest_decision: null,
  missing: ["legal_name", "registration_country", "evidence"],
  can_edit: true,
  can_submit: false,
  requirements,
  ...overrides,
});

type Answer = { status: number; body?: unknown };
type Call = { method: string; url: string; body: unknown };

function api(routes: Record<string, Answer[]>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string | URL, init: RequestInit = {}) => {
      const target = new URL(url.toString());
      const method = (init.method ?? "GET").toUpperCase();
      const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
      calls.push({ method, url: target.toString(), body });
      const queue = routes[`${method} ${target.pathname}`];
      if (!queue) return Promise.resolve(jsonResponse({}, { status: 200 }));
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      return Promise.resolve(jsonResponse(answer.body ?? {}, { status: answer.status }));
    }),
  );
  return calls;
}

const BASE = `/api/v1/gyms/${GYM}/business-verification`;
const answer = (v: GymBusinessVerification): Answer => ({ status: 200, body: { verification: v } });
const user = userEvent.setup();

afterEach(() => vi.unstubAllGlobals());

describe("GymVerification (OG7, SF-103)", () => {
  it("starts an application without a revision and shows the backend's draft", async () => {
    const draft = verification({
      status: "draft",
      application: application(),
      missing: ["evidence"],
    });
    const calls = api({
      [`GET ${BASE}`]: [answer(verification()), answer(draft)],
      [`PUT ${BASE}`]: [{ status: 201, body: { verification: draft } }],
    });
    await renderWithProviders(<GymVerification gym={gym()} />);

    await user.type(await screen.findByLabelText("Legal name"), "Ring One Sp. z o.o.");
    await user.click(screen.getByRole("button", { name: "Save and start application" }));

    const put = await waitFor(() => {
      const found = calls.find((call) => call.method === "PUT");
      expect(found).toBeDefined();
      return found!;
    });
    expect(put.body).toMatchObject({ legal_name: "Ring One Sp. z o.o.", city: null });
    expect(put.body).not.toHaveProperty("revision");
    expect(put.body).not.toHaveProperty("status");
    expect(await screen.findByText("Draft")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeDisabled();
  });

  it("uploads to the presigned URL, then asks the backend to confirm", async () => {
    const draft = verification({
      status: "draft",
      application: application(2),
      missing: ["evidence"],
    });
    const pending = verification({
      ...draft,
      application: application(3),
      evidence: [document({ status: "pending_upload", uploaded_at: null })],
    });
    const ready = verification({
      ...draft,
      application: application(4),
      evidence: [document()],
      missing: [],
      can_submit: true,
    });
    const calls = api({
      [`GET ${BASE}`]: [answer(draft), answer(ready)],
      [`POST ${BASE}/evidence`]: [
        {
          status: 201,
          body: {
            verification: pending,
            evidence: pending.evidence[0],
            upload: {
              method: "PUT",
              url: "https://storage.example/upload?sig=1",
              headers: { "content-type": "application/pdf", "content-length": "2048" },
              expires_at: "2026-11-04T10:15:00Z",
            },
          },
        },
      ],
      [`POST ${BASE}/evidence/${DOC}/confirm`]: [answer(ready)],
    });
    const upload = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    await renderWithProviders(<GymVerification gym={gym()} upload={upload} />);

    const file = new File([new Uint8Array(2048)], "extract.pdf", { type: "application/pdf" });
    const input = (await screen.findByText("Documents"))
      .closest("[data-verification-documents]")!
      .querySelector<HTMLInputElement>("[data-document-input]")!;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(upload).toHaveBeenCalled());
    expect(upload).toHaveBeenCalledWith(
      "https://storage.example/upload?sig=1",
      { "content-type": "application/pdf", "content-length": "2048" },
      file,
    );
    const announce = calls.find((call) => call.url.endsWith("/evidence"))!;
    expect(announce.body).toEqual({
      revision: 2,
      kind: "registration_extract",
      file_name: "extract.pdf",
      content_type: "application/pdf",
      byte_size: 2048,
    });
    expect(await screen.findByText("Uploaded")).toBeInTheDocument();
    expect(calls.some((call) => call.url.endsWith(`/evidence/${DOC}/confirm`))).toBe(true);
    expect(screen.getByRole("button", { name: "Submit for review" })).toBeEnabled();
  });

  it("refuses files outside the policy before any request", async () => {
    const calls = api({
      [`GET ${BASE}`]: [answer(verification({ status: "draft", application: application() }))],
    });
    await renderWithProviders(<GymVerification gym={gym()} upload={vi.fn()} />);
    const input = (await screen.findByText("Documents"))
      .closest("[data-verification-documents]")!
      .querySelector<HTMLInputElement>("[data-document-input]")!;
    fireEvent.change(input, {
      target: { files: [new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })] },
    });
    expect(await screen.findByText("Choose a PDF, JPEG or PNG file.")).toBeInTheDocument();
    expect(calls.filter((call) => call.method === "POST")).toEqual([]);
  });

  it("submits the revision shown; in review nothing is editable", async () => {
    const ready = verification({
      status: "draft",
      application: application(4),
      evidence: [document()],
      missing: [],
      can_submit: true,
    });
    const submitted = verification({
      ...ready,
      status: "submitted",
      can_edit: false,
      can_submit: false,
      evidence: [document({ submitted: true })],
    });
    const calls = api({
      [`GET ${BASE}`]: [answer(ready), answer(submitted)],
      [`POST ${BASE}/submit`]: [answer(submitted)],
    });
    await renderWithProviders(<GymVerification gym={gym()} />);
    await user.click(await screen.findByRole("button", { name: "Submit for review" }));

    await screen.findByText("In review");
    expect(calls.find((call) => call.url.endsWith("/submit"))!.body).toEqual({ revision: 4 });
    expect(screen.getByLabelText("Legal name")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).toBeNull();
  });

  it("shows a conflict from another tab and reads the latest state", async () => {
    const draft = verification({ status: "draft", application: application(2) });
    const calls = api({
      [`GET ${BASE}`]: [answer(draft)],
      [`PUT ${BASE}`]: [
        {
          status: 409,
          body: {
            error: {
              code: "conflict",
              message: "conflict",
              details: { revision: "stale", current_revision: 3 },
              request_id: null,
            },
          },
        },
      ],
    });
    await renderWithProviders(<GymVerification gym={gym()} />);
    await user.click(await screen.findByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/changed in another tab/);
    expect(calls.find((call) => call.method === "PUT")!.body).toMatchObject({ revision: 2 });
    await waitFor(() => expect(calls.filter((call) => call.method === "GET").length).toBe(2));
  });

  it("shows decisions with their reason, and lets the owner start over after a rejection", async () => {
    api({
      [`GET ${BASE}`]: [
        answer(
          verification({
            status: "rejected",
            application: { ...application(5), submitted_at: "2026-11-04T11:00:00Z" },
            latest_decision: {
              decision: "rejected",
              reason_code: "business_not_verifiable",
              decided_at: "2026-11-05T09:00:00Z",
            },
            can_edit: true,
          }),
        ),
      ],
    });
    await renderWithProviders(<GymVerification gym={gym()} />);
    expect(await screen.findByText("Not approved")).toBeInTheDocument();
    expect(
      screen.getByText("The business could not be verified from the information provided."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save and start application" })).toBeEnabled();
    // A new application starts empty: the rejected one's details are history.
    expect(screen.getByLabelText("Legal name")).toHaveValue("");
  });

  it("shows Verified only when the backend says approved", async () => {
    api({
      [`GET ${BASE}`]: [
        answer(
          verification({
            status: "approved",
            application: application(5),
            evidence: [document({ submitted: true })],
            latest_decision: {
              decision: "approved",
              reason_code: null,
              decided_at: "2026-11-05T09:00:00Z",
            },
            can_edit: false,
            missing: [],
          }),
        ),
      ],
    });
    await renderWithProviders(<GymVerification gym={gym()} />);
    expect(await screen.findByText("Verified")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  });

  it("reads nothing for staff other than the owner", async () => {
    const calls = api({});
    await renderWithProviders(<GymVerification gym={gym(["view_workspace", "view_go_live"])} />);
    expect(
      await screen.findByText("Only the gym's owner manages business verification"),
    ).toBeInTheDocument();
    expect(calls).toEqual([]);
  });
});

const check = (overrides: Partial<GymGoLiveCheck>): GymGoLiveCheck => ({
  key: "setup_completed",
  status: "passed",
  requiredness: "required",
  reason_code: "setup_completed",
  action: null,
  source: "gym_setup",
  ...overrides,
});

const readiness = (overrides: Partial<Readiness> = {}): Readiness => ({
  gym_id: GYM,
  policy_version: "sf103-golive-1",
  evaluated_at: "2026-11-04T10:00:00Z",
  prerequisites_met: false,
  checks: [
    check({}),
    check({
      key: "business_verification",
      status: "pending",
      reason_code: "in_review",
      action: "open_verification",
      source: "business_verification",
    }),
    check({
      key: "upcoming_class",
      status: "failed",
      requiredness: "recommended",
      reason_code: "no_upcoming_class",
      action: "open_timetable",
      source: "timetable",
    }),
    check({
      key: "member_payments",
      status: "blocked",
      requiredness: "optional",
      reason_code: "decisions_not_approved",
      source: "payments",
    }),
    check({
      key: "public_profile",
      status: "unavailable",
      requiredness: "future",
      reason_code: "public_surface_not_available",
      source: "publication",
    }),
  ],
  publication: { status: "unavailable", reason_code: "public_surface_not_available" },
  ...overrides,
});

describe("GymGoLive (OG14, SF-103)", () => {
  it("renders the backend's checks by requiredness, with no Publish action", async () => {
    api({ [`GET /api/v1/gyms/${GYM}/go-live`]: [{ status: 200, body: { go_live: readiness() } }] });
    await renderWithProviders(<GymGoLive gym={gym()} />);

    const required = await screen.findByRole("region", { name: "Required" });
    expect(within(required).getByText("Business verification")).toBeInTheDocument();
    expect(within(required).getByText("In review")).toBeInTheDocument();
    expect(screen.getByText("Some required steps aren't done yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Upcoming classes" })).toHaveAttribute(
      "href",
      expect.stringContaining(`/app/gyms/${GYM}/timetable`),
    );
    expect(screen.getByText("Not available yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
  });

  it("even with every prerequisite met, publishing stays unavailable", async () => {
    api({
      [`GET /api/v1/gyms/${GYM}/go-live`]: [
        {
          status: 200,
          body: { go_live: readiness({ prerequisites_met: true, checks: [check({})] }) },
        },
      ],
    });
    await renderWithProviders(<GymGoLive gym={gym()} />);
    expect(await screen.findByText(/Every required step is done/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
  });

  it("reads nothing for coaches and front desk", async () => {
    const calls = api({});
    await renderWithProviders(<GymGoLive gym={gym(["view_workspace"])} />);
    expect(
      await screen.findByText("Only the owner and managers see go-live readiness"),
    ).toBeInTheDocument();
    expect(calls).toEqual([]);
  });
});

describe("GymCommunityDefaults (WG10 / OG13, SF-103)", () => {
  it("states the guarantees and shows the designed settings as coming later, not switches", async () => {
    const calls = api({});
    await renderWithProviders(<GymCommunityDefaults gym={gym()} />);
    expect(await screen.findByText("Gym community feed")).toBeInTheDocument();
    expect(screen.getByText("Private training logs")).toBeInTheDocument();
    expect(screen.queryAllByRole("switch")).toEqual([]);
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
    expect(calls).toEqual([]);
  });
});
