import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  GymMemberClass,
  MyGymClassBooking,
  MyGymMembership,
} from "@/shared/api/generated/model";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { MemberBookings } from "./member-bookings";
import { MemberClasses } from "./member-classes";
import { MemberGyms } from "./member-gyms";

/*
 * The member pages (SF-100) with the network mocked at `fetch`: which gym
 * the member may book at comes from their own memberships, every class,
 * place count and booking shown is the SF-99 API's, success is claimed only
 * from the backend's answer, a lost answer is retried with the same
 * idempotency key, and no waitlist, credit or attendance is invented.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  onSessionBoundary: () => () => undefined,
}));

vi.mock("@/shared/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/app/me/gyms",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const GYM = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const OTHER_GYM = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a65";
const MEMBER = "8b1b2c3d-0000-4000-8000-000000000001";
const CLASS_A = "7a1b2c3d-0000-4000-8000-000000000501";
const CLASS_B = "7a1b2c3d-0000-4000-8000-000000000502";
const BOOKING = "9c1b2c3d-0000-4000-8000-000000000901";
/** Now: Wednesday 4 November 2026, 10:00 UTC (11:00 in Warsaw). */
const NOW = new Date("2026-11-04T10:00:00Z");

const MEMBERSHIPS = "/api/v1/me/gym-memberships";
const CLASSES = `/api/v1/me/gym-memberships/${MEMBER}/classes`;
const BOOK = `/api/v1/me/gym-memberships/${MEMBER}/class-bookings`;
const MY_BOOKINGS = "/api/v1/me/class-bookings";
const CANCEL = `/api/v1/me/class-bookings/${BOOKING}/cancel`;

const membership = (overrides: Partial<MyGymMembership> = {}): MyGymMembership => ({
  gym: { gym_id: GYM, name: "Ring One Boxing" },
  gym_member_id: MEMBER,
  status: "active",
  joined_via: "join_code",
  auto_approved: false,
  requested_at: "2026-10-30T10:00:00Z",
  joined_at: "2026-10-30T11:00:00Z",
  responded_at: "2026-10-30T11:00:00Z",
  ended_at: null,
  ended_reason: null,
  ...overrides,
});

const klass = (overrides: Partial<GymMemberClass> = {}): GymMemberClass => ({
  occurrence_id: CLASS_A,
  title: "Technical boxing",
  status: "scheduled",
  starts_at: "2026-11-04T17:00:00Z",
  ends_at: "2026-11-04T18:30:00Z",
  time_zone: "Europe/Warsaw",
  local_starts_at: "2026-11-04T18:00:00",
  local_ends_at: "2026-11-04T19:30:00",
  utc_offset_minutes: 60,
  duration_minutes: 90,
  venue: { name: "Ring 2" },
  instructor: { name: "Tomasz Z." },
  capacity: 16,
  remaining_capacity: 9,
  booking: null,
  ...overrides,
});

const booking = (overrides: Partial<MyGymClassBooking> = {}): MyGymClassBooking => ({
  booking_id: BOOKING,
  gym_member_id: MEMBER,
  status: "confirmed",
  booked_via: "member",
  confirmed_at: "2026-11-03T09:00:00Z",
  cancelled_at: null,
  cancel_reason: null,
  checked_in_at: null,
  class: {
    occurrence_id: CLASS_A,
    gym: { gym_id: GYM, name: "Ring One Boxing" },
    title: "Technical boxing",
    status: "scheduled",
    starts_at: "2026-11-04T17:00:00Z",
    ends_at: "2026-11-04T18:30:00Z",
    time_zone: "Europe/Warsaw",
    local_starts_at: "2026-11-04T18:00:00",
    local_ends_at: "2026-11-04T19:30:00",
    utc_offset_minutes: 60,
    venue: { name: "Ring 2" },
    instructor: { name: "Tomasz Z." },
  },
  ...overrides,
});

type Answer = { status: number; body?: unknown } | Error | (() => Promise<Response>);
type Call = { method: string; path: string; search: URLSearchParams; body: unknown };

/** A fake API keyed by `METHOD path`: queued answers in order (the last one repeats). */
function api(routes: Record<string, Answer[]>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const { pathname, searchParams } = new URL(url);
      const method = (init.method ?? "GET").toUpperCase();
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, path: pathname, search: searchParams, body });
      const queue = routes[`${method} ${pathname}`];
      if (!queue) return Promise.resolve(jsonResponse({}, { status: 404 }));
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      if (answer instanceof Error) return Promise.reject(answer);
      if (typeof answer === "function") return answer();
      return Promise.resolve(jsonResponse(answer.body ?? {}, { status: answer.status }));
    }),
  );
  return calls;
}

