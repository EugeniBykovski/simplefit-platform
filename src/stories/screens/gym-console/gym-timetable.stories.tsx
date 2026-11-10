import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { expect, fireEvent, userEvent, within } from "storybook/test";

import { GymGate, RequireSession } from "@/features/session-gate";
import { formats } from "@/shared/i18n/formats";
import { signInRouteFor } from "@/shared/routes/routes";
import {
  apiError,
  installApi,
  ok,
  SESSION,
  VIEWER,
  type Answer,
} from "@/stories/support/auth-story-api";
import { GymTimetable } from "@/widgets/gym-timetable";
import { GymWorkspace, useGymWorkspace } from "@/widgets/gym-workspace";
import { EntryFailure, LaunchScreen, SessionFailure } from "@/widgets/system-states";

import deContextSwitcher from "../../../../messages/de/contextSwitcher.json";
import deGymConsole from "../../../../messages/de/gymConsole.json";
import deShells from "../../../../messages/de/shells.json";

/*
 * The gym timetable (SF-98, WG5 with OG10) in the route's own composition
 * (session gate, GYM_WORKSPACE gate, the console of the gym in the path) on
 * a deterministic stand-in of the SF-97 API (`fetch` is replaced per story;
 * nothing reaches a backend). Classes, venues, names and dates are
 * Storybook fixtures placed in the current week; production pages show
 * only the backend's classes and never build one from a rule.
 */

const RING = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const ANNEX = "9b4e2d61-7a3c-4f85-8e1d-6c2a0b5f3d97";
const VIEWER_ROW = "5e2c7a91-3f4b-4d6e-8a0c-1b9d7f3e5a24";
const COACH_ROW = "5e2c7a91-3f4b-4d6e-8a0c-1b9d7f3e5a25";
const LOCATION = "6f2c7a91-3f4b-4d6e-8a0c-1b9d7f3e5a26";
const RING1 = "7a000000-0000-4000-8000-000000000001";
const RING2 = "7a000000-0000-4000-8000-000000000002";
const TEMPLATE = "7b000000-0000-4000-8000-000000000001";
const SERIES = "7c000000-0000-4000-8000-000000000001";

type Role = "owner" | "manager" | "coach" | "front_desk";

// SF-99 adds view_rosters (a coach: own classes) and record_check_in for every role.
const ROSTERS = ["view_rosters", "record_check_in"];
const PERMISSIONS: Record<Role, string[]> = {
  owner: ["view_workspace", "view_staff", "manage_timetable", "cancel_occurrence", ...ROSTERS],
  manager: ["view_workspace", "view_staff", "manage_timetable", "cancel_occurrence", ...ROSTERS],
  coach: ["view_workspace", "view_staff", "cancel_occurrence", ...ROSTERS],
  front_desk: ["view_workspace", "view_staff", ...ROSTERS],
};

const gym = (id: string, name: string, role: Role) => ({
  gym: {
    id,
    name,
    gym_type: "boxing_club",
    setup_status: "completed",
    inserted_at: "2026-10-27T10:00:00Z",
    updated_at: "2026-10-27T10:00:00Z",
    locations: [
      {
        id: LOCATION,
        name: "Praga",
        city: "Warsaw",
        address_line: "Ząbkowska 5",
        country_code: "PL",
        entrance_note: null,
        is_primary: true,
      },
    ],
    viewer: {
      role,
      staff_membership_id: role === "coach" ? COACH_ROW : VIEWER_ROW,
      permissions: PERMISSIONS[role],
    },
  },
});

/** The Monday of the current week, as a wall date (fixtures follow the calendar). */
function monday(): string {
  const today = new Date();
  const day = today.getUTCDay() === 0 ? 7 : today.getUTCDay();
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - (day - 1));
  return date.toISOString().slice(0, 10);
}
const plus = (date: string, days: number) => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
};
const MON = monday();
/*
 * The story clock: 06:00 UTC on that Monday, before every fixture class. The
 * week shown follows the calendar, but whether a class has started (which
 * decides if it may still be changed or cancelled) reads `Date.now()`; pinning
 * it keeps the stories the same on every day and at every hour of the week.
 */
