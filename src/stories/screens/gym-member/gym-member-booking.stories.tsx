import type { Decorator, Meta, StoryObj } from "@storybook/nextjs-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, useLocale, useMessages } from "next-intl";
import type { ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";

import { RequireSession } from "@/features/session-gate";
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
import { AppFrame } from "@/widgets/app-frame";
import { MemberBookings, MemberClasses, MemberGyms } from "@/widgets/gym-member-booking";
import { LaunchScreen, SessionFailure } from "@/widgets/system-states";

import deGymBooking from "../../../../messages/de/gymBooking.json";

/*
 * The member pages (SF-100: My gyms, a gym's classes with booking and
 * cancelling, My bookings) in their route composition (session gate and the
 * header-only app frame) on a deterministic stand-in of the SF-95/SF-99 API
 * (`fetch` is replaced per story; nothing reaches a backend). Gyms, classes
 * and names are Storybook fixtures placed today; production pages show only
 * the backend's records. No web artboard exists: these pages are the interim
 * composition of F13 and F16's content (D-WEB-GYM-MEMBER-BOOKING).
 */

const GYM = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const MEMBER = "8b1b2c3d-0000-4000-8000-000000000001";
const BOOKING = "9c1b2c3d-0000-4000-8000-000000000901";

/** Today on the viewer's device (the day the classes are placed on). */
const TODAY = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const ADD = (days: number) =>
  new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
/** The story clock: 05:00 UTC today, before every fixture class. */
const STORY_NOW = Date.parse(`${TODAY}T05:00:00Z`);

const membership = (status = "active", gymId = GYM, name = "Ring One Boxing", id = MEMBER) => ({
  gym: { gym_id: gymId, name },
  gym_member_id: id,
  status,
  joined_via: "join_code",
  auto_approved: false,
  requested_at: "2026-10-30T10:00:00Z",
  joined_at: status === "requested" ? null : "2026-10-30T11:00:00Z",
  responded_at: status === "requested" ? null : "2026-10-30T11:00:00Z",
  ended_at: status === "ended" ? "2026-11-01T10:00:00Z" : null,
  ended_reason: status === "ended" ? "left" : null,
});

let serial = 0;
/** A class on `date` at `hour` (Warsaw wall time, UTC+1 in these fixtures). */
const klass = (title: string, hour: number, extra: Record<string, unknown> = {}, date = TODAY) => {
  serial += 1;
  const h = String(hour).padStart(2, "0");
  return {
    occurrence_id: `7d000000-0000-4000-8000-${String(serial).padStart(12, "0")}`,
    title,
    status: "scheduled",
    starts_at: `${date}T${String(hour - 1).padStart(2, "0")}:00:00Z`,
    ends_at: `${date}T${String(hour).padStart(2, "0")}:30:00Z`,
    time_zone: "Europe/Warsaw",
    local_starts_at: `${date}T${h}:00:00`,
    local_ends_at: `${date}T${String(hour + 1).padStart(2, "0")}:30:00`,
    utc_offset_minutes: 60,
    duration_minutes: 90,
    venue: { name: "Ring 2" },
    instructor: { name: "Tomasz Z." },
    capacity: 16,
    remaining_capacity: 9,
    booking: null,
    ...extra,
  };
};

const CLASSES = [
  klass("Morning boxing", 9, { remaining_capacity: 1, capacity: 12, venue: { name: "Ring 1" } }),
  klass("Technical boxing", 18),
  klass("Sparring", 20, { remaining_capacity: 0, capacity: 8, instructor: { name: "Kuba W." } }),
];
const BOOKED = {
  ...CLASSES[1]!,
  remaining_capacity: 8,
  booking: { booking_id: BOOKING, status: "confirmed", checked_in_at: null },
};

const booking = (extra: Record<string, unknown> = {}, cls: Record<string, unknown> = {}) => ({
  booking_id: BOOKING,
  gym_member_id: MEMBER,
  status: "confirmed",
  booked_via: "member",
  confirmed_at: "2026-11-01T09:00:00Z",
  cancelled_at: null,
  cancel_reason: null,
  checked_in_at: null,
  class: {
    occurrence_id: BOOKED.occurrence_id,
    gym: { gym_id: GYM, name: "Ring One Boxing" },
    title: "Technical boxing",
    status: "scheduled",
    starts_at: BOOKED.starts_at,
    ends_at: BOOKED.ends_at,
    time_zone: "Europe/Warsaw",
    local_starts_at: BOOKED.local_starts_at,
    local_ends_at: BOOKED.local_ends_at,
    utc_offset_minutes: 60,
    venue: { name: "Ring 2" },
    instructor: { name: "Tomasz Z." },
    ...cls,
  },
  ...extra,
});

const MY_BOOKINGS = [
  booking(),
  booking(
    { booking_id: "9c1b2c3d-0000-4000-8000-000000000902", checked_in_at: `${ADD(-1)}T16:58:00Z` },
    {
      title: "Pads",
      starts_at: `${ADD(-1)}T17:00:00Z`,
      ends_at: `${ADD(-1)}T18:00:00Z`,
      local_starts_at: `${ADD(-1)}T18:00:00`,
      local_ends_at: `${ADD(-1)}T19:00:00`,
    },
  ),
  booking(
    { booking_id: "9c1b2c3d-0000-4000-8000-000000000903" },
    {
      title: "Open gym",
      starts_at: `${ADD(-2)}T17:00:00Z`,
      ends_at: `${ADD(-2)}T18:00:00Z`,
      local_starts_at: `${ADD(-2)}T18:00:00`,
      local_ends_at: `${ADD(-2)}T19:00:00`,
    },
  ),
  booking(
    {
      booking_id: "9c1b2c3d-0000-4000-8000-000000000904",
      status: "cancelled",
      cancel_reason: "occurrence_cancelled",
      cancelled_at: `${ADD(-1)}T08:00:00Z`,
    },
    {
      title: "Kids boxing",
      status: "cancelled",
      starts_at: `${ADD(2)}T16:00:00Z`,
      ends_at: `${ADD(2)}T17:00:00Z`,
      local_starts_at: `${ADD(2)}T17:00:00`,
      local_ends_at: `${ADD(2)}T18:00:00`,
    },
  ),
];

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

/** German copy over the English messages: the longest labels. */
function German({ children }: { children: ReactNode }) {
  const messages = useMessages();
  return (
    <NextIntlClientProvider
      locale="de"
      timeZone="UTC"
      messages={{ ...messages, gymBooking: deGymBooking }}
      formats={formats}
    >
      {children}
    </NextIntlClientProvider>
  );
}

type Page = "gyms" | "classes" | "bookings";
const PATHS: Record<Page, string> = {
  gyms: "/en/app/me/gyms",
  classes: `/en/app/me/gyms/${GYM}/classes`,
  bookings: "/en/app/me/bookings",
};

function memberStory({
  page = "classes",
  me = ok({ user: VIEWER }),
  memberships = ok({ memberships: [membership()], next_cursor: null }),
  classes = ok({ classes: CLASSES, next_cursor: null }),
  bookings = ok({ bookings: MY_BOOKINGS, next_cursor: null }),
  routes = {},
  german = false,
  play,
}: {
  page?: Page;
  me?: Answer;
  memberships?: Answer | Answer[];
  classes?: Answer | Answer[];
  bookings?: Answer | Answer[];
  routes?: Record<string, Answer | Answer[]>;
  german?: boolean;
  play?: StoryObj["play"];
} = {}): StoryObj {
  const screenFor = {
    gyms: <MemberGyms />,
    classes: <MemberClasses gymId={GYM} />,
    bookings: <MemberBookings />,
  }[page];
  const content = (
    <AppFormats>
      <RequireSession
        signIn={signInRouteFor("web")}
        pending={<LaunchScreen />}
        unavailable={<SessionFailure />}
      >
        <AppFrame>{screenFor}</AppFrame>
      </RequireSession>
    </AppFormats>
  );
  return {
    parameters: { nextjs: { appDirectory: true, navigation: { pathname: PATHS[page] } } },
    beforeEach: () => {
      const realNow = Date.now;
      Date.now = () => STORY_NOW;
      const restoreApi = installApi({
        "/api/me": me,
        "/api/auth/session/refresh": ok(SESSION),
        "/api/v1/me/gym-memberships": memberships,
        [`/api/v1/me/gym-memberships/${MEMBER}/classes`]: classes,
        "/api/v1/me/class-bookings": bookings,
        ...routes,
      });
      return () => {
        restoreApi();
        Date.now = realNow;
      };
    },
    render: () => (german ? <German>{content}</German> : content),
    play,
  };
}

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <Story />
  </QueryClientProvider>
);

