import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  Gym,
  GymClassOccurrence,
  GymClassSeries,
  GymClassTemplate,
  GymStaffMember,
  GymVenue,
  GymViewerPermissionsItem,
} from "@/shared/api/generated/model";
import { Toaster } from "@/shared/ui/sonner";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { GymTimetable } from "./gym-timetable";

/*
 * The gym timetable (SF-98, WG5 with OG10) with the network mocked at
 * `fetch`: every class shown is a row the SF-97 API listed (no class is
 * built from a rule), wall times are the backend's in the venue's zone, a
 * window shows only once all its pages arrived, creates carry one
 * idempotency key per attempt, revisions guard every change, DST gaps and
 * repeated hours are explicit, and the actions follow the permission
 * projection. No booking, waitlist or attendance figure exists.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  onSessionBoundary: () => () => undefined,
}));

const GYM = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const OWNER_STAFF = "6a1b2c3d-0000-4000-8000-000000000101";
const COACH_STAFF = "6a1b2c3d-0000-4000-8000-000000000102";
const VENUE = "7a1b2c3d-0000-4000-8000-000000000201";
const TEMPLATE = "7a1b2c3d-0000-4000-8000-000000000301";
const SERIES = "7a1b2c3d-0000-4000-8000-000000000401";
const CLASS_A = "7a1b2c3d-0000-4000-8000-000000000501";
const CLASS_B = "7a1b2c3d-0000-4000-8000-000000000502";
const LOCATION = "5a1b2c3d-0000-4000-8000-000000000601";
/** Today in these tests: Wednesday 4 November 2026, 10:00 UTC (11:00 in Warsaw). */
const NOW = new Date("2026-11-04T10:00:00Z");

const PERMISSIONS: Record<Gym["viewer"]["role"], GymViewerPermissionsItem[]> = {
  owner: ["view_workspace", "view_staff", "manage_timetable", "cancel_occurrence"],
  manager: ["view_workspace", "view_staff", "manage_timetable", "cancel_occurrence"],
  coach: ["view_workspace", "view_staff", "cancel_occurrence"],
  front_desk: ["view_workspace", "view_staff"],
};

const gym = (role: Gym["viewer"]["role"] = "owner"): Gym => ({
  id: GYM,
  name: "Ring One Boxing",
  gym_type: "boxing_club",
  setup_status: "completed",
  inserted_at: "2026-10-27T10:00:00Z",
  updated_at: "2026-10-27T10:00:00Z",
  locations: [
    {
      id: LOCATION,
      name: "Praga",
      city: "Warsaw",
      address_line: "Ząbkowska 1",
      country_code: "PL",
      entrance_note: null,
      is_primary: true,
    },
  ],
  viewer: {
    role,
    staff_membership_id: role === "coach" ? COACH_STAFF : OWNER_STAFF,
    permissions: PERMISSIONS[role],
  },
});

const venue = (overrides: Partial<GymVenue> = {}): GymVenue => ({
  venue_id: VENUE,
  gym_id: GYM,
  gym_location_id: LOCATION,
  name: "Ring 2",
  description: null,
  capacity: 20,
  time_zone: "Europe/Warsaw",
  status: "active",
  revision: 1,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  ...overrides,
});

const template = (overrides: Partial<GymClassTemplate> = {}): GymClassTemplate => ({
  template_id: TEMPLATE,
  gym_id: GYM,
  title: "Technical boxing",
  description: null,
  default_duration_minutes: 90,
  default_capacity: 16,
  default_venue_id: VENUE,
  default_instructor: null,
  status: "active",
  revision: 1,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  ...overrides,
});

const occurrence = (overrides: Partial<GymClassOccurrence> = {}): GymClassOccurrence => ({
  occurrence_id: CLASS_A,
  gym_id: GYM,
  template_id: TEMPLATE,
  series_id: null,
  series_local_date: null,
  title: "Technical boxing",
  starts_at: "2026-11-05T17:00:00Z",
  ends_at: "2026-11-05T18:30:00Z",
  local_starts_at: "2026-11-05T18:00:00",
  local_ends_at: "2026-11-05T19:30:00",
  time_zone: "Europe/Warsaw",
  utc_offset_minutes: 60,
  duration_minutes: 90,
  capacity: 16,
  venue: { venue_id: VENUE, name: "Ring 2" },
  instructor: { staff_membership_id: COACH_STAFF, name: "Tomasz Z." },
  needs_instructor: false,
  rescheduled: false,
  status: "scheduled",
  cancel_reason: null,
  cancelled_at: null,
  revision: 1,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  ...overrides,
});

