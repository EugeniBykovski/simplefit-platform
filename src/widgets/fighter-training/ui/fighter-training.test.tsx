import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type * as TimeZone from "@/shared/lib/time-zone";
import { jsonResponse, renderWithProviders, testQueryClient } from "@/test/render";

import { FighterSessionDetail } from "./fighter-session-detail";
import { FighterTraining } from "./fighter-training";

/*
 * WFT1 Training and WFT2 Session (SF-67) on the SF-62 / SF-63 fighter API,
 * with the network mocked at `fetch`. Only what the backend returns is
 * shown, in the projection it computed; not available (404) is never an
 * empty list; a session is completed only after the fighter confirmed and
 * the backend answered, and a lost answer never claims either outcome.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  SessionChangedError: class SessionChangedError extends Error {},
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

type Call = { method: string; path: string; query: URLSearchParams; body: unknown };
type Reply = Response | Error | ((call: Call) => Response | Promise<Response>);

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
        body: init.body,
      };
      calls.push(call);
      const reply = routes[`${call.method} ${call.path}`];
      if (reply === undefined)
        return Promise.reject(new Error(`unexpected ${call.method} ${call.path}`));
      if (reply instanceof Error) return Promise.reject(reply);
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

const SESSIONS = "/api/v1/me/training-sessions";

const session = (overrides: Record<string, unknown> = {}) => ({
  id: "ses-1",
  relationship_id: "rel-1",
  coach: { display_name: "Julia Nowak", brand_name: "North Gym" },
  coach_display_name_at_end: null,
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

const one = (overrides: Record<string, unknown> = {}) =>
  jsonResponse({ training_session: session(overrides) });

describe("FighterTraining (WFT1)", () => {
  it("lists the upcoming projection by day, with each session's coach, in its own time zone", async () => {
    const calls = server({
      [`GET ${SESSIONS}`]: page([
        session(),
        session({
          id: "ses-2",
          title: "Pads",
          training_type: "pads",
          starts_at: "2026-10-21T18:00:00Z",
          coach: { display_name: null, brand_name: null },
          duration_minutes: 45,
        }),
        session({
          id: "ses-3",
          title: "Roadwork",
          training_type: "roadwork",
          starts_at: "2026-10-23T15:30:00Z",
          coach: { display_name: "Tomasz M.", brand_name: null },
        }),
      ]),
    });
    await renderWithProviders(<FighterTraining />);

    await screen.findByRole("heading", { name: "Wed, Oct 21, 2026" });
    expect(calls[0]?.query.get("view")).toBe("upcoming");
    expect(calls[0]?.query.has("status")).toBe(false);
    const rows = within(screen.getByRole("list", { name: "Wed, Oct 21, 2026" })).getAllByRole(
      "listitem",
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("06:00 PM");
    expect(rows[0]).toHaveTextContent("Julia Nowak · North Gym");
    expect(rows[0]).toHaveTextContent("Planned");
    expect(rows[1]).toHaveTextContent("Coach not shared");
    expect(within(rows[0]!).getByRole("link", { name: "Technical boxing" })).toHaveAttribute(
      "href",
      "/app/training/ses-1",
    );
    expect(screen.getByRole("list", { name: "Fri, Oct 23, 2026" })).toHaveTextContent("Tomasz M.");
    expect(screen.getByRole("link", { name: "Upcoming" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("navigation", { name: "Show" })).toBeNull();
  });

  it("reads history narrowed by status, with a former coach and a past-due session kept planned", async () => {
    const calls = server({
      [`GET ${SESSIONS}`]: page([
        session({
          starts_at: "2026-10-01T16:00:00Z",
          coach: null,
          coach_display_name_at_end: "Tomasz M.",
        }),
      ]),
    });
    await renderWithProviders(<FighterTraining view="history" filter="cancelled" />);

    await screen.findByRole("heading", { name: "Thu, Oct 1, 2026" });
    expect(calls[0]?.query.get("view")).toBe("history");
    expect(calls[0]?.query.get("status")).toBe("cancelled");
    expect(screen.getByRole("link", { name: "Cancelled" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Completed" })).toHaveAttribute(
      "href",
      "/app/training?view=history&status=completed",
    );
    expect(screen.getByRole("link", { name: "History" })).toHaveAttribute(
      "href",
      "/app/training?view=history",
    );
    const row = screen.getByRole("listitem");
    expect(row).toHaveTextContent("Former coach · Tomasz M.");
    expect(row).toHaveTextContent("Planned");
  });

  it("pages with the backend's cursor and keeps the list when a page fails", async () => {
    let second = 0;
    const calls = server({
      [`GET ${SESSIONS}`]: (call) => {
        if (!call.query.has("cursor")) return page([session()], "c-2");
        second += 1;
        return second === 1
          ? error(500, "internal_error")
          : page([session({ id: "ses-9", title: "Later", starts_at: "2026-10-22T16:00:00Z" })]);
      },
    });
    const user = userEvent.setup();
    await renderWithProviders(<FighterTraining />);

    await user.click(await screen.findByRole("button", { name: "Show more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t load more sessions. Try again.",
    );
    expect(screen.getByRole("link", { name: "Technical boxing" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByRole("link", { name: "Later" })).toBeVisible();
    expect(calls.at(-1)?.query.get("cursor")).toBe("c-2");
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull();
  });

  it("tells an empty projection, unavailability and a failure apart", async () => {
    server({ [`GET ${SESSIONS}`]: page([]) });
    const first = await renderWithProviders(<FighterTraining view="history" filter="completed" />);
    expect(await screen.findByText("No completed training yet")).toBeVisible();
    first.unmount();

    server({ [`GET ${SESSIONS}`]: error(404, "not_found") });
    const second = await renderWithProviders(<FighterTraining view="history" />);
    expect(await screen.findByText("Training isn’t available")).toBeVisible();
    expect(screen.queryByRole("navigation", { name: "Show" })).toBeNull();
    second.unmount();

    let attempt = 0;
    server({
      [`GET ${SESSIONS}`]: () =>
        ++attempt === 1 ? error(500, "internal_error") : page([session()]),
    });
    const user = userEvent.setup();
    await renderWithProviders(<FighterTraining />);
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t load your training.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("link", { name: "Technical boxing" })).toBeVisible();
  });
});

describe("FighterSessionDetail (WFT2)", () => {
  it("shows the coach, the start in the session's zone and the fighter's own, and Mark as completed while planned", async () => {
    server({ [`GET ${SESSIONS}/ses-1`]: one() });
    await renderWithProviders(<FighterSessionDetail sessionId="ses-1" />);

    expect(await screen.findByRole("heading", { name: "Technical boxing" })).toBeVisible();
    const facts = screen.getByRole("region", { name: "Session" });
    expect(facts).toHaveTextContent("CoachJulia Nowak · North Gym");
    expect(facts).toHaveTextContent(
      "StartsWed, Oct 21, 2026, 06:00 PM · Europe/Warsaw (UTC+02:00)",
    );
    expect(facts).toHaveTextContent("Your timeWed, Oct 21, 2026, 12:00 PM · America/New_York");
    expect(facts).toHaveTextContent("Duration60 min");
    expect(facts).toHaveTextContent("Notes from your coachJab work.");
    expect(screen.getByRole("button", { name: "Mark as completed" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to training" })).toHaveAttribute(
      "href",
      "/app/training",
    );
  });

  it("completes only after confirmation, with no body, and shows what the backend stored", async () => {
    const calls = server({
      [`GET ${SESSIONS}/ses-1`]: one(),
      [`POST ${SESSIONS}/ses-1/complete`]: one({
        status: "completed",
        completed_at: "2026-10-21T17:12:00Z",
      }),
      [`GET ${SESSIONS}`]: page([]),
    });
    const user = userEvent.setup();
    await renderWithProviders(<FighterSessionDetail sessionId="ses-1" />);

    await user.click(await screen.findByRole("button", { name: "Mark as completed" }));
    const dialog = screen.getByRole("alertdialog", { name: "Mark this session completed?" });
    expect(dialog).toHaveTextContent("Julia Nowak sees it as completed");
    await user.click(within(dialog).getByRole("button", { name: "Not yet" }));
    expect(calls.some((call) => call.method === "POST")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Mark as completed" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Mark as completed" }),
    );
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(toast.success).toHaveBeenCalledWith("Session marked as completed.");
    const post = calls.find((call) => call.method === "POST");
    expect(post?.body).toBeUndefined();
    expect(screen.getByRole("region", { name: "Session" })).toHaveTextContent(
      "CompletedWed, Oct 21, 2026, 01:12 PM",
    );
    expect(screen.queryByRole("button", { name: "Mark as completed" })).toBeNull();
  });

  it("explains a refusal: not started yet, or cancelled meanwhile", async () => {
    let reads = 0;
    server({
      [`GET ${SESSIONS}/ses-1`]: () =>
        ++reads < 3
          ? one()
          : one({
              status: "cancelled",
              cancelled_at: "2026-10-21T15:00:00Z",
              cancelled_by: "coach",
            }),
      [`POST ${SESSIONS}/ses-1/complete`]: () =>
        reads < 2
          ? error(409, "conflict", { starts_at: "not_started" })
          : error(409, "conflict", { status: "cancelled" }),
      [`GET ${SESSIONS}`]: page([]),
    });
    const user = userEvent.setup();
    await renderWithProviders(<FighterSessionDetail sessionId="ses-1" />);

    await user.click(await screen.findByRole("button", { name: "Mark as completed" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Mark as completed" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This session hasn’t started yet.You can mark it completed from its start time on. Nothing was saved.",
    );

    await user.click(screen.getByRole("button", { name: "Mark as completed" }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Mark as completed" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("This session was cancelled."),
    );
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Session" })).toHaveTextContent(
        "CancelledWed, Oct 21, 2026, 11:00 AM · by your coach",
      ),
    );
    expect(screen.queryByRole("button", { name: "Mark as completed" })).toBeNull();
  });

  it("keeps the dialog and the session on a lost answer, and never completes twice on retry", async () => {
    let posts = 0;
    const calls = server({
      [`GET ${SESSIONS}/ses-1`]: one(),
      [`POST ${SESSIONS}/ses-1/complete`]: () => {
        posts += 1;
        if (posts === 1) throw new TypeError("Failed to fetch");
        return one({ status: "completed", completed_at: "2026-10-21T17:12:00Z" });
      },
      [`GET ${SESSIONS}`]: page([]),
    });
    const queryClient = testQueryClient();
    const user = userEvent.setup();
    await renderWithProviders(<FighterSessionDetail sessionId="ses-1" />, { queryClient });

    await user.click(await screen.findByRole("button", { name: "Mark as completed" }));
    const confirm = within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Mark as completed",
    });
    await user.click(confirm);
    expect(await within(screen.getByRole("alertdialog")).findByRole("alert")).toHaveTextContent(
      "It may already be saved",
    );
    // Marked stale, not read again at once: the session stays on screen.
    expect(queryClient.getQueryState([`${SESSIONS}/ses-1`])?.isInvalidated).toBe(true);
    expect(calls.filter((call) => call.path === `${SESSIONS}/ses-1`)).toHaveLength(1);
    // The modal hides the page from assistive tech; the session is still rendered under it.
    expect(screen.getByRole("heading", { name: "Technical boxing", hidden: true })).toBeVisible();

    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(posts).toBe(2);
    expect(screen.getByRole("region", { name: "Session" })).toHaveTextContent("Completed");
  });

  it("keeps a shown session when reading it again fails, and replaces it only on 404", async () => {
    let reads = 0;
    server({
      [`GET ${SESSIONS}/ses-1`]: () => {
        reads += 1;
        if (reads === 1) return one();
        return reads === 2 ? error(503, "internal_error") : error(404, "not_found");
      },
    });
    const queryClient = testQueryClient();
    await renderWithProviders(<FighterSessionDetail sessionId="ses-1" />, { queryClient });
    expect(await screen.findByRole("heading", { name: "Technical boxing" })).toBeVisible();

    await act(() => queryClient.refetchQueries({ queryKey: [`${SESSIONS}/ses-1`] }));
    expect(screen.getByRole("heading", { name: "Technical boxing" })).toBeVisible();

    await act(() => queryClient.refetchQueries({ queryKey: [`${SESSIONS}/ses-1`] }));
    expect(await screen.findByText("This session isn’t available")).toBeVisible();
  });

  it("shows terminal sessions read-only: completed, cancelled by the system, and an ended relationship's started session", async () => {
    server({
      [`GET ${SESSIONS}/ses-1`]: one({
        status: "cancelled",
        coach: null,
        coach_display_name_at_end: "Tomasz M.",
        cancelled_at: "2026-10-20T07:30:00Z",
        cancelled_by: "system",
        cancel_reason: "relationship_ended",
      }),
      [`GET ${SESSIONS}/ses-2`]: one({
        id: "ses-2",
        coach: null,
        coach_display_name_at_end: null,
      }),
    });
    const first = await renderWithProviders(<FighterSessionDetail sessionId="ses-1" />);
    const facts = await screen.findByRole("region", { name: "Session" });
    expect(facts).toHaveTextContent("CoachFormer coach · Tomasz M.");
    expect(facts).toHaveTextContent(
      "CancelledTue, Oct 20, 2026, 03:30 AM · the coaching relationship ended",
    );
    expect(screen.queryByRole("button", { name: "Mark as completed" })).toBeNull();
    expect(screen.getByText(/can’t be completed/)).toBeVisible();
    first.unmount();

    const user = userEvent.setup();
    await renderWithProviders(<FighterSessionDetail sessionId="ses-2" />);
    expect(await screen.findByText(/The coaching relationship ended/)).toBeVisible();
    expect(screen.getByRole("region", { name: "Session" })).toHaveTextContent(
      "CoachCoach not shared",
    );
    await user.click(screen.getByRole("button", { name: "Mark as completed" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Your coach sees it as completed");
  });

  it("treats someone else's or an unknown session as not available", async () => {
    server({ [`GET ${SESSIONS}/nope`]: error(404, "not_found") });
    await renderWithProviders(<FighterSessionDetail sessionId="nope" />);
    expect(await screen.findByText("This session isn’t available")).toBeVisible();
    for (const link of screen.getAllByRole("link", { name: "Back to training" }))
      expect(link).toHaveAttribute("href", "/app/training");
    expect(screen.queryByRole("button", { name: "Mark as completed" })).toBeNull();
  });
});
