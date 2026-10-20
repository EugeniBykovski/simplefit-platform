import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CoachTrainingSession } from "@/entities/training-session";
import type * as TimeZone from "@/shared/lib/time-zone";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { CreateTrainingSessionForm, EditTrainingSessionForm } from "./training-session-form";

/*
 * The session form (WC3 / WCT3, SF-64) on the SF-62 API, with the network
 * mocked at `fetch`: the start goes out as an RFC 3339 instant with the
 * zone's offset; a time that does not exist is never sent and a repeated
 * one only with the coach's choice; a retry of the same session reuses its
 * request key; an edit sends only what changed.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
}));

vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The coach's browser is in Warsaw, whatever machine runs the tests.
vi.mock("@/shared/lib/time-zone", async (importOriginal) => ({
  ...(await importOriginal<typeof TimeZone>()),
  browserTimeZone: () => "Europe/Warsaw",
}));

type Call = { method: string; path: string; body: unknown };
type Reply = Response | ((call: Call) => Response | Promise<Response>);

/** A fetch stub routing `METHOD /path` to replies (a list answers in turn); every request is recorded. */
function server(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(String(input), "http://localhost");
      const call: Call = {
        method: (init.method ?? "GET").toUpperCase(),
        path: url.pathname,
        body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      const route = routes[`${call.method} ${call.path}`];
      const reply = Array.isArray(route) ? route.shift() : route;
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

const FIGHTERS = "/api/v1/me/coach/fighters";
const SESSIONS = "/api/v1/me/coach/training-sessions";

const RELATIONSHIP = {
  relationship_id: "rel-1",
  status: "active",
  started_at: "2026-09-01T10:00:00Z",
  ended_at: null,
  ended_by: null,
  disclosure_version: "v1",
  disclosed_fields: ["display_name", "username"],
  fighter: {
    display_name: "Alex Kowal",
    username: "alexk",
    city: null,
    country_code: null,
    experience_level: null,
    stance: null,
    amateur_bout_count: null,
  },
  fighter_display_name_at_end: null,
};

const roster = (relationships: unknown[]) => jsonResponse({ relationships, next_cursor: null });

const SESSION: CoachTrainingSession = {
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
};

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  { date = "2026-10-21", time = "18:00" } = {},
) {
  await user.type(await screen.findByLabelText("Title"), "  Technical boxing ");
  await user.click(screen.getByRole("radio", { name: "Technical" }));
  await user.type(screen.getByLabelText("Date"), date);
  await user.type(screen.getByLabelText("Start time"), time);
}

describe("CreateTrainingSessionForm", () => {
  it("sends the session with its zone's offset and a request key, then hands back the created session", async () => {
    const calls = server({
      [`GET ${FIGHTERS}`]: roster([RELATIONSHIP]),
      [`POST ${SESSIONS}`]: jsonResponse({ training_session: SESSION }, { status: 201 }),
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    await renderWithProviders(<CreateTrainingSessionForm onSaved={onSaved} />);

    // The only fighter is chosen; the zone is the coach's own.
    expect(await screen.findByRole("combobox", { name: "Fighter" })).toHaveTextContent(
      "Alex Kowal · @alexk",
    );
    expect(screen.getByRole("combobox", { name: "Time zone" })).toHaveTextContent("Europe/Warsaw");
    await fill(user);
    await user.type(screen.getByLabelText(/Notes for the fighter/), "Jab work.");
    await user.click(screen.getByRole("button", { name: "Assign session" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(SESSION));
    const post = calls.find((call) => call.method === "POST");
    expect(post?.body).toEqual({
      relationship_id: "rel-1",
      title: "Technical boxing",
      training_type: "technical",
      starts_at: "2026-10-21T18:00:00+02:00",
      time_zone: "Europe/Warsaw",
      duration_minutes: 60,
      notes: "Jab work.",
      client_request_id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      ),
    });
  });

  it("retries the same session with the same key and a changed one with a new key", async () => {
    const calls = server({
      [`GET ${FIGHTERS}`]: roster([RELATIONSHIP]),
      [`POST ${SESSIONS}`]: [
        () => Promise.reject(new TypeError("network down")),
        () => Promise.reject(new TypeError("network down")),
        jsonResponse({ training_session: SESSION }, { status: 200 }),
      ],
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    await renderWithProviders(<CreateTrainingSessionForm onSaved={onSaved} />);
    await fill(user);

    await user.click(screen.getByRole("button", { name: "Assign session" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn’t save the session. Nothing changed. Check your connection and try again; trying again never creates a second session.",
    );
    expect(onSaved).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Assign session" }));
    await waitFor(() => expect(calls.filter((call) => call.method === "POST")).toHaveLength(2));
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Pads");
    await user.click(screen.getByRole("button", { name: "Assign session" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    const keys = calls
      .filter((call) => call.method === "POST")
      .map((call) => (call.body as { client_request_id: string }).client_request_id);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("never sends a start time the clocks skip (spring forward)", async () => {
    const calls = server({ [`GET ${FIGHTERS}`]: roster([RELATIONSHIP]) });
    const user = userEvent.setup();
    await renderWithProviders(<CreateTrainingSessionForm onSaved={vi.fn()} />);
    await fill(user, { date: "2027-03-28", time: "02:30" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This time doesn’t exist on that day. The clocks in Europe/Warsaw skip this time",
    );
    await user.click(screen.getByRole("button", { name: "Assign session" }));
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });

  it("sends a repeated start time (fall back) only with the offset the coach chose", async () => {
    const calls = server({
      [`GET ${FIGHTERS}`]: roster([RELATIONSHIP]),
      [`POST ${SESSIONS}`]: jsonResponse({ training_session: SESSION }, { status: 201 }),
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    await renderWithProviders(<CreateTrainingSessionForm onSaved={onSaved} />);
    await fill(user, { date: "2026-10-25", time: "02:30" });

    const group = screen.getByRole("group", { name: "This time happens twice on that day." });
    expect(group).toHaveTextContent("Choose which 02:30");
    await user.click(screen.getByRole("button", { name: "Assign session" }));
    expect(await screen.findByText("Choose which of the two times you mean.")).toBeVisible();
    expect(calls.some((call) => call.method === "POST")).toBe(false);

    await user.click(screen.getByRole("radio", { name: "Second · UTC+01:00" }));
    await user.click(screen.getByRole("button", { name: "Assign session" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls.find((call) => call.method === "POST")?.body).toMatchObject({
      starts_at: "2026-10-25T02:30:00+01:00",
    });
  });

  it("shows the backend's field refusals on their fields", async () => {
    server({
      [`GET ${FIGHTERS}`]: roster([RELATIONSHIP]),
      [`POST ${SESSIONS}`]: error(422, "validation_error", {
        fields: { starts_at: ["must be between one day ago and one year from now"] },
        field_codes: { starts_at: ["out_of_range"] },
      }),
    });
    const user = userEvent.setup();
    await renderWithProviders(<CreateTrainingSessionForm onSaved={vi.fn()} />);
    await fill(user, { date: "2020-01-01" });
    await user.click(screen.getByRole("button", { name: "Assign session" }));

    expect(
      await screen.findByText("Choose a start between yesterday and one year from now."),
    ).toBeVisible();
    expect(screen.getByLabelText("Start time")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText(/must be between/)).toBeNull();
  });

  it("says the fighter can no longer be planned for when the backend answers 404", async () => {
    server({
      [`GET ${FIGHTERS}`]: roster([RELATIONSHIP]),
      [`POST ${SESSIONS}`]: error(404, "not_found"),
    });
    const user = userEvent.setup();
    await renderWithProviders(<CreateTrainingSessionForm onSaved={vi.fn()} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Assign session" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can’t plan for this fighter any more.",
    );
  });

  it("offers Fighters when there is nobody to plan for, and says when planning is unavailable", async () => {
    server({ [`GET ${FIGHTERS}`]: roster([]) });
    const { unmount } = await renderWithProviders(<CreateTrainingSessionForm onSaved={vi.fn()} />);
    expect(await screen.findByText("No fighters to plan for yet")).toBeVisible();
    expect(screen.getByRole("link", { name: "Go to Fighters" })).toHaveAttribute(
      "href",
      "/app/coach/fighters",
    );
    expect(screen.queryByLabelText("Title")).toBeNull();
    unmount();

    server({ [`GET ${FIGHTERS}`]: error(404, "not_found") });
    await renderWithProviders(<CreateTrainingSessionForm onSaved={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can’t plan for this fighter any more.",
    );
  });

  it("checks the fields before sending anything", async () => {
    const calls = server({ [`GET ${FIGHTERS}`]: roster([RELATIONSHIP]) });
    const user = userEvent.setup();
    await renderWithProviders(<CreateTrainingSessionForm onSaved={vi.fn()} />);
    await screen.findByLabelText("Title");
    await user.clear(screen.getByLabelText("Duration"));
    await user.type(screen.getByLabelText("Duration"), "4");
    await user.click(screen.getByRole("button", { name: "Assign session" }));

    expect(await screen.findByText("Enter a title of up to 80 characters.")).toBeVisible();
    expect(screen.getByText("Choose a training type.")).toBeVisible();
    expect(screen.getByText("Enter a whole number of minutes from 5 to 600.")).toBeVisible();
    expect(calls.some((call) => call.method === "POST")).toBe(false);
  });
});

describe("EditTrainingSessionForm", () => {
  it("starts from the session's wall time in its zone and sends only what changed", async () => {
    const calls = server({
      [`PATCH ${SESSIONS}/ses-1`]: jsonResponse({
        training_session: { ...SESSION, duration_minutes: 75, notes: null },
      }),
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();
    await renderWithProviders(<EditTrainingSessionForm session={SESSION} onSaved={onSaved} />);

    expect(screen.getByLabelText("Date")).toHaveValue("2026-10-21");
    expect(screen.getByLabelText("Start time")).toHaveValue("18:00");
    expect(screen.getByLabelText("Fighter")).toHaveValue("Alex Kowal · @alexk");
    expect(screen.getByLabelText("Fighter")).toHaveAttribute("readonly");

    await user.clear(screen.getByLabelText("Duration"));
    await user.type(screen.getByLabelText("Duration"), "75");
    await user.clear(screen.getByLabelText(/Notes for the fighter/));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(calls).toEqual([
      expect.objectContaining({
        method: "PATCH",
        body: { duration_minutes: 75, notes: null },
      }),
    ]);
  });

  it("sends a moved start with the offset of its new day", async () => {
    const calls = server({
      [`PATCH ${SESSIONS}/ses-1`]: jsonResponse({ training_session: SESSION }),
    });
    const user = userEvent.setup();
    await renderWithProviders(<EditTrainingSessionForm session={SESSION} onSaved={vi.fn()} />);
    await user.clear(screen.getByLabelText("Date"));
    await user.type(screen.getByLabelText("Date"), "2026-11-02");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toEqual({ starts_at: "2026-11-02T18:00:00+01:00" });
  });

  it("reports a session completed or cancelled meanwhile and never re-sends", async () => {
    const calls = server({
      [`PATCH ${SESSIONS}/ses-1`]: error(409, "conflict", { status: "completed" }),
    });
    const user = userEvent.setup();
    await renderWithProviders(<EditTrainingSessionForm session={SESSION} onSaved={vi.fn()} />);
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Pads");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This session can’t be changed any more.",
    );
    expect(calls.filter((call) => call.method === "PATCH")).toHaveLength(1);
  });

  it("offers no form for a session that already ended", async () => {
    server({});
    await renderWithProviders(
      <EditTrainingSessionForm session={{ ...SESSION, status: "completed" }} onSaved={vi.fn()} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("This session can’t be changed any more.");
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });
});