const series = (overrides: Partial<GymClassSeries> = {}): GymClassSeries => ({
  series_id: SERIES,
  gym_id: GYM,
  template_id: TEMPLATE,
  title: "Technical boxing",
  weekdays: [1, 3],
  local_start_time: "18:00",
  starts_on: "2027-03-01",
  ends_on: "2027-04-30",
  time_zone: "Europe/Warsaw",
  duration_minutes: 90,
  capacity: 16,
  venue: { venue_id: VENUE, name: "Ring 2" },
  instructor: null,
  status: "active",
  revision: 1,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
  scheduled_count: 17,
  cancelled_count: 0,
  skipped_dates: [],
  ...overrides,
});

const staff = (id: string, name: string, role: GymStaffMember["role"]): GymStaffMember => ({
  staff_membership_id: id,
  name,
  role,
  status: "active",
  is_viewer: id === OWNER_STAFF,
  joined_at: "2026-10-27T10:00:00Z",
  ended_at: null,
  ended_reason: null,
});

type Answer = { status: number; body?: unknown } | Error | (() => Promise<never>);
type Call = { method: string; path: string; search: URLSearchParams; body: unknown };

const BASE = `/api/v1/gyms/${GYM}`;
const OCCURRENCES = `${BASE}/class-occurrences`;

const DEFAULTS: Record<string, Answer[]> = {
  [`GET ${BASE}/venues`]: [{ status: 200, body: { venues: [venue()] } }],
  [`GET ${BASE}/class-templates`]: [{ status: 200, body: { templates: [template()] } }],
  [`GET ${BASE}/class-series`]: [{ status: 200, body: { series: [] } }],
  [`GET ${BASE}/staff`]: [
    {
      status: 200,
      body: {
        staff: [
          staff(OWNER_STAFF, "Yauheni B.", "owner"),
          staff(COACH_STAFF, "Tomasz Z.", "coach"),
          staff("6a1b2c3d-0000-4000-8000-000000000103", "Michał S.", "front_desk"),
        ],
        next_cursor: null,
      },
    },
  ],
  [`GET ${OCCURRENCES}`]: [
    { status: 200, body: { occurrences: [occurrence()], next_cursor: null } },
  ],
  [`GET ${BASE}`]: [{ status: 200, body: { gym: gym() } }],
};

/** A fake API keyed by `METHOD path`: queued answers in order (the last one repeats). */
function api(routes: Record<string, Answer[]> = {}) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const { pathname, searchParams } = new URL(url);
      const method = (init.method ?? "GET").toUpperCase();
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: pathname, search: searchParams, body });
      const queue = routes[`${method} ${pathname}`] ?? DEFAULTS[`${method} ${pathname}`];
      if (!queue) return Promise.resolve(jsonResponse({}, { status: 200 }));
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      if (answer instanceof Error) return Promise.reject(answer);
      if (typeof answer === "function") return answer();
      return Promise.resolve(
        answer.body === undefined
          ? new Response(null, { status: answer.status })
          : jsonResponse(answer.body, { status: answer.status }),
      );
    }),
  );
  return calls;
}

const error = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  body: { error: { code, message: code, details, request_id: null } },
});

const user = userEvent.setup();
const show = (role: Gym["viewer"]["role"] = "owner") =>
  renderWithProviders(
    <>
      <GymTimetable gym={gym(role)} />
      <Toaster />
    </>,
  );