const meta = {
  title: "Gym Member/Booking",
  parameters: { layout: "fullscreen" },
  decorators: [withQueryClient],
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Meta;

export default meta;

const T = 5000;
const body = () => within(document.body);
const choose = async (canvasElement: HTMLElement, title: string) =>
  userEvent.click(
    await within(canvasElement).findByRole("button", { name: new RegExp(title) }, { timeout: T }),
  );
const confirm = async (canvasElement: HTMLElement) =>
  userEvent.click(
    await within(canvasElement).findByRole("button", { name: "Confirm booking" }, { timeout: T }),
  );

/* ── Classes ─────────────────────────────────────────────────────────── */

export const AvailableClass = memberStory({
  play: async ({ canvasElement }) => choose(canvasElement, "Technical boxing"),
});
AvailableClass.name = "Available class";

export const LastSeat = memberStory({
  play: async ({ canvasElement }) => choose(canvasElement, "Morning boxing"),
});
LastSeat.name = "Last place left";

export const ClassFull = memberStory({
  play: async ({ canvasElement }) => choose(canvasElement, "Sparring"),
});
ClassFull.name = "Class full · no waitlist";

export const AlreadyBooked = memberStory({
  classes: ok({ classes: [CLASSES[0], BOOKED, CLASSES[2]], next_cursor: null }),
  play: async ({ canvasElement }) => choose(canvasElement, "Technical boxing"),
});
AlreadyBooked.name = "Already booked";

export const BookingPending = memberStory({
  routes: { [`POST /api/v1/me/gym-memberships/${MEMBER}/class-bookings`]: "pending" },
  play: async ({ canvasElement }) => {
    await choose(canvasElement, "Technical boxing");
    await confirm(canvasElement);
  },
});
BookingPending.name = "Booking pending";

export const BookingSuccess = memberStory({
  classes: [
    ok({ classes: CLASSES, next_cursor: null }),
    ok({ classes: [CLASSES[0], BOOKED, CLASSES[2]], next_cursor: null }),
  ],
  routes: {
    [`POST /api/v1/me/gym-memberships/${MEMBER}/class-bookings`]: ok({ booking: booking() }, 201),
  },
  play: async ({ canvasElement }) => {
    await choose(canvasElement, "Technical boxing");
    await confirm(canvasElement);
    await expect(
      await within(canvasElement).findByText(
        "Booking confirmed. Your place is saved.",
        {},
        { timeout: T },
      ),
    ).toBeVisible();
  },
});
BookingSuccess.name = "Booking confirmed";

export const BookingError = memberStory({
  routes: {
    [`POST /api/v1/me/gym-memberships/${MEMBER}/class-bookings`]: {
      status: 409,
      body: {
        error: {
          code: "conflict",
          message: "x",
          details: { class_occurrence: "full", capacity: 16 },
        },
      },
    },
  },
  play: async ({ canvasElement }) => {
    await choose(canvasElement, "Technical boxing");
    await confirm(canvasElement);
  },
});
BookingError.name = "Booking refused · full meanwhile";

export const LostResponse = memberStory({
  routes: { [`POST /api/v1/me/gym-memberships/${MEMBER}/class-bookings`]: "offline" },
  play: async ({ canvasElement }) => {
    await choose(canvasElement, "Technical boxing");
    await confirm(canvasElement);
  },
});
LostResponse.name = "Outcome unknown · try again with the same request";

export const CancellationConfirmation = memberStory({
  classes: ok({ classes: [CLASSES[0], BOOKED, CLASSES[2]], next_cursor: null }),
  play: async ({ canvasElement }) => {
    await choose(canvasElement, "Technical boxing");
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "Cancel booking" }, { timeout: T }),
    );
    await expect(await body().findByRole("alertdialog")).toBeVisible();
  },
});
CancellationConfirmation.name = "Cancel booking · confirmation";

