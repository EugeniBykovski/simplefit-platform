import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { GymDetail } from "./gym-detail";
import { GymList } from "./gym-list";

/*
 * AD2 and AD12 (SF-123) with the network mocked at `fetch`: filters go to the server,
 * pages follow the backend's cursor, a late answer to an older filter never shows,
 * every gym read carries a reason, and nothing is shown that the backend didn't send.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));
const permissions = vi.hoisted(() => ({ current: ["gyms.read"] as string[] }));
vi.mock("@/entities/operator", () => ({
  useOperator: () => ({ data: { permissions: permissions.current } }),
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

const ID = "7b1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const OWNER = "1a1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const row = (overrides: Record<string, unknown> = {}) => ({
  id: ID,
  name: "Alpha Boxing",
  gym_type: "boxing_club",
  lifecycle: "completed",
  verification_status: "approved",
  country_code: "PL",
  city: "Kraków",
  staff_count: 4,
  created_at: "2026-10-01T10:00:00Z",
  ...overrides,
});
const gym = (overrides: Record<string, unknown> = {}) => ({
  gym: {
    ...row(),
    revision: 3,
    owner: { user_id: OWNER, short_name: "Natalia W." },
    staff: { manager: 1, coach: 2, front_desk: 0 },
    staff_invitations_pending: 1,
    members: { active: 120, requested: 3 },
    verification: {
      status: "approved",
      revision: 2,
      submitted_at: "2026-10-02T10:00:00Z",
      decided_at: "2026-10-03T10:00:00Z",
    },
    ...overrides,
  },
});
const error = (status: number, code: string) => ({
  status,
  body: { error: { code, message: "x", details: {} } },
});

type Answer = { status: number; body?: unknown } | Promise<Response>;

function api(answer: (url: URL) => Answer) {
  const calls: URL[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      const url = new URL(input);
      calls.push(url);
      const result = answer(url);
      if (result instanceof Promise) return result;
      return Promise.resolve(jsonResponse(result.body, { status: result.status }));
    }),
  );
  return calls;
}

const user = userEvent.setup();
afterEach(() => {
  vi.unstubAllGlobals();
  replace.mockReset();
  permissions.current = ["gyms.read"];
});

describe("AD2 gym list (SF-123)", () => {
  it("shows the backend's gyms in a table, newest first, with no member data", async () => {
    const calls = api(() => ({ status: 200, body: { gyms: [row()], next_cursor: null } }));
    await renderWithProviders(<GymList />);

    const table = await screen.findByRole("table", { name: "Gyms, newest first" });
    const link = within(table).getByRole("link", { name: "Alpha Boxing" });
    expect(link).toHaveAttribute("href", `/en/admin/tenants/${ID}`);
    expect(within(table).getByText("Set up")).toBeInTheDocument();
    expect(within(table).getByText("Approved")).toBeInTheDocument();
    expect(within(table).getByText("Kraków, PL")).toBeInTheDocument();
    expect(calls[0]!.searchParams.get("limit")).toBe("25");
    expect(screen.getByText(/no gym is public/)).toBeInTheDocument();
  });

  it("sends filters to the server: name (debounced), verification, a valid country only", async () => {
    const calls = api(() => ({ status: 200, body: { gyms: [row()], next_cursor: null } }));
    await renderWithProviders(<GymList />);
    await screen.findByRole("table");

    await user.type(screen.getByRole("textbox", { name: "Name starts with" }), "Alp");
    await waitFor(() => expect(calls.at(-1)!.searchParams.get("query")).toBe("Alp"));
    expect(calls.filter((url) => url.searchParams.get("query") === "A")).toEqual([]);

    await user.click(screen.getByRole("combobox", { name: "Verification" }));
    await user.click(await screen.findByRole("option", { name: "Changes requested" }));
    await waitFor(() =>
      expect(calls.at(-1)!.searchParams.get("verification")).toBe("changes_requested"),
    );

    const country = screen.getByRole("textbox", { name: "Country" });
    await user.type(country, "p");
    expect(calls.some((url) => url.searchParams.has("country"))).toBe(false);
    await user.type(country, "l");
    await waitFor(() => expect(calls.at(-1)!.searchParams.get("country")).toBe("PL"));
  });

  it("pages with the backend's cursor, and back", async () => {
    const calls = api((url) =>
      url.searchParams.get("cursor") === "next-1"
        ? { status: 200, body: { gyms: [row({ id: OWNER, name: "Beta Gym" })], next_cursor: null } }
        : { status: 200, body: { gyms: [row()], next_cursor: "next-1" } },
    );
    await renderWithProviders(<GymList />);
    await screen.findByRole("link", { name: "Alpha Boxing" });

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("link", { name: "Beta Gym" })).toBeInTheDocument();
    expect(calls.at(-1)!.searchParams.get("cursor")).toBe("next-1");
    expect(screen.getByText("Page 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(await screen.findByRole("link", { name: "Alpha Boxing" })).toBeInTheDocument();
  });

  it("a late answer to an older filter never shows as the current one", async () => {
    let releaseOld: (response: Response) => void = () => {};
    api((url) => {
      if (url.searchParams.get("query") === "Old")
        return new Promise<Response>((resolve) => (releaseOld = resolve));
      if (url.searchParams.get("query") === "Older")
        return { status: 200, body: { gyms: [row({ name: "Older Gym" })], next_cursor: null } };
      return { status: 200, body: { gyms: [], next_cursor: null } };
    });
    await renderWithProviders(<GymList />);
    const name = screen.getByRole("textbox", { name: "Name starts with" });

    await user.type(name, "Old");
    await waitFor(() => expect(screen.getByRole("status", { name: "Loading gyms" })).toBeVisible());
    await user.type(name, "er");
    expect(await screen.findByRole("link", { name: "Older Gym" })).toBeInTheDocument();

    releaseOld(jsonResponse({ gyms: [row({ name: "Stale Gym" })], next_cursor: null }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Stale Gym")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Older Gym" })).toBeInTheDocument();
  });

  it("empty, error with retry, and restricted (no filters, no data)", async () => {
    api(() => ({ status: 200, body: { gyms: [], next_cursor: null } }));
    const { unmount } = await renderWithProviders(<GymList />);
    expect(await screen.findByText("No gyms match")).toBeInTheDocument();
    unmount();

    let fail = true;
    api(() =>
      fail
        ? error(500, "internal_error")
        : { status: 200, body: { gyms: [row()], next_cursor: null } },
    );
    const second = await renderWithProviders(<GymList />);
    expect(await screen.findByText("We couldn’t load this")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Alpha Boxing" })).toBeInTheDocument();
    second.unmount();

    api(() => error(403, "forbidden"));
    await renderWithProviders(<GymList />);
    expect(await screen.findByText("You don’t have access to this section")).toBeInTheDocument();
    expect(screen.queryByRole("search")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("AD12 gym detail (SF-123)", () => {
  it("asks for a reason first, then reads with it and keeps it in the URL", async () => {
    const calls = api(() => ({ status: 200, body: gym() }));
    await renderWithProviders(<GymDetail gymId={ID} initialReason={null} />);

    expect(screen.getByText("Why are you opening this gym?")).toBeInTheDocument();
    expect(calls).toEqual([]);
    await user.click(screen.getByRole("combobox", { name: /Reason/ }));
    await user.click(await screen.findByRole("option", { name: "Abuse report" }));
    await user.click(screen.getByRole("button", { name: "Open gym" }));

    expect(await screen.findByRole("heading", { name: /Alpha Boxing/ })).toBeInTheDocument();
    expect(calls[0]!.pathname).toBe(`/api/v1/admin/gyms/${ID}`);
    expect(calls[0]!.searchParams.get("reason_code")).toBe("abuse_report");
    expect(replace).toHaveBeenCalledWith(`/admin/tenants/${ID}?reason=abuse_report`);
  });

  it("shows people as counts and the owner's short name; verification status only", async () => {
    api(() => ({ status: 200, body: gym() }));
    await renderWithProviders(<GymDetail gymId={ID} initialReason="support_request" />);

    const people = await screen.findByRole("region", { name: "People" });
    expect(within(people).getByText("Natalia W.")).toBeInTheDocument();
    expect(within(people).queryByRole("link")).not.toBeInTheDocument();
    expect(within(people).getByText("120")).toBeInTheDocument();
    expect(
      within(people).getByText("Member names and contact details aren’t shown here."),
    ).toBeInTheDocument();
    const verification = screen.getByRole("region", { name: "Business verification" });
    expect(within(verification).getByText("Approved")).toBeInTheDocument();
    expect(
      within(verification).getByText(/reviewing isn’t part of the Control Plane yet/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /suspend/i })).not.toBeInTheDocument();
  });

  it("links the owner's account only for an operator with users.read, carrying the reason", async () => {
    permissions.current = ["gyms.read", "users.read"];
    api(() => ({ status: 200, body: gym() }));
    await renderWithProviders(<GymDetail gymId={ID} initialReason="legal_request" />);

    expect(await screen.findByRole("link", { name: "Natalia W." })).toHaveAttribute(
      "href",
      `/en/admin/users/${OWNER}?reason=legal_request`,
    );
  });

  it("once the operator's grants no longer include gyms.read, nothing read before shows", async () => {
    permissions.current = [];
    api(() => ({ status: 200, body: gym() }));
    await renderWithProviders(<GymDetail gymId={ID} initialReason="support_request" />);
    expect(await screen.findByText("You don’t have access to this section")).toBeInTheDocument();
    expect(screen.queryByText("Natalia W.")).not.toBeInTheDocument();
  });

  it("a draft gym, an unknown gym and a forbidden read", async () => {
    api(() => ({
      status: 200,
      body: gym({
        lifecycle: "draft",
        country_code: null,
        city: null,
        verification: {
          status: "not_started",
          revision: null,
          submitted_at: null,
          decided_at: null,
        },
      }),
    }));
    const first = await renderWithProviders(
      <GymDetail gymId={ID} initialReason="support_request" />,
    );
    expect(await screen.findByText("Setting up")).toBeInTheDocument();
    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(screen.queryByText("Revision")).toBeInTheDocument();
    first.unmount();

    api(() => error(404, "not_found"));
    const second = await renderWithProviders(
      <GymDetail gymId={ID} initialReason="support_request" />,
    );
    expect(await screen.findByText("No such gym")).toBeInTheDocument();
    second.unmount();

    api(() => error(403, "forbidden"));
    await renderWithProviders(<GymDetail gymId={ID} initialReason="support_request" />);
    expect(await screen.findByText("You don’t have access to this section")).toBeInTheDocument();
    expect(screen.queryByText("Alpha Boxing")).not.toBeInTheDocument();
  });
});
