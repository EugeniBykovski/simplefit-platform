import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { OperatorsPage } from "./operators-page";

/*
 * SF-129 with the network mocked at `fetch`: the operators as the backend sent them
 * (provenance, the viewer marked, no controls without operators.manage, none on
 * oneself), a grant through reason, preview and confirmation shown as done only after
 * the backend's answer, a permission removed without a confirmation token, adding an
 * operator by exact email or user id with the backend's refusals, history only with
 * audit.read, the viewer's own security, and nothing read without operators.read.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));

const ME = "11111111-1111-4111-8111-111111111111";
const PIOTR = "22222222-2222-4222-8222-222222222222";
const MARTA = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-11-12T12:00:00Z";

const viewer = vi.hoisted(() => ({ permissions: [] as string[] }));
const keys = vi.hoisted(() => ({
  verifyKey: vi.fn(),
  registerKey: vi.fn(),
  endKeyCheck: vi.fn(),
  reread: vi.fn(),
}));
vi.mock("@/entities/operator", () => ({
  needsEnrollment: () => false,
  useOperator: () => ({
    data: {
      id: "11111111-1111-4111-8111-111111111111",
      status: "active",
      permissions: viewer.permissions,
      security_keys: { registered: 2, required: 2 },
      step_up: { verified_at: "2026-11-12T11:55:00Z", expires_at: "2026-11-12T12:10:00Z" },
      activated_at: "2026-11-01T09:00:00Z",
      enrollment_expires_at: null,
    },
  }),
  useOperatorKeys: () => keys,
  useKeyCheckClock: () => Date.parse("2026-11-12T12:00:00Z"),
  keyCheckRemaining: (op: { step_up: { expires_at: string } | null }, now: number) =>
    op.step_up ? Math.max(Date.parse(op.step_up.expires_at) - now, 0) : undefined,
  grants: (operator: { permissions: string[] }, permission: string) =>
    operator.permissions.includes(permission),
}));
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={`/en${href}`} {...props}>
      {children}
    </a>
  ),
}));

const grant = (permission: string, overrides: Record<string, unknown> = {}) => ({
  permission,
  granted_at: "2026-11-02T10:00:00Z",
  granted_by_operator_id: ME,
  reason_code: "access_request_approved",
  bootstrap: false,
  ...overrides,
});

const operator = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  user_id: `${id.slice(0, 8)}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
  status: "active",
  permissions: ["operators.read"],
  grants: [grant("operators.read")],
  revision: 3,
  bootstrap: false,
  created_at: "2026-11-02T10:00:00Z",
  created_by_operator_id: ME,
  activated_at: "2026-11-02T11:00:00Z",
  enrollment_expires_at: null,
  suspended_at: null,
  revoked_at: null,
  security_keys: { registered: 2, required: 2 },
  short_name: "Piotr R.",
  last_key_check_at: "2026-11-12T09:30:00Z",
  ...overrides,
});

const founder = operator(ME, {
  short_name: "Ewa N.",
  bootstrap: true,
  created_by_operator_id: null,
  permissions: ["operators.manage", "operators.read"],
  grants: [
    grant("operators.manage", { bootstrap: true, granted_by_operator_id: null, reason_code: null }),
    grant("operators.read", { bootstrap: true, granted_by_operator_id: null, reason_code: null }),
  ],
});
const piotr = operator(PIOTR);
const marta = operator(MARTA, {
  short_name: "Marta D.",
  status: "pending_enrollment",
  security_keys: { registered: 0, required: 2 },
  last_key_check_at: null,
  activated_at: null,
});

const OPS = "/api/v1/admin/operators";
const CATALOG = {
  permissions: [
    { permission: "operators.read", assurance: "key" },
    { permission: "operators.manage", assurance: "fresh_key" },
    { permission: "audit.read", assurance: "key" },
  ],
};
const CREDENTIALS = {
  credentials: [
    {
      id: "k1",
      label: "Blue key",
      created_at: "2026-11-01T09:00:00Z",
      last_used_at: NOW,
      revoked_at: null,
      revoked_reason: null,
    },
    {
      id: "k2",
      label: "Safe key",
      created_at: "2026-11-01T09:05:00Z",
      last_used_at: null,
      revoked_at: null,
      revoked_reason: null,
    },
  ],
};

type Answer = { status: number; body?: unknown };

function api(routes: Record<string, Answer[]>) {
  const calls: { method: string; url: URL; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(input);
      const method = init?.method ?? "GET";
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
      const queue = routes[`${method} ${url.pathname}`];
      if (!queue) throw new Error(`unexpected ${method} ${url.pathname}`);
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      return Promise.resolve(jsonResponse(answer.body, { status: answer.status }));
    }),
  );
  return calls;
}

const base = (list = [founder, piotr, marta]): Record<string, Answer[]> => ({
  [`GET ${OPS}`]: [{ status: 200, body: { operators: list } }],
  [`GET ${OPS}/${PIOTR}`]: [{ status: 200, body: { operator: piotr } }],
  [`GET ${OPS}/${ME}`]: [{ status: 200, body: { operator: founder } }],
  [`GET ${OPS}/${MARTA}`]: [{ status: 200, body: { operator: marta } }],
  ["GET /api/v1/admin/operator-permissions"]: [{ status: 200, body: CATALOG }],
  ["GET /api/v1/admin/credentials"]: [{ status: 200, body: CREDENTIALS }],
});

const user = userEvent.setup();

afterEach(() => {
  vi.unstubAllGlobals();
  viewer.permissions = [];
  Object.values(keys).forEach((fn) => fn.mockReset());
});

describe("AD20 operators (SF-129)", () => {
  it("lists operators with the viewer marked; read-only access has no controls", async () => {
    viewer.permissions = ["operators.read"];
    const calls = api(base());
    await renderWithProviders(<OperatorsPage />);

    const me = await screen.findByRole("row", { name: /Ewa N\./ });
    expect(within(me).getByText("You")).toBeInTheDocument();
    const pending = screen.getByRole("row", { name: /Marta D\./ });
    expect(within(pending).getByText("Setting up keys")).toBeInTheDocument();
    expect(within(pending).getByText("0 of 2")).toBeInTheDocument();
    expect(within(pending).getByText("Never")).toBeInTheDocument();
    expect(screen.getByText(/Changing them needs operators.manage/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add an operator" })).not.toBeInTheDocument();
    expect(screen.getByText(/Two-person approval, break-glass access/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Details for Piotr R." }));
    const detail = await screen.findByRole("region", { name: "Piotr R." });
    expect(
      within(detail).getByText(/By Ewa N\. · .* · Access request approved/),
    ).toBeInTheDocument();
    expect(within(detail).queryByRole("button", { name: /Revoke|Suspend|Grant/ })).toBeNull();
    expect(within(detail).getByText("Their history needs audit.read.")).toBeInTheDocument();
    // No history is read without audit.read, and the catalog only with manage.
    expect(calls.some((c) => c.url.pathname === "/api/v1/admin/audit-events")).toBe(false);
    expect(calls.some((c) => c.url.pathname === "/api/v1/admin/operator-permissions")).toBe(false);
  });

  it("grants through reason, preview and confirmation; done only after the backend answers", async () => {
    viewer.permissions = ["operators.read", "operators.manage"];
    const granted = operator(PIOTR, {
      revision: 4,
      permissions: ["audit.read", "operators.read"],
      grants: [grant("audit.read"), grant("operators.read")],
    });
    const calls = api({
      ...base(),
      [`POST ${OPS}/${PIOTR}/permissions/preview`]: [
        {
          status: 200,
          body: {
            preview: {
              action: "operator.permission.grant",
              target: { type: "operator", id: PIOTR, status: "active" },
              expected_revision: 3,
              current_state: "absent",
              proposed_state: "granted",
              permission: "audit.read",
              impact: ["permission_granted", "effective_now"],
              required_permission: "operators.manage",
              required_assurance: "fresh_key",
              reason_code: "role_change",
              confirmation: { required: true, token: "sfo_token", expires_at: NOW },
            },
          },
        },
      ],
      [`POST ${OPS}/${PIOTR}/permissions`]: [{ status: 200, body: { operator: granted } }],
    });
    await renderWithProviders(<OperatorsPage />);
    await user.click(await screen.findByRole("button", { name: "Details for Piotr R." }));
    const opener = await screen.findByRole("button", { name: "Grant a permission" });
    await user.click(opener);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Review" })).toBeDisabled();
    await user.click(within(dialog).getByRole("combobox", { name: /Permission/ }));
    // Only what they don't hold yet.
    expect(screen.queryByRole("option", { name: "operators.read" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "audit.read" }));
    await user.click(within(dialog).getByRole("combobox", { name: /Reason/ }));
    await user.click(await screen.findByRole("option", { name: "Role change" }));
    await user.click(within(dialog).getByRole("button", { name: "Review" }));

    expect(await within(dialog).findByText("Not granted")).toBeInTheDocument();
    expect(within(dialog).getByText("Granted")).toBeInTheDocument();
    expect(within(dialog).getByText("It works from their next request.")).toBeInTheDocument();
    const preview = calls.find((c) => c.url.pathname.endsWith("/permissions/preview"));
    expect(preview?.body).toEqual({
      reason_code: "role_change",
      expected_revision: 3,
      permission: "audit.read",
    });

    await user.click(within(dialog).getByRole("button", { name: "Grant permission" }));
    expect(await within(dialog).findByText(/Granted\. It’s recorded/)).toBeInTheDocument();
    const execute = calls.find(
      (c) => c.method === "POST" && c.url.pathname === `${OPS}/${PIOTR}/permissions`,
    );
    expect(execute?.body).toMatchObject({
      permission: "audit.read",
      reason_code: "role_change",
      expected_revision: 3,
      confirmation_token: "sfo_token",
    });
    expect(typeof (execute?.body as { operation_id: string }).operation_id).toBe("string");

    const closers = within(dialog).getAllByRole("button", { name: "Close" });
    await user.click(closers[closers.length - 1]!);
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("removes a permission without a confirmation token when the backend asks for none", async () => {
    viewer.permissions = ["operators.read", "operators.manage"];
    const calls = api({
      ...base(),
      [`POST ${OPS}/${PIOTR}/permissions/operators.read/revoke/preview`]: [
        {
          status: 200,
          body: {
            preview: {
              action: "operator.permission.revoke",
              target: { type: "operator", id: PIOTR, status: "active" },
              expected_revision: 3,
              current_state: "granted",
              proposed_state: "revoked",
              permission: "operators.read",
              impact: ["permission_revoked"],
              required_permission: "operators.manage",
              required_assurance: "fresh_key",
              reason_code: "least_privilege_review",
              confirmation: { required: false, token: null, expires_at: null },
            },
          },
        },
      ],
      [`POST ${OPS}/${PIOTR}/permissions/operators.read/revoke`]: [
        { status: 200, body: { operator: operator(PIOTR, { permissions: [], grants: [] }) } },
      ],
    });
    await renderWithProviders(<OperatorsPage />);
    await user.click(await screen.findByRole("button", { name: "Details for Piotr R." }));
    await user.click(
      await screen.findByRole("button", { name: "Revoke operators.read from Piotr R." }),
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: /Reason/ }));
    await user.click(await screen.findByRole("option", { name: "Least-privilege review" }));
    await user.click(within(dialog).getByRole("button", { name: "Review" }));
    await user.click(await within(dialog).findByRole("button", { name: "Revoke permission" }));
    expect(await within(dialog).findByText(/stopped working immediately/)).toBeInTheDocument();
    const execute = calls.find((c) => c.url.pathname.endsWith("/operators.read/revoke"));
    expect(execute?.body).not.toHaveProperty("confirmation_token");
  });

  it("a stale revision says someone changed it first and never executes", async () => {
    viewer.permissions = ["operators.read", "operators.manage"];
    const calls = api({
      ...base(),
      [`POST ${OPS}/${PIOTR}/suspend/preview`]: [
        {
          status: 409,
          body: {
            error: { code: "revision_conflict", message: "x", details: { current_revision: 4 } },
          },
        },
      ],
    });
    await renderWithProviders(<OperatorsPage />);
    await user.click(await screen.findByRole("button", { name: "Details for Piotr R." }));
    await user.click(await screen.findByRole("button", { name: "Suspend" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("combobox", { name: /Reason/ }));
    await user.click(await screen.findByRole("option", { name: "Security concern" }));
    await user.click(within(dialog).getByRole("button", { name: "Review" }));
    expect(await within(dialog).findByText(/Someone changed this operator first/)).toBeVisible();
    expect(calls.filter((c) => c.url.pathname === `${OPS}/${PIOTR}/suspend`)).toHaveLength(0);
  });

  it("offers no action on oneself", async () => {
    viewer.permissions = ["operators.read", "operators.manage"];
    api(base());
    await renderWithProviders(<OperatorsPage />);
    await user.click(await screen.findByRole("button", { name: "Details for Ewa N." }));
    const detail = await screen.findByRole("region", { name: "Ewa N." });
    expect(within(detail).getByText(/This is you/)).toBeInTheDocument();
    expect(within(detail).getAllByText(/From the founding ceremony/)).toHaveLength(2);
    expect(within(detail).queryByRole("button", { name: /Revoke|Suspend|Grant/ })).toBeNull();
  });

  it("adds an operator by exact email; the backend's refusals are shown as they are", async () => {
    viewer.permissions = ["operators.read", "operators.manage"];
    const created = operator("44444444-4444-4444-8444-444444444444", {
      short_name: "Jan W.",
      status: "pending_enrollment",
      security_keys: { registered: 0, required: 2 },
    });
    const calls = api({
      ...base(),
      [`POST ${OPS}`]: [
        {
          status: 409,
          body: { error: { code: "conflict", message: "x", details: { user: "not_eligible" } } },
        },
        { status: 200, body: { operator: created } },
      ],
    });
    await renderWithProviders(<OperatorsPage />);
    await user.click(await screen.findByRole("button", { name: "Add an operator" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/register their own two security keys/)).toBeVisible();
    expect(within(dialog).queryByLabelText(/note|ticket/i)).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Their account/), "jan@example.com");
    await user.click(within(dialog).getByLabelText("audit.read"));
    await user.click(within(dialog).getByRole("combobox", { name: /Reason/ }));
    await user.click(await screen.findByRole("option", { name: "Access request approved" }));
    await user.click(within(dialog).getByRole("button", { name: "Add operator" }));
    expect(await within(dialog).findByText(/No account we can add matches/)).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Add operator" }));
    expect(await within(dialog).findByText(/They hold nothing usable/)).toBeVisible();
    const posts = calls.filter((c) => c.method === "POST" && c.url.pathname === OPS);
    expect(posts[0]?.body).toMatchObject({
      email: "jan@example.com",
      permissions: ["audit.read"],
      reason_code: "access_request_approved",
    });
    expect(posts[0]?.body).not.toHaveProperty("user_id");
    // A corrected attempt is a new operation.
    expect((posts[1]?.body as { operation_id: string }).operation_id).not.toBe(
      (posts[0]?.body as { operation_id: string }).operation_id,
    );
  });

  it("names an account by user id when given one", async () => {
    viewer.permissions = ["operators.read", "operators.manage"];
    const calls = api({
      ...base(),
      [`POST ${OPS}`]: [
        {
          status: 409,
          body: { error: { code: "conflict", message: "x", details: { target: "self" } } },
        },
      ],
    });
    await renderWithProviders(<OperatorsPage />);
    await user.click(await screen.findByRole("button", { name: "Add an operator" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Their account/), ME);
    await user.click(within(dialog).getByLabelText("operators.read"));
    await user.click(within(dialog).getByRole("combobox", { name: /Reason/ }));
    await user.click(await screen.findByRole("option", { name: "Role change" }));
    await user.click(within(dialog).getByRole("button", { name: "Add operator" }));
    expect(
      await within(dialog).findByText("You can’t add yourself. Nothing changed."),
    ).toBeVisible();
    const post = calls.find((c) => c.method === "POST" && c.url.pathname === OPS);
    expect(post?.body).toMatchObject({ user_id: ME });
    expect(post?.body).not.toHaveProperty("email");
  });

  it("with audit.read: their governance history and recent actions", async () => {
    viewer.permissions = ["operators.read", "audit.read"];
    const calls = api({
      ...base(),
      ["GET /api/v1/admin/audit-events"]: [
        {
          status: 200,
          body: {
            events: [
              {
                id: "e1",
                action: "operator.permission_granted",
                outcome: "allowed",
                authority: "fresh_key",
                occurred_at: "2026-11-02T10:00:00Z",
                actor_operator_id: ME,
                permission: "operators.read",
                reason_code: "access_request_approved",
              },
            ],
          },
        },
      ],
    });
    await renderWithProviders(<OperatorsPage />);
    await user.click(await screen.findByRole("button", { name: "Details for Piotr R." }));
    const detail = await screen.findByRole("region", { name: "Piotr R." });
    expect(await within(detail).findAllByText("Permission granted")).toHaveLength(2);
    expect(within(detail).getAllByText(/by Ewa N\./).length).toBeGreaterThan(0);
    const reads = calls.filter((c) => c.url.pathname === "/api/v1/admin/audit-events");
    expect(reads.map((c) => Object.fromEntries(c.url.searchParams))).toEqual(
      expect.arrayContaining([
        { target_id: PIOTR, limit: "20" },
        { actor_operator_id: PIOTR, limit: "20" },
      ]),
    );
  });

  it("without operators.read: restricted, nothing listed, own security still there", async () => {
    viewer.permissions = ["gyms.read"];
    const calls = api({ ["GET /api/v1/admin/credentials"]: [{ status: 200, body: CREDENTIALS }] });
    await renderWithProviders(<OperatorsPage />);
    expect(
      await screen.findByText("You don’t have access to the operator list"),
    ).toBeInTheDocument();
    const security = screen.getByRole("region", { name: "Your security" });
    expect(await within(security).findByText("Blue key")).toBeInTheDocument();
    expect(within(security).getByText("gyms.read")).toBeInTheDocument();
    // At the minimum: no key can be removed.
    expect(within(security).queryByRole("button", { name: /Remove key/ })).toBeNull();
    expect(calls.some((c) => c.url.pathname.startsWith(OPS))).toBe(false);
  });

  it("ends the key check and adds a key only through the backend", async () => {
    viewer.permissions = ["gyms.read"];
    api({ ["GET /api/v1/admin/credentials"]: [{ status: 200, body: CREDENTIALS }] });
    keys.endKeyCheck.mockResolvedValue(undefined);
    keys.registerKey.mockResolvedValue({});
    await renderWithProviders(<OperatorsPage />);
    const security = await screen.findByRole("region", { name: "Your security" });
    expect(within(security).getByText(/Key checked · 10 min left/)).toBeInTheDocument();

    await user.type(within(security).getByLabelText("Name for a new key"), "Spare");
    await user.click(within(security).getByRole("button", { name: "Add a key" }));
    expect(keys.registerKey).toHaveBeenCalledWith("Spare");
    expect(await within(security).findByText("Key added.")).toBeInTheDocument();

    await user.click(within(security).getByRole("button", { name: "End key check now" }));
    expect(keys.endKeyCheck).toHaveBeenCalledTimes(1);
    expect(await within(security).findByText("Key check ended.")).toBeInTheDocument();
  });

  it("a list that can't load says so and offers to try again", async () => {
    viewer.permissions = ["operators.read"];
    api({
      ...base(),
      [`GET ${OPS}`]: [
        { status: 500, body: { error: { code: "internal_error", message: "x", details: {} } } },
      ],
    });
    await renderWithProviders(<OperatorsPage />);
    expect(await screen.findByText("Couldn’t load operators")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});