const posts = (calls: Call[], path: string) =>
  calls.filter((call) => call.method === "POST" && call.path === path);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("GymTimetable (WG5, SF-98)", () => {
  it("shows the backend's classes at their wall time in the venue's zone, and no bookings", async () => {
    const calls = api();
    await show();
    const card = await screen.findByRole("button", {
      name: "Technical boxing, 18:00 to 19:30, Ring 2, Tomasz Z., capacity 16",
    });
    expect(card).toHaveAttribute("data-local-start", "2026-11-05T18:00:00");
    // One window of the week, read with the backend's own filters.
    const read = calls.find((call) => call.path === OCCURRENCES)!;
    expect(read.search.get("status")).toBe("scheduled");
    expect(read.search.get("limit")).toBe("100");
    const span = Date.parse(read.search.get("to")!) - Date.parse(read.search.get("from")!);
    expect(span / 86_400_000).toBeLessThanOrEqual(31);
    expect(screen.getByText(/Times in Europe\/Warsaw/)).toBeVisible();

    await user.click(card);
    const details = await screen.findByRole("region", { name: "Technical boxing" });
    expect(within(details).getByText("Europe/Warsaw (UTC+01:00)")).toBeVisible();
    expect(within(details).getByText("Up to 16 people")).toBeVisible();
    expect(within(details).getByRole("button", { name: "Change this class" })).toBeVisible();
    // A capacity is a limit: no booked count, occupancy, waitlist, attendance or money.
    expect(document.body).not.toHaveTextContent(
      /\d+\s*\/\s*\d+|\d+ booked|\d+ (spaces|spots) left|\d+\s?% (full|occupied)|waitlist \d|friends attending|PLN|revenue/i,
    );
  });

  it("shows nothing as the week until every page has arrived", async () => {
    let release: (value: Response) => void = () => undefined;
    const calls = api({
      [`GET ${OCCURRENCES}`]: [
        { status: 200, body: { occurrences: [occurrence()], next_cursor: "page-2" } },
        () => new Promise<never>((resolve) => (release = resolve as never)),
      ],
    });
    await show();
    expect(await screen.findByRole("status", { name: "Loading the timetable" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Technical boxing,/ })).toBeNull();
    await waitFor(() => expect(calls.filter((call) => call.path === OCCURRENCES)).toHaveLength(2));
    expect(calls.filter((call) => call.path === OCCURRENCES)[1]!.search.get("cursor")).toBe(
      "page-2",
    );
    release(
      jsonResponse({
        occurrences: [
          occurrence({
            occurrence_id: CLASS_B,
            title: "Pads",
            local_starts_at: "2026-11-06T19:00:00",
            local_ends_at: "2026-11-06T20:00:00",
            starts_at: "2026-11-06T18:00:00Z",
            ends_at: "2026-11-06T19:00:00Z",
          }),
        ],
        next_cursor: null,
      }),
    );
    expect(await screen.findByRole("button", { name: /^Pads, 19:00 to 20:00/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Technical boxing, 18:00/ })).toBeVisible();
  });

  it("asks for a venue first, offering it only to who may add one", async () => {
    api({
      [`GET ${BASE}/venues`]: [{ status: 200, body: { venues: [] } }],
      [`GET ${OCCURRENCES}`]: [{ status: 200, body: { occurrences: [], next_cursor: null } }],
    });
    const owner = await show();
    expect(await screen.findByText("Add a venue first")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add a venue" })).toBeVisible();
    owner.unmount();

    await show("front_desk");
    expect(await screen.findByText("Add a venue first")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add a venue" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Class" })).toBeNull();
  });

  it("schedules a one-time class with the zone's offset and retries a lost answer with the same key", async () => {
    const calls = api({
      [`POST ${OCCURRENCES}`]: [
        new TypeError("Failed to fetch"),
        {
          status: 201,
          body: {
            occurrence: occurrence({
              occurrence_id: CLASS_B,
              starts_at: "2026-11-20T17:00:00Z",
              local_starts_at: "2026-11-20T18:00:00",
              local_ends_at: "2026-11-20T19:30:00",
            }),
          },
        },
      ],
    });
    await show();
    await user.click(await screen.findByRole("button", { name: "Class" }));
    const dialog = await screen.findByRole("dialog", { name: "New class" });
    await user.clear(within(dialog).getByLabelText("Date"));
    await user.type(within(dialog).getByLabelText("Date"), "2026-11-20");
    await user.type(within(dialog).getByLabelText("Start time (Europe/Warsaw)"), "18:00");
    await user.click(within(dialog).getByRole("button", { name: "Schedule class" }));

    expect(
      await within(dialog).findByText("We couldn’t confirm whether this was saved."),
    ).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "New class" })).toBeNull());

    const [first, retry] = posts(calls, OCCURRENCES);
    expect(first!.body).toMatchObject({
      template_id: TEMPLATE,
      venue_id: VENUE,
      starts_at: "2026-11-20T18:00:00+01:00",
      duration_minutes: 90,
      capacity: 16,
      instructor_staff_membership_id: null,
    });
    // The very same request: the backend answers with what it created, never a second class.
    expect((retry!.body as { client_request_id: string }).client_request_id).toBe(
      (first!.body as { client_request_id: string }).client_request_id,
    );
  });

  it("says a skipped spring time before sending, and shows the backend's refusal", async () => {
    const calls = api({
      [`POST ${OCCURRENCES}`]: [
        error(422, "validation_error", {
          fields: { starts_at: ["has an offset that is not the time zone's"] },
          field_codes: { starts_at: ["invalid_format"] },
        }),
      ],
    });
    await show();
    await user.click(await screen.findByRole("button", { name: "Class" }));
    const dialog = await screen.findByRole("dialog", { name: "New class" });
    await user.clear(within(dialog).getByLabelText("Date"));
    await user.type(within(dialog).getByLabelText("Date"), "2027-03-28");
    await user.type(within(dialog).getByLabelText("Start time (Europe/Warsaw)"), "02:30");
    expect(within(dialog).getByText("This time doesn’t exist that day.")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Schedule class" }));
    expect(
      await within(dialog).findByText(
        "This time doesn’t exist on that date in the venue’s time zone. Choose another time.",
      ),
    ).toBeVisible();
    // Sent as written, never moved to 03:30.
    expect(posts(calls, OCCURRENCES)[0]!.body).toMatchObject({
      starts_at: "2027-03-28T02:30:00+01:00",
    });
  });

  it("makes the user choose which repeated autumn time is meant", async () => {
    const calls = api({
      [`POST ${OCCURRENCES}`]: [
        {
          status: 201,
          body: { occurrence: occurrence({ local_starts_at: "2027-10-31T02:30:00" }) },
        },
      ],
    });
    await show();
    await user.click(await screen.findByRole("button", { name: "Class" }));
    const dialog = await screen.findByRole("dialog", { name: "New class" });
    await user.clear(within(dialog).getByLabelText("Date"));
    await user.type(within(dialog).getByLabelText("Date"), "2027-10-31");
    await user.type(within(dialog).getByLabelText("Start time (Europe/Warsaw)"), "02:30");
    expect(within(dialog).getByText("This time happens twice that day.")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Schedule class" }));
    expect(
      await within(dialog).findByText("Choose which of the two times you mean."),
    ).toBeVisible();
    expect(posts(calls, OCCURRENCES)).toHaveLength(0);

    await user.click(within(dialog).getByLabelText("Second (UTC+01:00)"));
    await user.click(within(dialog).getByRole("button", { name: "Schedule class" }));
    await waitFor(() => expect(posts(calls, OCCURRENCES)).toHaveLength(1));
    expect(posts(calls, OCCURRENCES)[0]!.body).toMatchObject({
      starts_at: "2027-10-31T02:30:00+01:00",
    });
  });

  it("keeps the form and explains a venue conflict without guessing who holds it", async () => {
    api({
      [`POST ${OCCURRENCES}`]: [error(409, "conflict", { schedule: "instructor_unavailable" })],
    });
    await show();
    await user.click(await screen.findByRole("button", { name: "Class" }));
    const dialog = await screen.findByRole("dialog", { name: "New class" });
    await user.clear(within(dialog).getByLabelText("Date"));
    await user.type(within(dialog).getByLabelText("Date"), "2026-11-20");
    await user.type(within(dialog).getByLabelText("Start time (Europe/Warsaw)"), "18:00");
    await user.click(within(dialog).getByRole("button", { name: "Schedule class" }));
    expect(
      await within(dialog).findByText(
        "This instructor teaches another class at that time. Choose another time or instructor.",
      ),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("Start time (Europe/Warsaw)")).toHaveValue("18:00");
  });

  it("creates a weekly class and lists exactly the dates the backend skipped", async () => {
    const calls = api({
      [`POST ${BASE}/class-series`]: [
        {
          status: 201,
          body: {
            series: series({
              weekdays: [7],
              local_start_time: "02:30",
              starts_on: "2027-03-21",
              ends_on: "2027-04-04",
              scheduled_count: 2,
              skipped_dates: [{ local_date: "2027-03-28", reason: "nonexistent_local_time" }],
            }),
          },
        },
      ],
    });
    await show();
    await user.click(await screen.findByRole("button", { name: "Class" }));
    const dialog = await screen.findByRole("dialog", { name: "New class" });
    await user.click(within(dialog).getByLabelText(/Every week/));
    await user.click(within(dialog).getByLabelText("Sunday"));
    await user.type(within(dialog).getByLabelText("Start time (Europe/Warsaw)"), "02:30");
    await user.clear(within(dialog).getByLabelText("First date"));
    await user.type(within(dialog).getByLabelText("First date"), "2027-03-21");
    await user.type(within(dialog).getByLabelText("Last date"), "2027-04-04");
    expect(within(dialog).getByText(/Every Sunday at 02:30 \(Europe\/Warsaw\)/)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Schedule weekly class" }));

    expect(
      await screen.findByRole("heading", { name: "Weekly class scheduled, with dates skipped" }),
    ).toBeVisible();
    expect(screen.getByText("Technical boxing: 2 classes are on the timetable.")).toBeVisible();
    expect(document.querySelector('[data-skipped-date="2027-03-28"]')).toHaveAttribute(
      "data-skipped-reason",
      "nonexistent_local_time",
    );
    expect(posts(calls, `${BASE}/class-series`)[0]!.body).toMatchObject({
      weekdays: [7],
      local_start_time: "02:30",
      starts_on: "2027-03-21",
      ends_on: "2027-04-04",
    });
  });

  it("never overwrites a class someone changed meanwhile: it shows the latest and saves only on request", async () => {
    const latest = occurrence({
      revision: 2,
      venue: { venue_id: VENUE, name: "Ring 2" },
      starts_at: "2026-11-05T18:00:00Z",
      local_starts_at: "2026-11-05T19:00:00",
      local_ends_at: "2026-11-05T20:30:00",
    });
    const calls = api({
      [`PATCH ${OCCURRENCES}/${CLASS_A}`]: [
        error(409, "conflict", { revision: "stale", current_revision: 2 }),
        { status: 200, body: { occurrence: { ...latest, capacity: 12, revision: 3 } } },
      ],
      [`GET ${OCCURRENCES}/${CLASS_A}`]: [{ status: 200, body: { occurrence: latest } }],
    });
    await show();
    await user.click(await screen.findByRole("button", { name: /^Technical boxing, 18:00/ }));
    await user.click(await screen.findByRole("button", { name: "Change this class" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Technical boxing" });
    await user.clear(within(dialog).getByLabelText("Capacity"));
    await user.type(within(dialog).getByLabelText("Capacity"), "12");
    await user.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(await within(dialog).findByText("This class changed meanwhile.")).toBeVisible();
    expect(within(dialog).getByLabelText("Capacity")).toHaveValue("12");
    await user.click(within(dialog).getByRole("button", { name: "Save again" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const patches = calls.filter((call) => call.method === "PATCH");
    expect(patches[0]!.body).toEqual({ expected_revision: 1, capacity: 12 });
    // The retry is the user's, on the latest revision, with only their change.
    expect(patches[1]!.body).toEqual({ expected_revision: 2, capacity: 12 });
  });

  it("lets a coach cancel only the classes they teach, and a front desk nothing", async () => {
    api({
      [`GET ${OCCURRENCES}`]: [
        {
          status: 200,
          body: {
            occurrences: [
              occurrence(),
              occurrence({
                occurrence_id: CLASS_B,
                title: "Pads",
                instructor: { staff_membership_id: OWNER_STAFF, name: "Yauheni B." },
              }),
            ],
            next_cursor: null,
          },
        },
      ],
    });
    const coach = await show("coach");
    await user.click(await screen.findByRole("button", { name: /^Technical boxing, 18:00/ }));
    let details = await screen.findByRole("region", { name: "Technical boxing" });
    expect(within(details).getByRole("button", { name: "Cancel class" })).toBeVisible();
    expect(within(details).queryByRole("button", { name: "Change this class" })).toBeNull();
    await user.click(screen.getByRole("button", { name: /^Pads, 18:00/ }));
    details = await screen.findByRole("region", { name: "Pads" });
    expect(within(details).queryByRole("button", { name: "Cancel class" })).toBeNull();
    coach.unmount();

    await show("front_desk");
    await user.click(await screen.findByRole("button", { name: /^Technical boxing, 18:00/ }));
    details = await screen.findByRole("region", { name: "Technical boxing" });
    expect(within(details).queryByRole("button")).toBeNull();
    expect(
      within(details).getByText(
        "Your role can view the timetable. The owner and managers plan it.",
      ),
    ).toBeVisible();
  });

  it("cancels one class after naming it, keeping it on the timetable as cancelled", async () => {
    const calls = api({
      [`POST ${OCCURRENCES}/${CLASS_A}/cancel`]: [
        {
          status: 200,
          body: {
            occurrence: occurrence({
              status: "cancelled",
              cancel_reason: "cancelled",
              revision: 2,
            }),
          },
        },
      ],
    });
    await show();
    await user.click(await screen.findByRole("button", { name: /^Technical boxing, 18:00/ }));
    await user.click(await screen.findByRole("button", { name: "Cancel class" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Cancel Technical boxing?" });
    expect(
      within(dialog).getByText(/Thu, Nov 5, 2026, 18:00–19:30 \(Europe\/Warsaw\), Ring 2/),
    ).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Cancel class" }));
    await waitFor(() => expect(posts(calls, `${OCCURRENCES}/${CLASS_A}/cancel`)).toHaveLength(1));
    expect(posts(calls, `${OCCURRENCES}/${CLASS_A}/cancel`)[0]!.body).toEqual({
      expected_revision: 1,
    });
  });

  it("asks for a stronger confirmation before cancelling a series", async () => {
    const calls = api({
      [`GET ${BASE}/class-series`]: [{ status: 200, body: { series: [series()] } }],
      [`GET ${BASE}/class-series/${SERIES}`]: [{ status: 200, body: { series: series() } }],
      [`POST ${BASE}/class-series/${SERIES}/cancel`]: [
        { status: 200, body: { series: series({ status: "cancelled", revision: 2 }) } },
      ],
    });
    await show();
    await user.click(await screen.findByRole("tab", { name: "Weekly series" }));
    await user.click(await screen.findByRole("button", { name: "Technical boxing" }));
    const details = await screen.findByRole("region", { name: "Technical boxing" });
    expect(
      within(details).getByText("Every Monday and Wednesday at 18:00 (Europe/Warsaw)"),
    ).toBeVisible();
    await user.click(within(details).getByRole("button", { name: "Cancel series" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Cancel the series Technical boxing?",
    });
    const confirm = within(dialog).getByRole("button", { name: "Cancel series" });
    expect(confirm).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(confirm);
    await waitFor(() =>
      expect(posts(calls, `${BASE}/class-series/${SERIES}/cancel`)).toHaveLength(1),
    );
  });

  it("reads another gym afresh: no class, filter or selection carries over", async () => {
    api();
    const first = await show();
    await user.click(await screen.findByRole("button", { name: /^Technical boxing, 18:00/ }));
    expect(await screen.findByRole("region", { name: "Technical boxing" })).toBeVisible();
    const other = "4e0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a65";
    api({
      [`GET /api/v1/gyms/${other}/class-occurrences`]: [
        { status: 200, body: { occurrences: [], next_cursor: null } },
      ],
      [`GET /api/v1/gyms/${other}/venues`]: [{ status: 200, body: { venues: [venue()] } }],
      [`GET /api/v1/gyms/${other}/class-templates`]: [
        { status: 200, body: { templates: [template()] } },
      ],
      [`GET /api/v1/gyms/${other}/staff`]: [
        { status: 200, body: { staff: [], next_cursor: null } },
      ],
    });
    first.rerender(
      <>
        <GymTimetable gym={{ ...gym(), id: other, name: "Second Gym" }} />
        <Toaster />
      </>,
    );
    expect(await screen.findByText("Nothing planned for these dates")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Technical boxing" })).toBeNull();
  });
});