export const CancelledBooking = memberStory({
  classes: ok({
    classes: [
      CLASSES[0],
      klass("Technical boxing", 18, {
        booking: { booking_id: BOOKING, status: "cancelled", checked_in_at: null },
      }),
      CLASSES[2],
    ],
    next_cursor: null,
  }),
  play: async ({ canvasElement }) => choose(canvasElement, "Technical boxing"),
});
CancelledBooking.name = "Cancelled earlier · book again";

/* ── Bookings ────────────────────────────────────────────────────────── */

export const MyBookings = memberStory({ page: "bookings" });
MyBookings.name = "My bookings · upcoming, past, cancelled";

export const NoBookings = memberStory({
  page: "bookings",
  bookings: ok({ bookings: [], next_cursor: null }),
});
NoBookings.name = "My bookings · none";

/* ── Memberships ─────────────────────────────────────────────────────── */

export const MyGyms = memberStory({
  page: "gyms",
  memberships: ok({
    memberships: [
      membership(),
      membership(
        "requested",
        "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a65",
        "Kraków Boxing Club",
        "8b1b2c3d-0000-4000-8000-000000000002",
      ),
    ],
    next_cursor: null,
  }),
});
MyGyms.name = "My gyms · member and pending";

export const NoMembership = memberStory({
  page: "gyms",
  memberships: ok({ memberships: [], next_cursor: null }),
});
NoMembership.name = "No gym membership";