const ok = (body: unknown, status = 200) => ({ status, body });
const error = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  body: { error: { code, message: code, details, request_id: null } },
});
const list = (memberships: MyGymMembership[]) => ok({ memberships, next_cursor: null });
const classes = (items: GymMemberClass[]) => ok({ classes: items, next_cursor: null });

const user = userEvent.setup();
const posts = (calls: Call[], path: string) =>
  calls.filter((call) => call.method === "POST" && call.path === path);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("MemberClasses (F13 on the web, SF-100)", () => {
  it("shows a gym's classes only for an active membership, with the backend's places left", async () => {
    const calls = api({
      [`GET ${MEMBERSHIPS}`]: [list([membership()])],
      [`GET ${CLASSES}`]: [
        classes([
          klass(),
          klass({
            occurrence_id: CLASS_B,
            title: "Sparring",
            remaining_capacity: 0,
            capacity: 8,
            local_starts_at: "2026-11-04T20:00:00",
            starts_at: "2026-11-04T19:00:00Z",
          }),
        ]),
      ],
    });
    await renderWithProviders(<MemberClasses gymId={GYM} />);
    const row = await screen.findByRole("button", { name: /Technical boxing/ });
    expect(row).toHaveTextContent("Tomasz Z. · Ring 2 · 9 of 16 left");
    expect(row).toHaveAttribute("data-class-state", "open");
    expect(screen.getByRole("button", { name: /Sparring/ })).toHaveAttribute(
      "data-class-state",
      "full",
    );
    // One window with the backend's own bounds; nothing about other members.
    const read = calls.find((call) => call.path === CLASSES)!;
    expect(read.search.get("from")).toMatch(/^2026-11-0[34]T/);
    expect(document.body).not.toHaveTextContent(/waitlist #|credit|%/i);
  });

  it.each([
    ["requested", "Your request is waiting"],
    ["ended", "Your membership isn’t active"],
  ] as const)("says a %s membership as such and shows no class", async (status, title) => {
    const calls = api({ [`GET ${MEMBERSHIPS}`]: [list([membership({ status })])] });
    await renderWithProviders(<MemberClasses gymId={GYM} />);
    expect(await screen.findByRole("heading", { name: title })).toBeVisible();
    expect(calls.some((call) => call.path === CLASSES)).toBe(false);
  });

  it("never reveals a gym the viewer is not a member of", async () => {
    api({
      [`GET ${MEMBERSHIPS}`]: [list([membership({ gym: { gym_id: OTHER_GYM, name: "Other" } })])],
    });
    await renderWithProviders(<MemberClasses gymId={GYM} />);
    expect(
      await screen.findByRole("heading", { name: "You’re not a member of this gym" }),
    ).toBeVisible();
    expect(document.body).not.toHaveTextContent("Other");
  });

  it("books a place with one request key and shows success only from the backend's answer", async () => {
    const calls = api({
      [`GET ${MEMBERSHIPS}`]: [list([membership()])],
      [`GET ${CLASSES}`]: [
        classes([klass()]),
        classes([
          klass({
            remaining_capacity: 8,
            booking: { booking_id: BOOKING, status: "confirmed", checked_in_at: null },
          }),
        ]),
      ],
      [`POST ${BOOK}`]: [ok({ booking: booking() }, 201)],
      [`GET ${MY_BOOKINGS}`]: [ok({ bookings: [], next_cursor: null })],
    });
    await renderWithProviders(<MemberClasses gymId={GYM} />);
    await user.click(await screen.findByRole("button", { name: /Technical boxing/ }));
    await user.click(screen.getByRole("button", { name: "Confirm booking" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Booking confirmed");
    const [sent] = posts(calls, BOOK);
    expect(sent!.body).toEqual({
      occurrence_id: CLASS_A,
      client_request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    // Read again from the backend: the member's booking and one place fewer.
    const details = screen.getByRole("region", { name: "Technical boxing" });
    await waitFor(() => expect(details).toHaveAttribute("data-class-state", "booked"));
    expect(within(details).getByText("8 of 16 left")).toBeVisible();
    expect(within(details).getByRole("button", { name: "Cancel booking" })).toBeVisible();
  });

  it("says a full class lost to someone else, books nothing and offers no waitlist", async () => {
    api({
      [`GET ${MEMBERSHIPS}`]: [list([membership()])],
      [`GET ${CLASSES}`]: [
        classes([klass({ remaining_capacity: 1 })]),
        classes([klass({ remaining_capacity: 0 })]),
      ],
      [`POST ${BOOK}`]: [error(409, "conflict", { class_occurrence: "full", capacity: 16 })],
      [`GET ${MY_BOOKINGS}`]: [ok({ bookings: [], next_cursor: null })],
    });
    await renderWithProviders(<MemberClasses gymId={GYM} />);
    await user.click(await screen.findByRole("button", { name: /Technical boxing/ }));
    await user.click(screen.getByRole("button", { name: "Confirm booking" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This class is full (16 places). No booking was made, and there is no waitlist.",
    );
    const details = screen.getByRole("region", { name: "Technical boxing" });
    await waitFor(() => expect(details).toHaveAttribute("data-class-state", "full"));
    expect(within(details).queryByRole("button", { name: "Confirm booking" })).toBeNull();
  });

  it("retries a lost answer with the same request key, so at most one booking can result", async () => {
    const calls = api({
      [`GET ${MEMBERSHIPS}`]: [list([membership()])],
      [`GET ${CLASSES}`]: [classes([klass()])],
      [`POST ${BOOK}`]: [new TypeError("Failed to fetch"), ok({ booking: booking() }, 200)],
      [`GET ${MY_BOOKINGS}`]: [ok({ bookings: [], next_cursor: null })],
    });
    await renderWithProviders(<MemberClasses gymId={GYM} />);
    await user.click(await screen.findByRole("button", { name: /Technical boxing/ }));
    await user.click(screen.getByRole("button", { name: "Confirm booking" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn’t confirm the outcome.");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(posts(calls, BOOK)).toHaveLength(2));
    const [first, second] = posts(calls, BOOK);
    expect((second!.body as { client_request_id: string }).client_request_id).toBe(
      (first!.body as { client_request_id: string }).client_request_id,
    );
  });

  it("cancels the member's own booking after a confirmation, and keeps it until the backend answers", async () => {
    const booked = klass({
      booking: { booking_id: BOOKING, status: "confirmed", checked_in_at: null },
    });
    const calls = api({
      [`GET ${MEMBERSHIPS}`]: [list([membership()])],
      [`GET ${CLASSES}`]: [
        classes([booked]),
        classes([
          klass({ booking: { booking_id: BOOKING, status: "cancelled", checked_in_at: null } }),
        ]),
      ],
      [`POST ${CANCEL}`]: [
        ok({
          booking: booking({
            status: "cancelled",
            cancel_reason: "member_cancelled",
            cancelled_at: "2026-11-04T10:00:00Z",
          }),
        }),
      ],
      [`GET ${MY_BOOKINGS}`]: [ok({ bookings: [], next_cursor: null })],
    });
    await renderWithProviders(<MemberClasses gymId={GYM} />);
    await user.click(await screen.findByRole("button", { name: /Technical boxing/ }));
    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Cancel your booking?" });
    expect(dialog).not.toHaveTextContent(/refund/i);
    await user.click(within(dialog).getByRole("button", { name: "Cancel booking" }));
    await waitFor(() => expect(posts(calls, CANCEL)).toHaveLength(1));
    const details = screen.getByRole("region", { name: "Technical boxing" });
    await waitFor(() => expect(details).toHaveAttribute("data-class-state", "open"));
    expect(within(details).getByText(/You cancelled an earlier booking/)).toBeVisible();
  });

  it("offers nothing for a class that has started", async () => {
    api({
      [`GET ${MEMBERSHIPS}`]: [list([membership()])],
      [`GET ${CLASSES}`]: [
        classes([
          klass({ starts_at: "2026-11-04T09:00:00Z", local_starts_at: "2026-11-04T10:00:00" }),
        ]),
      ],
    });
    await renderWithProviders(<MemberClasses gymId={GYM} />);
    await user.click(await screen.findByRole("button", { name: /Technical boxing/ }));
    expect(screen.getByText("This class has started and can’t be booked.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Confirm booking" })).toBeNull();
  });

  it("says the membership ended when the classes read answers 409 gym_member", async () => {
    api({
      [`GET ${MEMBERSHIPS}`]: [list([membership()])],
      [`GET ${CLASSES}`]: [error(409, "conflict", { gym_member: "ended" })],
    });
    await renderWithProviders(<MemberClasses gymId={GYM} />);
    expect(
      await screen.findByRole("heading", { name: "Your membership isn’t active" }),
    ).toBeVisible();
  });
});

describe("MemberGyms (SF-100)", () => {
  it("lists active memberships, pending requests and history, without a profile", async () => {
    api({
      [`GET ${MEMBERSHIPS}`]: [
        list([
          membership(),
          membership({
            gym_member_id: "8b1b2c3d-0000-4000-8000-000000000002",
            status: "requested",
            gym: { gym_id: OTHER_GYM, name: "Kraków Boxing" },
          }),
          membership({
            gym_member_id: "8b1b2c3d-0000-4000-8000-000000000003",
            status: "ended",
            ended_at: "2026-10-31T10:00:00Z",
            ended_reason: "left",
            gym: { gym_id: "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a66", name: "Old Gym" },
          }),
        ]),
      ],
    });
    await renderWithProviders(<MemberGyms />);
    const link = await screen.findByRole("link", { name: "Open the classes of Ring One Boxing" });
    expect(link).toHaveAttribute("href", `/app/me/gyms/${GYM}/classes`);
    expect(screen.getByText("Kraków Boxing")).toBeVisible();
    expect(screen.getByText("Waiting for the gym to approve your request")).toBeVisible();
    // SF-134: history is listed, opens nothing and offers no action.
    const old = screen.getByText("Old Gym").closest("li")!;
    expect(old).toHaveAttribute("data-membership-status", "ended");
    expect(within(old).getByText(/You left this gym/)).toBeVisible();
    expect(within(old).queryByRole("link")).toBeNull();
    expect(within(old).queryByRole("button")).toBeNull();
  });

  it("says when the account is not a member of any gym", async () => {
    api({ [`GET ${MEMBERSHIPS}`]: [list([])] });
    await renderWithProviders(<MemberGyms />);
    expect(
      await screen.findByRole("heading", { name: "You’re not a member of a gym" }),
    ).toBeVisible();
  });
});

describe("MemberBookings (SF-100)", () => {
  it("splits upcoming, past and cancelled bookings and never invents attendance", async () => {
    api({
      [`GET ${MY_BOOKINGS}`]: [
        ok({
          bookings: [
            booking(),
            booking({
              booking_id: "9c1b2c3d-0000-4000-8000-000000000902",
              class: {
                ...booking().class,
                title: "Morning boxing",
                starts_at: "2026-11-02T07:00:00Z",
                ends_at: "2026-11-02T08:00:00Z",
                local_starts_at: "2026-11-02T08:00:00",
                local_ends_at: "2026-11-02T09:00:00",
              },
            }),
            booking({
              booking_id: "9c1b2c3d-0000-4000-8000-000000000903",
              checked_in_at: "2026-11-03T07:05:00Z",
              class: {
                ...booking().class,
                title: "Pads",
                starts_at: "2026-11-03T07:00:00Z",
                ends_at: "2026-11-03T08:00:00Z",
                local_starts_at: "2026-11-03T08:00:00",
                local_ends_at: "2026-11-03T09:00:00",
              },
            }),
            booking({
              booking_id: "9c1b2c3d-0000-4000-8000-000000000904",
              status: "cancelled",
              cancel_reason: "occurrence_cancelled",
              cancelled_at: "2026-11-01T10:00:00Z",
              class: { ...booking().class, title: "Sparring", status: "cancelled" },
            }),
          ],
          next_cursor: null,
        }),
      ],
    });
    await renderWithProviders(<MemberBookings />);
    const upcoming = await screen.findByRole("region", { name: "Upcoming · 1" });
    expect(within(upcoming).getByText("Technical boxing")).toBeVisible();
    expect(within(upcoming).getByRole("button", { name: "Cancel booking" })).toBeVisible();
    const past = screen.getByRole("region", { name: "Past · 2" });
    const morning = within(past).getByText("Morning boxing").closest("li")!;
    expect(morning).not.toHaveTextContent(/attended|checked in|no-show|missed/i);
    expect(within(past).getByText("Pads").closest("li")).toHaveTextContent("Checked in");
    const cancelled = screen.getByRole("region", { name: "Cancelled · 1" });
    expect(cancelled).toHaveTextContent("Class cancelled");
    expect(document.body).not.toHaveTextContent(/refund|credit/i);
  });

  it("draws nothing until every page has arrived", async () => {
    const calls = api({
      [`GET ${MY_BOOKINGS}`]: [
        ok({ bookings: [booking()], next_cursor: "page-2" }),
        ok({
          bookings: [
            booking({
              booking_id: "9c1b2c3d-0000-4000-8000-000000000905",
              class: { ...booking().class, title: "Pads" },
            }),
          ],
          next_cursor: null,
        }),
      ],
    });
    await renderWithProviders(<MemberBookings />);
    expect(await screen.findByRole("region", { name: "Upcoming · 2" })).toBeVisible();
    expect(
      calls.filter((call) => call.path === MY_BOOKINGS).map((call) => call.search.get("cursor")),
    ).toEqual([null, "page-2"]);
  });
});
