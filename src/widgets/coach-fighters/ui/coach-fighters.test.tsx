import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { jsonResponse, renderWithProviders } from "@/test/render";

import { CoachFighters } from "./coach-fighters";

/*
 * WC7 Coach fighters (SF-58) on the SF-56 roster and the SF-57 invitations,
 * with the network mocked at `fetch`. Only what the backend returns is
 * shown, unavailable (404) is never an empty roster, and the browser never
 * decides an invitation or relationship outcome on its own.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));

const replace = vi.fn();
vi.mock("@/shared/i18n/navigation", () => ({
  usePathname: () => "/app/coach/fighters",
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

type Call = { method: string; path: string; query: URLSearchParams; body: unknown };
type Reply = Response | ((call: Call) => Response);

/** A fetch stub routing `METHOD /path` to replies; every request is recorded. */
function server(routes: Record<string, Reply>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), "http://localhost");
      const call: Call = {
        method: (init.method ?? "GET").toUpperCase(),
        path: url.pathname,
        query: url.searchParams,
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      const reply = routes[`${call.method} ${call.path}`];
      if (reply === undefined)
        return Promise.reject(new Error(`unexpected ${call.method} ${call.path}`));
      return Promise.resolve(typeof reply === "function" ? reply(call) : reply.clone());
    }),
  );
  return calls;
}

const error = (status: number, code: string, details: Record<string, unknown> = {}, headers = {}) =>
  jsonResponse(
    { error: { code, message: "English text clients never show", details, request_id: "req-1" } },
    { status, headers },
  );

const FIGHTERS = "/api/v1/me/coach/fighters";
const INVITATIONS = "/api/v1/me/coach/invitations";
const DATA_RULES = "/api/v1/me/coach/data-rules";

const ACTIVE = {
  relationship_id: "rel-1",
  status: "active",
  started_at: "2026-09-01T10:00:00Z",
  ended_at: null,
  ended_by: null,
  disclosure_version: "fighter-disclosure-2026-10",
  disclosed_fields: [
    "display_name",
    "username",
    "city",
    "country_code",
    "experience_level",
    "stance",
  ],
  fighter: {
    display_name: "Alex Kowal",
    username: "alexk",
    city: "Warsaw",
    country_code: "PL",
    experience_level: "amateur",
    stance: "southpaw",
    amateur_bout_count: null,
    // Privacy canaries: never part of the DTO; must never render even if sent.
    weight_kg: 71.5,
    email: "alex@private.example",
    date_of_birth: "2001-02-03",
    goals: ["secret goal"],
  },
  fighter_display_name_at_end: null,
};

const ENDED = {
  relationship_id: "rel-9",
  status: "ended",
  started_at: "2026-03-01T10:00:00Z",
  ended_at: "2026-08-01T10:00:00Z",
  ended_by: "fighter",
  disclosure_version: "fighter-disclosure-2026-10",
  disclosed_fields: [],
  fighter: null,
  fighter_display_name_at_end: "Sam Ended",
};

const PENDING = {
  invitation_id: "inv-1",
  status: "pending",
  recipient_email: "f•••@example.com",
  message: null,
  created_at: "2026-10-10T10:00:00Z",
  expires_at: "2026-10-24T10:00:00Z",
  last_sent_at: "2026-10-10T10:00:00Z",
  resends_remaining: 2,
  responded_at: null,
};

const ACCEPTED = {
  ...PENDING,
  invitation_id: "inv-2",
  status: "accepted",
  recipient_email: "a•••@example.com",
  resends_remaining: 0,
  responded_at: "2026-10-11T10:00:00Z",
};

const page = (relationships: unknown[], next_cursor: string | null = null) =>
  jsonResponse({ relationships, next_cursor });
const invitations = (items: unknown[]) => jsonResponse({ invitations: items, next_cursor: null });
const RULES_PUBLISHED = jsonResponse({
  data_rules: {
    document_version: "coach-data-rules-2026-10",
    acknowledged_at: "2026-10-01T10:00:00Z",
  },
});
const RULES_MISSING = jsonResponse({
  data_rules: { document_version: null, acknowledged_at: null },
});