export const PendingMembership = memberStory({
  memberships: ok({ memberships: [membership("requested")], next_cursor: null }),
});
PendingMembership.name = "Membership requested";

export const EndedMembership = memberStory({
  memberships: ok({ memberships: [membership("ended")], next_cursor: null }),
});
EndedMembership.name = "Membership ended";

export const GymUnavailable = memberStory({
  memberships: ok({ memberships: [], next_cursor: null }),
});
GymUnavailable.name = "Not a member of this gym";

/* ── Failures ────────────────────────────────────────────────────────── */

export const SessionExpired = memberStory({ me: apiError(401, "unauthorized") });
SessionExpired.name = "Session expired";

export const BackendFailure = memberStory({ classes: apiError(500, "internal_error") });
BackendFailure.name = "Backend failure";

export const RateLimited = memberStory({ classes: apiError(429, "rate_limited") });
RateLimited.name = "Rate limited";

/* ── Appearance ──────────────────────────────────────────────────────── */

export const Light = {
  ...memberStory({ play: async ({ canvasElement }) => choose(canvasElement, "Technical boxing") }),
  globals: { theme: "Light" },
} satisfies StoryObj;
Light.name = "Light";

export const Dark = {
  ...memberStory({ play: async ({ canvasElement }) => choose(canvasElement, "Technical boxing") }),
  globals: { theme: "Dark" },
} satisfies StoryObj;
Dark.name = "Dark";

export const Narrow = {
  ...memberStory({ play: async ({ canvasElement }) => choose(canvasElement, "Technical boxing") }),
  globals: { viewport: { value: "phone", isRotated: false } },
} satisfies StoryObj;
Narrow.name = "Narrow viewport";

export const LongTranslations = memberStory({
  german: true,
  play: async ({ canvasElement }) => choose(canvasElement, "Technical boxing"),
});
LongTranslations.name = "Long translations (German)";
