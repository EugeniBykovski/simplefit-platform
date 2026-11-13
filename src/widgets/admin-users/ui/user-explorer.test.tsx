import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { UserExplorer } from "./user-explorer";

/*
 * AD7's tabs (SF-123) with the network mocked at `fetch`: each tab appears only with its
 * permission, a lookup sends the exact query and its reason, the profile opens with the
 * same reason, and links to an account or a gym appear only for an operator who may
 * open them (the backend checks again).
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  useSession: () => ({ status: "authenticated", viewer: { id: "viewer-id" } }),
}));
const permissions = vi.hoisted(() => ({ current: [] as string[] }));
vi.mock("@/entities/operator", () => ({
  needsEnrollment: () => false,
  useOperator: () => ({ data: { permissions: permissions.current } }),
  useOperatorKeys: () => ({ verifyKey: vi.fn() }),
  grants: (operator: { permissions: string[] }, permission: string) =>
    operator.permissions.includes(permission),
}));
const replace = vi.fn();
vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={`/en${href}`} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace }),
}));

const FIGHTER = "5f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const COACH = "6f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const USER = "8f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const GYM = "9f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";

const fighterSummary = {
  id: FIGHTER,
  user_id: USER,
  display_name: "Alex K.",
  username: "alex_k",
  profile_status: "completed",
  account_status: "active",
  active_relationships: 1,
};
const fighter = {
  ...fighterSummary,
  country_code: "PL",
  city: "Warsaw",
  experience_level: "amateur",
  stance: "southpaw",
  created_at: "2026-10-01T10:00:00Z",
  relationships: { active: 1, ended: 2 },
  gym_memberships: 1,
};
const coachSummary = {
  id: COACH,
  user_id: USER,
  display_name: "Coach Marek",
  brand_name: "Marek Boxing",
  profile_status: "completed",
  account_status: "suspended",
  active_relationships: 3,
};
const coach = {
  ...coachSummary,
  country_code: "PL",
  city: "Warsaw",
  languages: ["pl", "en"],
  coaching_formats: ["personal_training"],
  competition_levels: [],
  created_at: "2026-10-01T10:00:00Z",
  relationships: { active: 3, ended: 1, invitations_pending: 2 },
  gyms: [{ gym_id: GYM, since: "2026-10-05T10:00:00Z" }],
};

function api(routes: Record<string, { status: number; body: unknown }>) {
  const calls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const url = new URL(input);
      calls.push(url);
      const answer = routes[url.pathname];
      if (!answer) throw new Error(`unexpected ${url.pathname}`);
      return Promise.resolve(jsonResponse(answer.body, { status: answer.status }));
    }),
  );
  return calls;
}

const user = userEvent.setup();
afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
  permissions.current = [];
});

async function lookup(label: RegExp, query: string, reason = "Support request") {
  await user.type(screen.getByRole("textbox", { name: label }), query);
  await user.click(screen.getByRole("combobox", { name: /Reason/ }));
  await user.click(await screen.findByRole("option", { name: reason }));
  await user.click(screen.getByRole("button", { name: "Search" }));
}

describe("AD7 tabs (SF-123)", () => {
  it("shows only the tabs the operator holds; none is the restricted state", async () => {
    permissions.current = ["fighters.read"];
    const first = await renderWithProviders(<UserExplorer initialTab="accounts" />);
    const tabs = screen.getByRole("tablist", { name: "What to look up" });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual(["Fighters"]);
    expect(within(tabs).getByRole("tab", { name: "Fighters" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    first.unmount();

    permissions.current = ["gyms.read"];
    await renderWithProviders(<UserExplorer initialTab={null} />);
    expect(screen.getByText("You don’t have access to this section")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("switching tabs puts only the tab in the URL", async () => {
    permissions.current = ["users.read", "fighters.read", "coaches.read"];
    await renderWithProviders(<UserExplorer initialTab="accounts" />);
    await user.click(screen.getByRole("tab", { name: "Coaches" }));
    expect(replace).toHaveBeenCalledWith("/admin/users?tab=coaches");
  });

  it("a fighter lookup sends the exact query and reason; the profile opens with that reason", async () => {
    permissions.current = ["fighters.read"];
    const calls = api({
      "/api/v1/admin/fighters": { status: 200, body: { fighters: [fighterSummary] } },
      [`/api/v1/admin/fighters/${FIGHTER}`]: { status: 200, body: { fighter } },
    });
    await renderWithProviders(<UserExplorer initialTab="fighters" />);

    await lookup(/@username, exact email or user ID/, "@alex_k", "Abuse report");
    expect(await screen.findByText("Alex K.")).toBeInTheDocument();
    expect(calls[0]!.searchParams.get("query")).toBe("@alex_k");
    expect(calls[0]!.searchParams.get("reason_code")).toBe("abuse_report");
    expect(screen.getByText("1 active relationship")).toBeInTheDocument();

    const toggle = screen.getByRole("button", { name: "Show profile" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    const profile = await screen.findByRole("region", { name: "Profile" });
    expect(calls[1]!.pathname).toBe(`/api/v1/admin/fighters/${FIGHTER}`);
    expect(calls[1]!.searchParams.get("reason_code")).toBe("abuse_report");
    expect(within(profile).getByText("Southpaw")).toBeInTheDocument();
    expect(within(profile).getByText(/no permission exists for them/)).toBeInTheDocument();
    const relationships = screen.getByRole("region", { name: "Coaching relationships" });
    expect(within(relationships).getByText("2")).toBeInTheDocument();
    // No users.read: the account isn't linked.
    expect(screen.getByText("Needs account access")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open account" })).not.toBeInTheDocument();
  });

  it("a coach's account and gyms link only with users.read and gyms.read, with the reason", async () => {
    permissions.current = ["coaches.read", "users.read", "gyms.read"];
    api({
      "/api/v1/admin/coaches": { status: 200, body: { coaches: [coachSummary] } },
      [`/api/v1/admin/coaches/${COACH}`]: { status: 200, body: { coach } },
    });
    await renderWithProviders(<UserExplorer initialTab="coaches" />);

    await lookup(/Exact email or user ID/, USER, "Legal request");
    await user.click(await screen.findByRole("button", { name: "Show profile" }));

    expect(await screen.findByRole("link", { name: "Open account" })).toHaveAttribute(
      "href",
      `/en/admin/users/${USER}?reason=legal_request`,
    );
    expect(screen.getByRole("link", { name: /Open gym/ })).toHaveAttribute(
      "href",
      `/en/admin/tenants/${GYM}?reason=legal_request`,
    );
    expect(screen.getAllByText("Suspended").length).toBeGreaterThan(0);
    expect(screen.getByText("Polish, English")).toBeInTheDocument();
    expect(screen.getByText(/Coaches have no verification/)).toBeInTheDocument();
  });

  it("no match, rate limit and a forbidden lookup", async () => {
    permissions.current = ["coaches.read"];
    api({ "/api/v1/admin/coaches": { status: 200, body: { coaches: [] } } });
    const first = await renderWithProviders(<UserExplorer initialTab="coaches" />);
    await lookup(/Exact email or user ID/, "nobody@example.com");
    expect(await screen.findByText("No coach matches")).toBeInTheDocument();
    first.unmount();

    api({
      "/api/v1/admin/coaches": {
        status: 429,
        body: { error: { code: "rate_limited", message: "x", details: {} } },
      },
    });
    const second = await renderWithProviders(<UserExplorer initialTab="coaches" />);
    await lookup(/Exact email or user ID/, "a@example.com");
    expect(await screen.findByText(/Too many searches/)).toBeInTheDocument();
    second.unmount();

    api({
      "/api/v1/admin/coaches": {
        status: 403,
        body: { error: { code: "forbidden", message: "x", details: {} } },
      },
    });
    await renderWithProviders(<UserExplorer initialTab="coaches" />);
    await lookup(/Exact email or user ID/, "a@example.com");
    await waitFor(() =>
      expect(screen.getByText("You don’t have access to this section")).toBeInTheDocument(),
    );
  });
});
