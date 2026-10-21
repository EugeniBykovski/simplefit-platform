import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type * as TimeZone from "@/shared/lib/time-zone";
import { jsonResponse, renderWithProviders, testQueryClient } from "@/test/render";

import { CoachSessionDetail } from "./coach-session-detail";
import { CoachSessions } from "./coach-sessions";

/*
 * WCT1 planner and WCT2 session (SF-64) on the SF-62 / SF-63 API, with the
 * network mocked at `fetch`. Only what the backend returns is shown, in the
 * projection it computed; unavailable (404) is never an empty list; a
 * session is shown as cancelled only after the backend said so.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));

vi.mock("@/shared/i18n/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/shared/lib/time-zone", async (importOriginal) => ({
  ...(await importOriginal<typeof TimeZone>()),
  browserTimeZone: () => "America/New_York",
}));

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

type Call = { method: string; path: string; query: URLSearchParams };
type Reply = Response | ((call: Call) => Response | Promise<Response>);

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

const error = (status: number, code: string, details: Record<string, unknown> = {}) =>
  jsonResponse(
    { error: { code, message: "English text clients never show", details, request_id: "r" } },
    { status },
  );

const SESSIONS = "/api/v1/me/coach/training-sessions";

const session = (overrides: Record<string, unknown> = {}) => ({
  id: "ses-1",
  relationship_id: "rel-1",
  fighter: { display_name: "Alex Kowal", username: "alexk" },
  title: "Technical boxing",
  training_type: "technical",
  starts_at: "2026-10-21T16:00:00Z",
  time_zone: "Europe/Warsaw",
  duration_minutes: 60,
  notes: "Jab work.",
  status: "planned",
  completed_at: null,
  cancelled_at: null,
  cancelled_by: null,
  cancel_reason: null,
  inserted_at: "2026-10-20T10:00:00Z",
  updated_at: "2026-10-20T10:00:00Z",
  ...overrides,
});

const page = (training_sessions: unknown[], next_cursor: string | null = null) =>
  jsonResponse({ training_sessions, next_cursor });

describe("CoachSessions (WCT1)", () => {
  it("lists the upcoming projection by day, in each session's own time zone", async () => {
    const calls = server({
      [`GET ${SESSIONS}`]: page([
        session(),
        session({
          id: "ses-2",
          title: "Pads with coach",
          training_type: "pads",
          starts_at: "2026-10-21T18:00:00Z",
          fighter: { display_name: null, username: null },
          duration_minutes: 45,
        }),
        session({
          id: "ses-3",
          title: "Roadwork",
          training_type: "roadwork",
          starts_at: "2026-10-23T15:30:00Z",
        }),
      ]),
    });
    await renderWithProviders(<CoachSessions />);

    await screen.findByRole("heading", { name: "Wed, Oct 21, 2026" });
    expect(calls[0]?.query.get("view")).toBe("upcoming");
    expect(calls[0]?.query.has("status")).toBe(false);
    // Each day's list is named by its heading.
    const rows = within(screen.getByRole("list", { name: "Wed, Oct 21, 2026" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("06:00 PM");
    expect(rows[0]).toHaveTextContent("Europe/Warsaw");
    expect(rows[0]).toHaveTextContent("Alex Kowal");
    expect(rows[0]).toHaveTextContent("Planned");
    expect(within(rows[0]!).getByRole("link", { name: "Technical boxing" })).toHaveAttribute(
      "href",
      "/app/coach/sessions/ses-1",
    );
    expect(rows[1]).toHaveTextContent("Fighter not shared");
    expect(screen.getByRole("heading", { name: "Fri, Oct 23, 2026" })).toBeVisible();
    expect(screen.getByRole("link", { name: "New session" })).toHaveAttribute(
      "href",
      "/app/coach/sessions/new",
    );
    expect(screen.getByRole("link", { name: "Upcoming" })).toHaveAttribute("aria-current", "page");
  });

  it("reads history narrowed by status and keeps a past-due session planned", async () => {
    const calls = server({
      [`GET ${SESSIONS}`]: page([session({ starts_at: "2026-10-01T16:00:00Z" })]),
    });
    await renderWithProviders(<CoachSessions view="history" filter="completed" />);

    await screen.findByRole("heading", { name: "Thu, Oct 1, 2026" });
    expect(calls[0]?.query.get("view")).toBe("history");
    expect(calls[0]?.query.get("status")).toBe("completed");
    expect(screen.getByRole("link", { name: "Completed" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cancelled" })).toHaveAttribute(
      "href",
      "/app/coach/sessions?view=history&status=cancelled",
    );
    expect(screen.getByRole("listitem")).toHaveTextContent("Planned");
  });

  it("pages with the backend's cursor", async () => {
    const calls = server({
      [`GET ${SESSIONS}`]: (call) =>
        call.query.get("cursor") === "c2"
          ? page([session({ id: "ses-9", title: "Later", starts_at: "2026-11-02T16:00:00Z" })])
          : page([session()], "c2"),
    });
    const user = userEvent.setup();
    await renderWithProviders(<CoachSessions />);
    await user.click(await screen.findByRole("button", { name: "Show more" }));

    expect(await screen.findByRole("link", { name: "Later" })).toBeVisible();
    expect(calls[1]?.query.get("view")).toBe("upcoming");
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("tells an empty projection, unavailability and a failure apart", async () => {
    server({ [`GET ${SESSIONS}`]: page([]) });
    const first = await renderWithProviders(<CoachSessions />);
    expect(await screen.findByText("No upcoming sessions")).toBeVisible();
    first.unmount();

    server({ [`GET ${SESSIONS}`]: error(404, "not_found") });
    const second = await renderWithProviders(<CoachSessions />);
    expect(await screen.findByText("Sessions aren’t available yet")).toBeVisible();
    expect(screen.getByRole("button", { name: "New session" })).toBeDisabled();
    expect(screen.queryByText("No upcoming sessions")).toBeNull();
    second.unmount();

    let fail = true;
    server({
      [`GET ${SESSIONS}`]: () => (fail ? error(500, "internal_error") : page([session()])),
    });
    const user = userEvent.setup();
    await renderWithProviders(<CoachSessions />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t load your sessions.");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Technical boxing" })).toBeVisible();
  });
});

describe("CoachSessionDetail (WCT2)", () => {
  it("keeps a shown session when reading it again fails, and replaces it only on 404 (SF-70)", async () => {
    let reads = 0;
    server({
      [`GET ${SESSIONS}/ses-1`]: () => {
        reads += 1;
        if (reads === 1) return jsonResponse({ training_session: session() });
        return reads === 2 ? error(503, "internal_error") : error(404, "not_found");
      },
    });
    const queryClient = testQueryClient();
    await renderWithProviders(<CoachSessionDetail sessionId="ses-1" />, { queryClient });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Technical boxing" }),
    ).toBeVisible();

    await act(() => queryClient.refetchQueries({ queryKey: [`${SESSIONS}/ses-1`] }));
    expect(queryClient.getQueryState([`${SESSIONS}/ses-1`])?.status).toBe("error");
    expect(reads).toBe(2);
    expect(screen.getByRole("heading", { level: 1, name: "Technical boxing" })).toBeVisible();
    expect(screen.queryByText("We couldn’t load this session.")).toBeNull();

    await act(() => queryClient.refetchQueries({ queryKey: [`${SESSIONS}/ses-1`] }));
    expect(await screen.findByText("This session isn’t available")).toBeVisible();
  });

  it("shows the plan in the session's zone and the coach's own, with Edit and Cancel while planned", async () => {
    server({ [`GET ${SESSIONS}/ses-1`]: jsonResponse({ training_session: session() }) });
    await renderWithProviders(<CoachSessionDetail sessionId="ses-1" />);

    expect(await screen.findByRole("heading", { name: "Technical boxing" })).toBeVisible();
    const facts = document.querySelector("dl")!;
    expect(facts).toHaveTextContent("Alex Kowal · @alexk");
    expect(facts).toHaveTextContent("Wed, Oct 21, 2026, 06:00 PM · Europe/Warsaw (UTC+02:00)");
    // The coach's browser is in New York: noon there.
    expect(facts).toHaveTextContent("Wed, Oct 21, 2026, 12:00 PM · America/New_York");
    expect(facts).toHaveTextContent("60 minutes");
    expect(facts).toHaveTextContent("Jab work.");
    expect(screen.getByText("Planned")).toBeVisible();
    expect(screen.getByRole("link", { name: "Edit" })).toHaveAttribute(
      "href",
      "/app/coach/sessions/ses-1/edit",
    );
    expect(screen.getByRole("button", { name: "Cancel session" })).toBeVisible();
  });

  it("cancels only after confirmation and shows it cancelled once the backend answered", async () => {
    const calls = server({
      [`GET ${SESSIONS}/ses-1`]: jsonResponse({ training_session: session() }),
      [`POST ${SESSIONS}/ses-1/cancel`]: jsonResponse({
        training_session: session({
          status: "cancelled",
          cancelled_at: "2026-10-20T07:30:00Z",
          cancelled_by: "coach",
        }),
      }),
      [`GET ${SESSIONS}`]: page([]),
    });
    const user = userEvent.setup();
    await renderWithProviders(<CoachSessionDetail sessionId="ses-1" />);
    await user.click(await screen.findByRole("button", { name: "Cancel session" }));

    const dialog = screen.getByRole("alertdialog", { name: "Cancel this session?" });
    expect(dialog).toHaveTextContent("Alex Kowal sees it as cancelled.");
    await user.click(within(dialog).getByRole("button", { name: "Keep session" }));
    expect(calls.some((call) => call.method === "POST")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Cancel session" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel session" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(toast.success).toHaveBeenCalledWith("The session is cancelled.");
    expect(screen.getByText("Cancelled", { selector: "[data-status]" })).toBeVisible();
    expect(screen.getByText("Tue, Oct 20, 2026, 03:30 AM · by you")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  });

  it("keeps the dialog open on a failure and reports a session completed meanwhile", async () => {
    let reply: () => Promise<Response> = () => Promise.reject(new TypeError("offline"));
    server({
      [`GET ${SESSIONS}/ses-1`]: jsonResponse({ training_session: session() }),
      [`POST ${SESSIONS}/ses-1/cancel`]: () => reply(),
      [`GET ${SESSIONS}`]: page([]),
    });
    const user = userEvent.setup();
    await renderWithProviders(<CoachSessionDetail sessionId="ses-1" />);
    await user.click(await screen.findByRole("button", { name: "Cancel session" }));
    const confirm = within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Cancel session",
    });
    await user.click(confirm);
    expect(await within(screen.getByRole("alertdialog")).findByRole("alert")).toHaveTextContent(
      "We couldn’t cancel the session. Nothing changed. Try again.",
    );

    reply = () => Promise.resolve(error(409, "conflict", { status: "completed" }));
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(toast).toHaveBeenCalledWith(
      "This session can’t be cancelled any more: the fighter completed it.",
    );
  });

  it("shows a completed session's completion and no actions", async () => {
    server({
      [`GET ${SESSIONS}/ses-1`]: jsonResponse({
        training_session: session({ status: "completed", completed_at: "2026-10-21T17:12:00Z" }),
      }),
    });
    await renderWithProviders(<CoachSessionDetail sessionId="ses-1" />);
    expect(await screen.findByText("Completed", { selector: "[data-status]" })).toBeVisible();
    expect(screen.getByText("Wed, Oct 21, 2026, 01:12 PM")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Cancel session" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  });

  it("names a system cancellation and treats 404 as not available", async () => {
    server({
      [`GET ${SESSIONS}/ses-1`]: jsonResponse({
        training_session: session({
          status: "cancelled",
          cancelled_at: "2026-10-20T07:30:00Z",
          cancelled_by: "system",
          cancel_reason: "relationship_ended",
        }),
      }),
    });
    const first = await renderWithProviders(<CoachSessionDetail sessionId="ses-1" />);
    expect(await screen.findByText(/the coaching relationship ended/)).toBeVisible();
    first.unmount();

    server({ [`GET ${SESSIONS}/ses-x`]: error(404, "not_found") });
    await renderWithProviders(<CoachSessionDetail sessionId="ses-x" />);
    expect(await screen.findByText("This session isn’t available")).toBeVisible();
    expect(screen.getAllByRole("link", { name: "Back to sessions" })[0]).toHaveAttribute(
      "href",
      "/app/coach/sessions",
    );
  });
});