const STORY_NOW = Date.parse(`${MON}T06:00:00Z`);

const venue = (id: string, name: string, capacity: number | null) => ({
  venue_id: id,
  gym_id: RING,
  gym_location_id: LOCATION,
  name,
  description: null,
  capacity,
  time_zone: "Europe/Warsaw",
  status: "active",
  revision: 1,
  created_at: "2026-10-27T10:00:00Z",
  updated_at: "2026-10-27T10:00:00Z",
});
const VENUES = [venue(RING1, "Ring 1", 24), venue(RING2, "Ring 2", 20)];

const template = (n: number, title: string, minutes: number, capacity: number) => ({
  template_id: `7b000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  gym_id: RING,
  title,
  description: null,
  default_duration_minutes: minutes,
  default_capacity: capacity,
  default_venue_id: RING2,
  default_instructor: null,
  status: "active",
  revision: 1,
  created_at: "2026-10-27T10:00:00Z",
  updated_at: "2026-10-27T10:00:00Z",
});
const TEMPLATES = [
  template(1, "Technical boxing", 90, 16),
  template(2, "Beginners", 60, 24),
  template(3, "Sparring", 90, 12),
];

const pad = (value: number) => String(value).padStart(2, "0");
const wall = (date: string, minutes: number) =>
  `${date}T${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}:00`;

let serial = 0;
/** A class on `day` (0 = Monday) at `start` minutes, as the backend would list it (CET). */
function occurrence(
  day: number,
  start: number,
  title: string,
  minutes: number,
  extra: Record<string, unknown> = {},
) {
  serial += 1;
  const date = plus(MON, day);
  const utc = new Date(`${wall(date, start)}Z`);
  utc.setUTCHours(utc.getUTCHours() - 1);
  const end = new Date(utc.getTime() + minutes * 60_000);
  return {
    occurrence_id: `7d000000-0000-4000-8000-${String(serial).padStart(12, "0")}`,
    gym_id: RING,
    template_id: TEMPLATE,
    series_id: null,
    series_local_date: null,
    title,
    starts_at: utc.toISOString(),
    ends_at: end.toISOString(),
    local_starts_at: wall(date, start),
    local_ends_at: wall(date, start + minutes),
    time_zone: "Europe/Warsaw",
    utc_offset_minutes: 60,
    duration_minutes: minutes,
    capacity: 16,
    venue: { venue_id: RING2, name: "Ring 2" },
    instructor: { staff_membership_id: COACH_ROW, name: "Tomasz Z." },
    needs_instructor: false,
    rescheduled: false,
    status: "scheduled",
    cancel_reason: null,
    cancelled_at: null,
    revision: 1,
    created_at: "2026-10-27T10:00:00Z",
    updated_at: "2026-10-27T10:00:00Z",
    ...extra,
  };
}
const weekly = (date: string) => ({ series_id: SERIES, series_local_date: date });
const RING1_REF = { venue: { venue_id: RING1, name: "Ring 1" } };

const WEEK = [
  occurrence(0, 9 * 60, "Morning boxing", 90, { ...RING1_REF, capacity: 20 }),
  occurrence(0, 18 * 60, "Technical boxing", 90, weekly(MON)),
  occurrence(0, 19 * 60 + 30, "Beginners", 90, { ...RING1_REF, capacity: 24 }),
  occurrence(1, 17 * 60, "Kids boxing", 60, { capacity: 12 }),
  occurrence(1, 19 * 60, "Pads", 90, { instructor: null, needs_instructor: true }),
  occurrence(2, 18 * 60, "Technical boxing", 90, weekly(plus(MON, 2))),
  occurrence(2, 18 * 60, "Sparring", 90, { ...RING1_REF, capacity: 12 }),
  occurrence(3, 13 * 60, "Open gym", 120, { instructor: null }),
  occurrence(4, 18 * 60, "Technical boxing", 90, { ...weekly(plus(MON, 4)), rescheduled: true }),
  occurrence(5, 10 * 60, "Kids boxing", 60, { capacity: 12 }),
  occurrence(5, 12 * 60, "Open sparring", 120, { ...RING1_REF, capacity: 16 }),
];
const CANCELLED = occurrence(3, 18 * 60, "Technical boxing", 90, {
  status: "cancelled",
  cancel_reason: "cancelled",
  cancelled_at: "2026-10-30T10:00:00Z",
});

const series = (extra: Record<string, unknown> = {}) => ({
  series_id: SERIES,
  gym_id: RING,
  template_id: TEMPLATE,
  title: "Technical boxing",
  weekdays: [1, 3, 5],
  local_start_time: "18:00",
  starts_on: MON,
  ends_on: plus(MON, 120),
  time_zone: "Europe/Warsaw",
  duration_minutes: 90,
  capacity: 16,
  venue: { venue_id: RING2, name: "Ring 2" },
  instructor: { staff_membership_id: COACH_ROW, name: "Tomasz Z." },
  status: "active",
  revision: 3,
  created_at: "2026-10-27T10:00:00Z",
  updated_at: "2026-10-27T10:00:00Z",
  scheduled_count: 51,
  cancelled_count: 1,
  skipped_dates: [],
  ...extra,
});

const STAFF = [
  { name: "Yauheni B.", role: "owner", id: VIEWER_ROW },
  { name: "Tomasz Z.", role: "coach", id: COACH_ROW },
  { name: "Agnieszka L.", role: "manager", id: "5e2c7a91-3f4b-4d6e-8a0c-1b9d7f3e5a27" },
].map(({ name, role, id }) => ({
  staff_membership_id: id,
  name,
  role,
  status: "active",
  is_viewer: id === VIEWER_ROW,
  joined_at: "2026-10-27T10:00:00Z",
  ended_at: null,
  ended_reason: null,
}));

const entry = (role: Role) => ({
  entry: {
    destination: "gym_home",
    reason: "storybook",
    mandatory: false,
    intent: null,
    context: null,
    account_registration: "complete",
    fighter_profile: "completed",
    coach_profile: "not_started",
    capabilities: ["FIGHTER", "GYM_WORKSPACE"],
    gym_id: RING,
    gym_workspaces: [
      {
        gym_id: RING,
        name: "Ring One Boxing",
        role,
        setup_status: "completed",
        available_actions: ["enter"],
        selected: false,
      },
      {
        gym_id: ANNEX,
        name: "Annex Club",
        role: "manager",
        setup_status: "completed",
        available_actions: ["enter"],
        selected: false,
      },
    ],
    gym_workspace_count: 2,
    sponsor_id: null,
    sponsor_workspaces: [],
    sponsor_workspace_count: 0,
  },
});

/** The timetable of the console's gym, as its route renders it. */
function Timetable() {
  return <GymTimetable gym={useGymWorkspace()} />;
}

/** The app's named date formats (the request config's), over the preview's provider. */
function AppFormats({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider
      locale={useLocale()}
      timeZone="UTC"
      messages={useMessages()}
      formats={formats}
    >
      {children}
    </NextIntlClientProvider>
  );
}

function timetableStory({
  role = "owner",
  gymId = RING,
  gymName = "Ring One Boxing",
  me = ok({ user: VIEWER }),
  gymAnswer,
  occurrences = ok({ occurrences: WEEK, next_cursor: null }),
  venues = ok({ venues: VENUES }),
  templates = ok({ templates: TEMPLATES }),
  seriesList = ok({ series: [series()] }),
  routes = {},
  play,
}: {
  role?: Role;
  gymId?: string;
  gymName?: string;
  me?: Answer;
  gymAnswer?: Answer | Answer[];
  occurrences?: Answer | Answer[];
  venues?: Answer | Answer[];
  templates?: Answer | Answer[];
  seriesList?: Answer | Answer[];
  routes?: Record<string, Answer | Answer[]>;
  play?: StoryObj["play"];
} = {}): StoryObj {
  const base = `/api/v1/gyms/${gymId}`;
  return {
    parameters: {
      nextjs: { appDirectory: true, navigation: { pathname: `/en/app/gyms/${gymId}/timetable` } },
    },
    beforeEach: () => {
      const realNow = Date.now;
      Date.now = () => STORY_NOW;
      const restoreApi = installApi({
        "/api/me": me,
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/entry": ok(entry(role)),
        [base]: gymAnswer ?? ok(gym(gymId, gymName, role)),
        [`${base}/class-occurrences`]: occurrences,
        [`${base}/venues`]: venues,
        [`${base}/class-templates`]: templates,
        [`${base}/class-series`]: seriesList,
        [`${base}/class-series/${SERIES}`]: ok({ series: series() }),
        [`${base}/staff`]: ok({ staff: STAFF, next_cursor: null }),
        ...routes,
      });
      return () => {
        restoreApi();
        Date.now = realNow;
      };
    },
    render: () => (
      <AppFormats>
        <RequireSession
          signIn={signInRouteFor("web")}
          pending={<LaunchScreen />}
          unavailable={<SessionFailure />}
        >
          <GymGate pending={<LaunchScreen />} failure={<EntryFailure />}>
            <GymWorkspace gymId={gymId}>
              <Timetable />
            </GymWorkspace>
          </GymGate>
        </RequireSession>
      </AppFormats>
    ),
    play,
  };
}

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

/** German copy over the English messages: the longest labels. */
function German({ children }: { children: ReactNode }) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider
      locale="de"
      timeZone="UTC"
      messages={{
        ...messages,
        contextSwitcher: deContextSwitcher,
        gymConsole: deGymConsole,
        shells: deShells,
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}

const meta = {
  title: "Gym Console/Timetable",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const T = 5000;
const body = () => within(document.body);
/** The Monday 18:00 class (the series repeats it on other days: the first one). */
const ready = async (canvasElement: HTMLElement) =>
  (
    await within(canvasElement).findAllByRole(
      "button",
      { name: /^Technical boxing, 18:00 to 19:30/ },
      { timeout: T },
    )
  )[0]!;
const openTab = async (canvasElement: HTMLElement, name: string) =>
  userEvent.click(await within(canvasElement).findByRole("tab", { name }, { timeout: T }));
const view = async (canvasElement: HTMLElement, name: "Week" | "Day" | "List") =>
  userEvent.click(await within(canvasElement).findByRole("button", { name, exact: true } as never));
/** Sets a native date or time field as its picker would (typing into one is segment by segment). */
const pick = (input: HTMLElement, value: string) => fireEvent.input(input, { target: { value } });
const openClassForm = async (canvasElement: HTMLElement) => {
  await ready(canvasElement);
  await userEvent.click(within(canvasElement).getByRole("button", { name: "Class" }));
  return body().findByRole("dialog", { name: "New class" });
};

/* ── Timetable ──────────────────────────────────────────────────────── */

export const Populated = timetableStory({
  play: async ({ canvasElement }) => {
    await expect(await ready(canvasElement)).toBeVisible();
  },
});
Populated.name = "WG5 · calendar · populated week";

export const ListView = timetableStory({
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    await view(canvasElement, "List");
  },
});
ListView.name = "WG5 · accessible list view";

export const DayView = timetableStory({
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    await view(canvasElement, "Day");
  },
});
DayView.name = "WG5 · day view";

export const Details = timetableStory({
  play: async ({ canvasElement }) => {
    await userEvent.click(await ready(canvasElement));
    await expect(
      await within(canvasElement).findByRole("region", { name: "Technical boxing" }),
    ).toBeVisible();
  },
});
Details.name = "Class details · recurring";

export const NoInstructor = timetableStory({
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("button", { name: /^Pads,/ }));
    await expect(
      await within(canvasElement).findByText("Instructor needed", { selector: "[data-fact]" }),
    ).toBeVisible();
  },
});
NoInstructor.name = "Class details · instructor needed";

export const Cancelled = timetableStory({
  occurrences: ok({ occurrences: [...WEEK, CANCELLED], next_cursor: null }),
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    await userEvent.click(within(canvasElement).getByRole("switch", { name: "Show cancelled" }));
    await view(canvasElement, "List");
  },
});
Cancelled.name = "Cancelled occurrence shown";

export const Rescheduled = timetableStory({
  play: async ({ canvasElement }) => {
    await ready(canvasElement);
    const changed = within(canvasElement).getAllByRole("button", { name: /^Technical boxing,/ });
    await userEvent.click(changed[changed.length - 1]!);
    await expect(await within(canvasElement).findByText("Changed on its own")).toBeVisible();
  },
});
Rescheduled.name = "Rescheduled series occurrence";

export const EmptyWeek = timetableStory({
  occurrences: ok({ occurrences: [], next_cursor: null }),
});
EmptyWeek.name = "Empty timetable";

export const NoVenue = timetableStory({
  occurrences: ok({ occurrences: [], next_cursor: null }),
  venues: ok({ venues: [] }),
  templates: ok({ templates: [] }),
});
NoVenue.name = "No venue yet";

export const NoTemplate = timetableStory({
  occurrences: ok({ occurrences: [], next_cursor: null }),
  templates: ok({ templates: [] }),
});
NoTemplate.name = "No class template yet";

export const Loading = timetableStory({ occurrences: "pending" });
Loading.name = "Loading";

export const NetworkFailure = timetableStory({ occurrences: "offline" });
NetworkFailure.name = "Network failure · retry";

export const RateLimited = timetableStory({
  occurrences: apiError(429, "rate_limited", { "retry-after": "60" }),
});
RateLimited.name = "Rate limited";

/** One template: the class form starts from it and its default venue (Ring 2, Warsaw). */
const ONE_TEMPLATE = ok({ templates: [TEMPLATES[0]] });

/* ── Forms ──────────────────────────────────────────────────────────── */

export const OneTimeForm = timetableStory({
  templates: ONE_TEMPLATE,
  play: async ({ canvasElement }) => {
    await openClassForm(canvasElement);
  },
});
OneTimeForm.name = "One-time class form";

export const RecurringForm = timetableStory({
  templates: ONE_TEMPLATE,
  play: async ({ canvasElement }) => {
    const dialog = await openClassForm(canvasElement);
    await userEvent.click(within(dialog).getByText("Every week"));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Monday" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Wednesday" }));
    pick(within(dialog).getByLabelText("Start time (Europe/Warsaw)"), "18:00");
    pick(within(dialog).getByLabelText("Last date"), plus(MON, 60));
  },
});
RecurringForm.name = "Recurring class form";

export const InvalidRecurrence = timetableStory({
  templates: ONE_TEMPLATE,
  play: async ({ canvasElement }) => {
    const dialog = await openClassForm(canvasElement);
    await userEvent.click(within(dialog).getByText("Every week"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Schedule weekly class" }));
    await expect(await within(dialog).findByText("Choose at least one day.")).toBeVisible();
  },
});
InvalidRecurrence.name = "Invalid recurrence";

export const DstGap = timetableStory({
  templates: ONE_TEMPLATE,
  play: async ({ canvasElement }) => {
    const dialog = await openClassForm(canvasElement);
    pick(within(dialog).getByLabelText("Date"), "2027-03-28");
    pick(within(dialog).getByLabelText("Start time (Europe/Warsaw)"), "02:30");
    await expect(within(dialog).getByText("This time doesn’t exist that day.")).toBeVisible();
  },
});
DstGap.name = "DST gap · 28 Mar 2027 02:30";

export const DstAmbiguous = timetableStory({
  templates: ONE_TEMPLATE,
  play: async ({ canvasElement }) => {
    const dialog = await openClassForm(canvasElement);
    pick(within(dialog).getByLabelText("Date"), "2027-10-31");
    pick(within(dialog).getByLabelText("Start time (Europe/Warsaw)"), "02:30");
    await expect(within(dialog).getByText("This time happens twice that day.")).toBeVisible();
  },
});
DstAmbiguous.name = "DST repeated hour · 31 Oct 2027 02:30";

const submitOnce = async (canvasElement: HTMLElement) => {
  const dialog = await openClassForm(canvasElement);
  pick(within(dialog).getByLabelText("Start time (Europe/Warsaw)"), "18:00");
  pick(within(dialog).getByLabelText("Date"), plus(MON, 14));
  await userEvent.click(within(dialog).getByRole("button", { name: "Schedule class" }));
  return dialog;
};

export const VenueConflict = timetableStory({
  templates: ONE_TEMPLATE,
  routes: {
    [`POST /api/v1/gyms/${RING}/class-occurrences`]: {
      status: 409,
      body: {
        error: { code: "conflict", message: "x", details: { schedule: "venue_unavailable" } },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const dialog = await submitOnce(canvasElement);
    await expect(
      await within(dialog).findByText(/Another class is in this venue at that time/),
    ).toBeVisible();
  },
});
VenueConflict.name = "Venue conflict (409)";

export const InstructorConflict = timetableStory({
  templates: ONE_TEMPLATE,
  routes: {
    [`POST /api/v1/gyms/${RING}/class-occurrences`]: {
      status: 409,
      body: {
        error: { code: "conflict", message: "x", details: { schedule: "instructor_unavailable" } },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const dialog = await submitOnce(canvasElement);
    await expect(
      await within(dialog).findByText(/This instructor teaches another class at that time/),
    ).toBeVisible();
  },
});
InstructorConflict.name = "Instructor conflict (409)";

export const UnknownOutcome = timetableStory({
  templates: ONE_TEMPLATE,
  routes: { [`POST /api/v1/gyms/${RING}/class-occurrences`]: "offline" },
  play: async ({ canvasElement }) => {
    const dialog = await submitOnce(canvasElement);
    await expect(
      await within(dialog).findByText("We couldn’t confirm whether this was saved."),
    ).toBeVisible();
  },
});
UnknownOutcome.name = "Creation outcome unknown · retry";

export const SkippedDates = timetableStory({
  templates: ONE_TEMPLATE,
  routes: {
    [`POST /api/v1/gyms/${RING}/class-series`]: ok(
      {
        series: series({
          weekdays: [7],
          local_start_time: "02:30",
          starts_on: "2027-03-21",
          ends_on: "2027-11-07",
          scheduled_count: 31,
          skipped_dates: [
            { local_date: "2027-03-28", reason: "nonexistent_local_time" },
            { local_date: "2027-10-31", reason: "ambiguous_local_time" },
          ],
        }),
      },
      201,
    ),
  },
  play: async ({ canvasElement }) => {
    const dialog = await openClassForm(canvasElement);
    await userEvent.click(within(dialog).getByText("Every week"));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Sunday" }));
    pick(within(dialog).getByLabelText("Start time (Europe/Warsaw)"), "02:30");
    pick(within(dialog).getByLabelText("Last date"), plus(MON, 200));
    await userEvent.click(within(dialog).getByRole("button", { name: "Schedule weekly class" }));
    await expect(
      await body().findByRole("heading", { name: "Weekly class scheduled, with dates skipped" }),
    ).toBeVisible();
  },
});
SkippedDates.name = "Skipped-date warning";

export const StaleRevision = timetableStory({
  routes: {
    [`PATCH /api/v1/gyms/${RING}/class-occurrences/${WEEK[1]!.occurrence_id}`]: {
      status: 409,
      body: {
        error: {
          code: "conflict",
          message: "x",
          details: { revision: "stale", current_revision: 2 },
        },
      },
    },
    [`GET /api/v1/gyms/${RING}/class-occurrences/${WEEK[1]!.occurrence_id}`]: ok({
      occurrence: { ...WEEK[1], capacity: 12, revision: 2 },
    }),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(await ready(canvasElement));
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Change this class" }),
    );
    const dialog = await body().findByRole("dialog", { name: "Change Technical boxing" });
    const length = within(dialog).getByLabelText("Length");
    await userEvent.clear(length);
    await userEvent.type(length, "75");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await expect(await within(dialog).findByText("This class changed meanwhile.")).toBeVisible();
  },
});
StaleRevision.name = "Stale revision (409)";

export const CancelOccurrence = timetableStory({
  play: async ({ canvasElement }) => {
    await userEvent.click(await ready(canvasElement));
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Cancel class" }),
    );
    await expect(await body().findByRole("alertdialog")).toHaveTextContent(
      "Only this date is cancelled.",
    );
  },
});
CancelOccurrence.name = "Occurrence cancellation confirmation";

export const SeriesDetails = timetableStory({
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, "Weekly series");
    await userEvent.click(
      await within(canvasElement).findByRole(
        "button",
        { name: "Technical boxing" },
        { timeout: T },
      ),
    );
  },
});
SeriesDetails.name = "Weekly series · details";

export const SeriesCancellation = timetableStory({
  play: async ({ canvasElement }) => {
    await openTab(canvasElement, "Weekly series");
    await userEvent.click(
      await within(canvasElement).findByRole(
        "button",
        { name: "Technical boxing" },
        { timeout: T },
      ),
    );
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Cancel series" }, { timeout: T }),
    );
    await expect(
      within(await body().findByRole("alertdialog")).getByRole("button", { name: "Cancel series" }),
    ).toBeDisabled();
  },
});
SeriesCancellation.name = "Series cancellation confirmation";

export const Templates = timetableStory({
  play: async ({ canvasElement }) => openTab(canvasElement, "Class templates"),
});
Templates.name = "Class templates";

export const Venues = timetableStory({
  play: async ({ canvasElement }) => openTab(canvasElement, "Venues"),
});
Venues.name = "Venues · multiple";

/* ── Roles and states ───────────────────────────────────────────────── */

export const CoachReadOnly = timetableStory({
  role: "coach",
  play: async ({ canvasElement }) => {
    await userEvent.click(await ready(canvasElement));
    await expect(
      await within(canvasElement).findByRole("button", { name: "Cancel class" }),
    ).toBeVisible();
  },
});
CoachReadOnly.name = "Coach · cancels own classes only";

export const FrontDeskReadOnly = timetableStory({
  role: "front_desk",
  play: async ({ canvasElement }) => {
    await userEvent.click(await ready(canvasElement));
    await expect(
      await within(canvasElement).findByText(
        "Your role can view the timetable. The owner and managers plan it.",
      ),
    ).toBeVisible();
  },
});
FrontDeskReadOnly.name = "Front desk · read only";

export const UnknownGym = timetableStory({ gymAnswer: apiError(404, "not_found") });
UnknownGym.name = "Unknown or foreign gym";

export const SessionExpired = timetableStory({ me: apiError(401, "unauthorized") });
SessionExpired.name = "Session expired";

export const LongTranslations = {
  ...timetableStory(),
  render: (args, context) => (
    <German>{timetableStory().render?.(args, context as never) as ReactNode}</German>
  ),
} satisfies StoryObj;
LongTranslations.name = "Long translations (German)";

export const Light = { ...timetableStory(), globals: { theme: "Light" } } satisfies StoryObj;
Light.name = "Light theme";

export const Dark = { ...timetableStory(), globals: { theme: "Dark" } } satisfies StoryObj;
Dark.name = "Dark theme";

export const Narrow = {
  ...timetableStory(),
  globals: { viewport: { value: "phone", isRotated: false } },
} satisfies StoryObj;
Narrow.name = "Narrow viewport";

/* ── Roster and check-in (SF-100, G03 in WG5's panel) ─────────────────── */

const ROSTER_PATH = `/api/v1/gyms/${RING}/class-occurrences/${WEEK[1]!.occurrence_id}/bookings`;
const rosterEntry = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  booking_id: `9c000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  gym_member_id: `8b000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
  name,
  status: "confirmed",
  booked_via: "member",
  confirmed_at: "2026-10-30T09:00:00Z",
  cancelled_at: null,
  cancel_reason: null,
  checked_in_at: null as string | null,
  ...extra,
});
const ROSTER = [
  rosterEntry(1, "Marta K.", { checked_in_at: "2026-10-30T16:55:00Z" }),
  rosterEntry(2, "Piotr Z."),
  rosterEntry(3, "Ewa M.", { booked_via: "staff" }),
];
const roster = (entries: ReturnType<typeof rosterEntry>[], checkedIn = 0) =>
  ok({
    summary: {
      capacity: 16,
      confirmed_count: entries.length,
      remaining_capacity: 16 - entries.length,
      checked_in_count: checkedIn,
    },
    bookings: entries,
    next_cursor: null,
  });
const openRoster = async (canvasElement: HTMLElement) => {
  await userEvent.click(await ready(canvasElement));
  await userEvent.click(await within(canvasElement).findByRole("button", { name: "Roster" }));
  return body().findByRole("dialog", { name: "Technical boxing" });
};

export const RosterPopulated = timetableStory({
  routes: { [ROSTER_PATH]: roster(ROSTER, 1) },
  play: async ({ canvasElement }) => {
    const dialog = await openRoster(canvasElement);
    await expect(await within(dialog).findByText("Piotr Z.", {}, { timeout: T })).toBeVisible();
  },
});
RosterPopulated.name = "Roster · populated";

export const RosterEmpty = timetableStory({
  routes: { [ROSTER_PATH]: roster([]) },
  play: async ({ canvasElement }) => {
    await openRoster(canvasElement);
  },
});
RosterEmpty.name = "Roster · empty";

export const CoachRoster = timetableStory({
  role: "coach",
  routes: { [ROSTER_PATH]: roster(ROSTER, 1) },
  play: async ({ canvasElement }) => {
    await openRoster(canvasElement);
  },
});
CoachRoster.name = "Roster · coach, own class";

export const CheckInCompleted = timetableStory({
  routes: {
    [ROSTER_PATH]: [
      roster(ROSTER, 1),
      roster([ROSTER[0]!, { ...ROSTER[1]!, checked_in_at: "2026-10-30T16:57:00Z" }, ROSTER[2]!], 2),
    ],
    [`POST /api/v1/gyms/${RING}/class-bookings/${ROSTER[1]!.booking_id}/check-in`]: ok(
      {
        check_in: {
          check_in_id: "9d000000-0000-4000-8000-000000000001",
          booking_id: ROSTER[1]!.booking_id,
          occurrence_id: WEEK[1]!.occurrence_id,
          gym_member_id: ROSTER[1]!.gym_member_id,
          method: "manual",
          checked_in_at: "2026-10-30T16:57:00Z",
        },
      },
      201,
    ),
  },
  play: async ({ canvasElement }) => {
    const dialog = await openRoster(canvasElement);
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Check in Piotr Z." }, { timeout: T }),
    );
    await expect(
      await within(dialog).findByText("Piotr Z. is checked in.", {}, { timeout: T }),
    ).toBeVisible();
  },
});
CheckInCompleted.name = "Check-in · recorded";

export const CheckInRejected = timetableStory({
  routes: {
    [ROSTER_PATH]: roster(ROSTER, 1),
    [`POST /api/v1/gyms/${RING}/class-bookings/${ROSTER[1]!.booking_id}/check-in`]: {
      status: 409,
      body: {
        error: { code: "conflict", message: "x", details: { class_occurrence: "not_today" } },
      },
    },
  },
  play: async ({ canvasElement }) => {
    const dialog = await openRoster(canvasElement);
    await userEvent.click(
      await within(dialog).findByRole("button", { name: "Check in Piotr Z." }, { timeout: T }),
    );
    await expect(await within(dialog).findByRole("alert", {}, { timeout: T })).toBeVisible();
  },
});
CheckInRejected.name = "Check-in · not the class's day";