beforeEach(() => {
  replace.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe("CoachFighters (WC7) roster", () => {
  it("shows only the disclosed C1+C2 fields and links each row by relationship id", async () => {
    const calls = server({
      [`GET ${FIGHTERS}`]: page([ACTIVE]),
      [`GET ${INVITATIONS}`]: invitations([]),
    });
    await renderWithProviders(<CoachFighters />);

    const table = await screen.findByRole("table", { name: "Active fighters" });
    const row = within(table).getByRole("row", { name: /Alex Kowal/ });
    // One link per row (the name), addressed by the relationship id only.
    expect(within(row).getByRole("link", { name: "Alex Kowal" })).toHaveAttribute(
      "href",
      "/app/coach/fighters/rel-1",
    );
    expect(within(row).getByText("@alexk")).toBeVisible();
    expect(within(row).getByText("Warsaw, Poland")).toBeVisible();
    expect(within(row).getByText("Amateur")).toBeVisible();
    expect(within(row).getByText("Southpaw")).toBeVisible();
    // Bouts not disclosed: "Not shared", never a zero.
    expect(within(row).getByText("Not shared")).toBeVisible();
    expect(within(row).queryByText(/^0$/)).toBeNull();

    expect(screen.queryByText(/71\.5|alex@private|2001|secret goal/)).toBeNull();
    expect(calls.find((call) => call.path === FIGHTERS)?.query.get("status")).toBe("active");
    // Only the coach's own endpoints are read; never a fighter profile DTO.
    expect(calls.every((call) => call.path.startsWith("/api/v1/me/coach/"))).toBe(true);
  });

  it("pages with the backend cursor", async () => {
    const calls = server({
      [`GET ${FIGHTERS}`]: (call) =>
        call.query.get("cursor") === "c2"
          ? page([
              {
                ...ACTIVE,
                relationship_id: "rel-2",
                fighter: { ...ACTIVE.fighter, display_name: "Bo Second" },
              },
            ])
          : page([ACTIVE], "c2"),
      [`GET ${INVITATIONS}`]: invitations([]),
    });
    await renderWithProviders(<CoachFighters />);
    await userEvent.click(await screen.findByRole("button", { name: "Show more" }));

    expect(await screen.findByRole("row", { name: /Bo Second/ })).toBeVisible();
    expect(screen.getByRole("row", { name: /Alex Kowal/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
    expect(
      calls.filter((call) => call.path === FIGHTERS).map((call) => call.query.get("cursor")),
    ).toEqual([null, "c2"]);
  });

  it("tells an empty roster apart from sharing not being available", async () => {
    server({ [`GET ${FIGHTERS}`]: page([]), [`GET ${INVITATIONS}`]: invitations([]) });
    const { unmount } = await renderWithProviders(<CoachFighters />);
    expect(await screen.findByText("No fighters yet")).toBeVisible();
    expect(screen.queryByText("Fighters aren’t available yet")).toBeNull();
    expect(screen.getByRole("button", { name: "Invite fighter" })).toBeEnabled();
    unmount();

    const calls = server({
      [`GET ${FIGHTERS}`]: error(404, "not_found"),
      [`GET ${INVITATIONS}`]: error(404, "not_found"),
    });
    await renderWithProviders(<CoachFighters />);
    expect(await screen.findByText("Fighters aren’t available yet")).toBeVisible();
    expect(screen.queryByText("No fighters yet")).toBeNull();
    expect(screen.getByText("Invitations open together with fighters.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Invite fighter" })).toBeDisabled();
    // The gate is the backend's: only the two lists are read, nothing is sent.
    expect(new Set(calls.map((call) => `${call.method} ${call.path}`))).toEqual(
      new Set([`GET ${FIGHTERS}`, `GET ${INVITATIONS}`]),
    );
  });

  it("offers a retry when the roster fails to load", async () => {
    let fail = true;
    server({
      [`GET ${FIGHTERS}`]: () => (fail ? error(500, "internal_error") : page([ACTIVE])),
      [`GET ${INVITATIONS}`]: invitations([]),
    });
    await renderWithProviders(<CoachFighters />);
    expect(await screen.findByText("We couldn’t load your fighters.")).toBeVisible();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("row", { name: /Alex Kowal/ })).toBeVisible();
  });

  it("lists ended relationships with dates and the name at the end only", async () => {
    const calls = server({
      [`GET ${FIGHTERS}`]: page([ENDED]),
      [`GET ${INVITATIONS}`]: invitations([]),
    });
    await renderWithProviders(<CoachFighters view="ended" />);
    const table = await screen.findByRole("table", { name: "Ended relationships" });
    const row = within(table).getByRole("row", { name: /Sam Ended/ });
    expect(within(row).queryByRole("link")).toBeNull();
    expect(within(row).getByText("Fighter")).toBeVisible();
    expect(calls.find((call) => call.path === FIGHTERS)?.query.get("status")).toBe("ended");

    await userEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(replace).toHaveBeenCalledWith("/app/coach/fighters");
  });
});

describe("CoachFighters (WC7) invitations", () => {
  it("lists invitations apart from the roster, with actions only while pending", async () => {
    server({
      [`GET ${FIGHTERS}`]: page([]),
      [`GET ${INVITATIONS}`]: invitations([PENDING, ACCEPTED]),
    });
    await renderWithProviders(<CoachFighters />);
    const section = await screen.findByRole("region", { name: "Invitations" });
    const items = await within(section).findAllByRole("listitem");
    expect(within(items[0]!).getByText("f•••@example.com")).toBeVisible();
    expect(within(items[0]!).getByText("Pending")).toBeVisible();
    expect(within(items[0]!).getByRole("button", { name: /Resend the invitation/ })).toBeVisible();
    expect(within(items[1]!).getByText("Accepted")).toBeVisible();
    expect(within(items[1]!).queryByRole("button")).toBeNull();
    // A pending or accepted invitation is not a roster member.
    expect(screen.getByText("No fighters yet")).toBeVisible();
  });

  it("cancels a pending invitation after confirmation", async () => {
    let cancelled = false;
    const calls = server({
      [`GET ${FIGHTERS}`]: page([]),
      [`GET ${INVITATIONS}`]: () =>
        invitations([
          cancelled
            ? { ...PENDING, status: "cancelled", responded_at: "2026-10-12T10:00:00Z" }
            : PENDING,
        ]),
      [`POST ${INVITATIONS}/inv-1/cancel`]: () => {
        cancelled = true;
        return new Response(null, { status: 204 });
      },
    });
    await renderWithProviders(<CoachFighters />);
    await userEvent.click(await screen.findByRole("button", { name: /Cancel the invitation/ }));
    const dialog = screen.getByRole("alertdialog", { name: "Cancel this invitation?" });
    expect(calls.some((call) => call.method === "POST")).toBe(false);
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel invitation" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Invitation to f•••@example.com cancelled."),
    );
    expect(await screen.findByText("Cancelled")).toBeVisible();
  });

  it("reports the resend cooldown the backend returns", async () => {
    server({
      [`GET ${FIGHTERS}`]: page([]),
      [`GET ${INVITATIONS}`]: invitations([PENDING]),
      [`POST ${INVITATIONS}/inv-1/resend`]: error(429, "rate_limited", {}, { "retry-after": "42" }),
    });
    await renderWithProviders(<CoachFighters />);
    await userEvent.click(await screen.findByRole("button", { name: /Resend the invitation/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You can resend in 42 seconds."));
  });
});

describe("CoachFighters (WC7) invite composer", () => {
  async function openComposer(rules: Response, extra: Record<string, Reply> = {}) {
    const calls = server({
      [`GET ${FIGHTERS}`]: page([]),
      [`GET ${INVITATIONS}`]: invitations([]),
      [`GET ${DATA_RULES}`]: rules,
      ...extra,
    });
    await renderWithProviders(<CoachFighters />);
    await userEvent.click(await screen.findByRole("button", { name: "Invite fighter" }));
    return calls;
  }

  it("blocks inviting truthfully while the coach data rules are not published", async () => {
    const calls = await openComposer(RULES_MISSING);
    const dialog = await screen.findByRole("dialog", { name: "Inviting isn’t available yet" });
    // No acknowledgement checkbox and no invented legal text or version.
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("sends the trimmed address and note, and shows what the backend created", async () => {
    const calls = await openComposer(RULES_PUBLISHED, {
      [`POST ${INVITATIONS}`]: jsonResponse(
        { invitation: { ...PENDING, invitation_id: "inv-new" } },
        { status: 201 },
      ),
    });
    const dialog = await screen.findByRole("dialog", { name: "Invite a fighter" });
    await userEvent.type(within(dialog).getByLabelText("Email"), "  fighter@example.com ");
    await userEvent.type(within(dialog).getByLabelText("Note · optional"), " See you at the gym ");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("Invitation created")).toBeVisible();
    expect(screen.getByText(/We’re emailing f•••@example\.com/)).toBeVisible();
    const post = calls.find((call) => call.method === "POST");
    expect(post?.body).toEqual({ email: "fighter@example.com", message: "See you at the gym" });
    // The browser never creates a token or a link.
    expect(JSON.stringify(post?.body)).not.toMatch(/token/i);
  });

  it("validates the address before sending and maps the backend's own-address code", async () => {
    const calls = await openComposer(RULES_PUBLISHED, {
      [`POST ${INVITATIONS}`]: error(422, "validation_error", {
        fields: { email: ["is your own address"] },
        field_codes: { email: ["invalid"] },
      }),
    });
    const dialog = await screen.findByRole("dialog", { name: "Invite a fighter" });
    const email = within(dialog).getByLabelText("Email");
    await userEvent.type(email, "not-an-address");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect(await within(dialog).findByText("Enter a valid email address.")).toBeVisible();
    expect(calls.some((call) => call.method === "POST")).toBe(false);

    await userEvent.clear(email);
    await userEvent.type(email, "me@example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect(await within(dialog).findByText("You can’t invite your own address.")).toBeVisible();
    expect(email).toHaveAttribute("aria-invalid", "true");
  });

  it("shows the backend's pending limit and turns an unacknowledged conflict into the blocked state", async () => {
    let reply = error(409, "conflict", { pending_invitations: "limit_reached" });
    await openComposer(RULES_PUBLISHED, { [`POST ${INVITATIONS}`]: () => reply });
    const dialog = await screen.findByRole("dialog", { name: "Invite a fighter" });
    await userEvent.type(within(dialog).getByLabelText("Email"), "fighter@example.com");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "You have 50 pending invitations.",
    );

    reply = error(409, "conflict", { data_rules_acknowledgement: "required" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Send invitation" }));
    expect(
      await screen.findByRole("dialog", { name: "Inviting isn’t available yet" }),
    ).toBeVisible();
  });
});
