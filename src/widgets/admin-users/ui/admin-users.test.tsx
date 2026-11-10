import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { AccountActionDialog } from "./account-action-dialog";
import { AccountDetail } from "./account-detail";
import { AccountSearch } from "./account-search";

/*
 * AD7, AD8 and AD9 (SF-122) with the network mocked at `fetch`: every read carries a
 * reason, nothing is shown that the backend didn't send, and an action is shown done
 * only when the backend answered it.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  useSession: () => ({ status: "authenticated", viewer: { id: "viewer-id" } }),
}));
const verifyKey = vi.fn();
vi.mock("@/entities/operator", () => ({ useOperatorKeys: () => ({ verifyKey }) }));
const replace = vi.fn();
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={`/en${href}`} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace }),
}));

const ID = "3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const contexts = {
  fighter_profile: "completed",
  coach_profile: "not_started",
  gym_staff: 0,
  gym_member: 1,
  sponsor_memberships: 0,
  platform_operator: false,
};
const summary = {
  id: ID,
  name: "Natalia W.",
  joined_at: "2026-10-01T10:00:00Z",
  status: "active",
  masked_emails: ["n•••@example.com"],
  contexts,
};
const account = (overrides: Record<string, unknown> = {}) => ({
  user: {
    ...summary,
    revision: 1,
    suspension: null,
    registration: "complete",
    providers: ["email", "google"],
    sessions: [{ started_at: "2026-11-10T09:00:00Z", expires_at: "2027-02-08T09:00:00Z" }],
    last_sign_in_at: "2026-11-10T09:00:00Z",
    ...overrides,
  },
});
const error = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  body: { error: { code, message: "x", details } },
});
const preview = (token = "sfc_token") => ({
  status: 200,
  body: {
    preview: {
      action: "user.suspend",
      target: { type: "user", id: ID, status: "active" },
      expected_revision: 1,
      current_state: "active",
      proposed_state: "suspended",
      permission: null,
      impact: ["signed_out_everywhere", "sign_in_refused", "data_kept", "memberships_unchanged"],
      required_permission: "users.restrict",
      required_assurance: "fresh_key",
      reason_code: "fraud",
      confirmation: { required: true, token, expires_at: "2026-11-10T12:02:00Z" },
    },
  },
});

type Answer = { status: number; body?: unknown } | "offline";

function api(routes: Record<string, Answer[]>) {
  const calls: { key: string; url: URL; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string, init: RequestInit = {}) => {
      const url = new URL(input);
      const key = `${init.method ?? "GET"} ${url.pathname}`;
      calls.push({ key, url, body: init.body ? JSON.parse(String(init.body)) : undefined });
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
afterEach(() => {
  vi.unstubAllGlobals();
  verifyKey.mockReset();
  replace.mockReset();
});

async function pickReason(label: RegExp | string, option: string) {
  await user.click(screen.getByRole("combobox", { name: label }));
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("AD7 account search (SF-122)", () => {
  it("needs a query and a reason; sends both; shows one masked result linking with the reason", async () => {
    const calls = api({ "GET /api/v1/admin/users": [{ status: 200, body: { users: [summary] } }] });
    await renderWithProviders(<AccountSearch />);
    expect(screen.getByText("Enter an exact email or user ID, and a reason.")).toBeVisible();
    const submit = screen.getByRole("button", { name: "Search" });
    expect(submit).toBeDisabled();

    await user.type(
      screen.getByRole("textbox", { name: /Exact email or user ID/ }),
      "Natalia@Example.com",
    );
    expect(submit).toBeDisabled();
    await pickReason(/Reason/, "Support request");
    await user.click(submit);

    const result = await screen.findByRole("link", { name: "Natalia W." });
    expect(result).toHaveAttribute("href", `/en/admin/users/${ID}?reason=support_request`);
    expect(screen.getByText("n•••@example.com")).toBeVisible();
    expect(calls[0]?.url.searchParams.get("query")).toBe("Natalia@Example.com");
    expect(calls[0]?.url.searchParams.get("reason_code")).toBe("support_request");
    expect(document.body).not.toHaveTextContent("natalia@example.com");
  });

  it("no match, no access and too many searches are each told apart", async () => {
    api({
      "GET /api/v1/admin/users": [{ status: 200, body: { users: [] } }, error(429, "rate_limited")],
    });
    await renderWithProviders(<AccountSearch />);
    await user.type(
      screen.getByRole("textbox", { name: /Exact email or user ID/ }),
      "nobody@example.com",
    );
    await pickReason(/Reason/, "Abuse report");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("No account matches")).toBeVisible();

    await user.type(screen.getByRole("textbox", { name: /Exact email or user ID/ }), "x");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many searches");
  });

  it("an operator without users.read sees the restricted state", async () => {
    api({ "GET /api/v1/admin/users": [error(403, "forbidden")] });
    await renderWithProviders(<AccountSearch />);
    await user.type(screen.getByRole("textbox", { name: /Exact email or user ID/ }), ID);
    await pickReason(/Reason/, "Legal request");
    await user.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("You don’t have access to this section")).toBeVisible();
  });
});

describe("AD8 account (SF-122)", () => {
  it("asks for a reason before reading anything", async () => {
    const calls = api({ [`GET /api/v1/admin/users/${ID}`]: [{ status: 200, body: account() }] });
    await renderWithProviders(<AccountDetail accountId={ID} initialReason={null} />);
    expect(
      screen.getByRole("heading", { name: "Why are you opening this account?" }),
    ).toBeVisible();
    expect(calls).toEqual([]);
    await pickReason(/Reason/, "Account security");
    await user.click(screen.getByRole("button", { name: "Open account" }));
    expect(await screen.findByRole("heading", { name: /Natalia W\./ })).toBeVisible();
    expect(calls[0]?.url.searchParams.get("reason_code")).toBe("account_security");
    expect(replace).toHaveBeenCalledWith(`/admin/users/${ID}?reason=account_security`);
  });

  it("shows the backend's account: masked email, methods, sessions, contexts; never more", async () => {
    api({ [`GET /api/v1/admin/users/${ID}`]: [{ status: 200, body: account() }] });
    await renderWithProviders(<AccountDetail accountId={ID} initialReason="support_request" />);
    await screen.findByRole("heading", { name: /Natalia W\./ });
    expect(screen.getByText("n•••@example.com")).toBeVisible();
    expect(screen.getByText("Email code · Google")).toBeVisible();
    expect(document.querySelector("[data-account-sessions]")).toHaveAttribute(
      "data-account-sessions",
      "1",
    );
    expect(screen.getByText(/No identity or document check exists/)).toBeVisible();
    expect(screen.getByText(/can’t change sign-in methods/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Suspend account" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /log in as|act as/i })).toBeNull();
  });

  it("a suspended account says so and offers lifting; an operator's account offers no action", async () => {
    api({
      [`GET /api/v1/admin/users/${ID}`]: [
        {
          status: 200,
          body: account({
            status: "suspended",
            revision: 2,
            suspension: { since: "2026-11-10T10:00:00Z", reason_code: "fraud" },
          }),
        },
      ],
    });
    await renderWithProviders(<AccountDetail accountId={ID} initialReason="support_request" />);
    expect(await screen.findByText(/Suspended since .*: Fraud\./)).toBeVisible();
    expect(screen.getByRole("button", { name: "Lift suspension" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Suspend account" })).toBeNull();
  });

  it("a platform operator's account is managed elsewhere: no suspend or sign-out here", async () => {
    api({
      [`GET /api/v1/admin/users/${ID}`]: [
        { status: 200, body: account({ contexts: { ...contexts, platform_operator: true } }) },
      ],
    });
    await renderWithProviders(<AccountDetail accountId={ID} initialReason="support_request" />);
    expect(await screen.findByText(/it’s managed in operator administration/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Suspend account" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out everywhere" })).toBeNull();
  });

  it("an unknown account is not found", async () => {
    api({ [`GET /api/v1/admin/users/${ID}`]: [error(404, "not_found")] });
    await renderWithProviders(<AccountDetail accountId={ID} initialReason="support_request" />);
    expect(await screen.findByText("No such account")).toBeVisible();
  });
});

describe("AD9 account action (SF-122)", () => {
  const dialog = (onSettled = vi.fn()) =>
    renderWithProviders(
      <AccountActionDialog
        action="suspend"
        accountId={ID}
        accountLabel="Natalia W."
        open
        onOpenChange={vi.fn()}
        onSettled={onSettled}
      />,
    );

  it("reason, the backend's preview, confirm: executes exactly what was previewed, then says done", async () => {
    const onSettled = vi.fn();
    const calls = api({
      [`POST /api/v1/admin/users/${ID}/suspend/preview`]: [preview()],
      [`POST /api/v1/admin/users/${ID}/suspend`]: [
        { status: 200, body: { user: { id: ID, status: "suspended", revision: 2 } } },
      ],
    });
    await dialog(onSettled);
    const box = screen.getByRole("dialog");
    expect(within(box).getByRole("heading", { name: "Suspend Natalia W.?" })).toBeVisible();
    await pickReason(/Reason/, "Fraud");
    await user.click(within(box).getByRole("button", { name: "Review" }));
    expect(await within(box).findByText("They’re signed out on every device now.")).toBeVisible();
    await user.click(within(box).getByRole("button", { name: "Confirm" }));
    expect(await within(box).findByText("Done. Recorded in the audit log.")).toBeVisible();

    const execute = calls.find((call) => call.key === `POST /api/v1/admin/users/${ID}/suspend`);
    expect(execute?.body).toMatchObject({
      reason_code: "fraud",
      expected_revision: 1,
      confirmation_token: "sfc_token",
    });
    expect((execute?.body as { operation_id: string }).operation_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(onSettled).toHaveBeenCalled();
  });

  it("asks for the security key when the backend needs a fresh check, then previews again", async () => {
    verifyKey.mockResolvedValue({});
    api({
      [`POST /api/v1/admin/users/${ID}/suspend/preview`]: [
        error(403, "step_up_required"),
        preview(),
      ],
    });
    await dialog();
    await pickReason(/Reason/, "Fraud");
    await user.click(screen.getByRole("button", { name: "Review" }));
    await user.click(await screen.findByRole("button", { name: "Use security key" }));
    expect(verifyKey).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Confirm" })).toBeVisible();
  });

  it("a conflict, a protected target and a lost answer are never shown as done", async () => {
    api({
      [`POST /api/v1/admin/users/${ID}/suspend/preview`]: [
        error(409, "conflict", { target: "operator" }),
        preview(),
      ],
      [`POST /api/v1/admin/users/${ID}/suspend`]: ["offline"],
    });
    await dialog();
    await pickReason(/Reason/, "Fraud");
    await user.click(screen.getByRole("button", { name: "Review" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("platform operator");
    expect(screen.queryByText(/Done\./)).toBeNull();
  });

  it("no answer at all is 'we don't know', with no retry offered", async () => {
    api({
      [`POST /api/v1/admin/users/${ID}/suspend/preview`]: [preview()],
      [`POST /api/v1/admin/users/${ID}/suspend`]: ["offline"],
    });
    await dialog();
    await pickReason(/Reason/, "Fraud");
    await user.click(screen.getByRole("button", { name: "Review" }));
    await user.click(await screen.findByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("We don’t know if this went through"),
    );
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
  });
});
