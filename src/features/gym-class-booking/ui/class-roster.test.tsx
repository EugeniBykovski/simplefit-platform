import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rosterCapabilities } from "@/entities/gym-booking";
import { gymFirstRunQueryKey } from "@/entities/gym-first-run";
import type { GymClassRosterEntry } from "@/shared/api/generated/model";
import { Button } from "@/shared/ui/button";
import { jsonResponse, renderWithProviders } from "@/test/render";

import { bookingProblem } from "../model/booking-problem";
import { ClassRosterSheet, type RosterClass } from "./class-roster";

/*
 * One class's roster in the web console (SF-100, G03 in WG5's panel): the
 * backend's counts and short names only, manual check-in recorded by the
 * backend (a repeat changes nothing, a refusal is said), and the owner's
 * checklist read again afterwards. Who may open it follows the permission
 * projection; the backend checks again.
 */

vi.mock("@/entities/session", () => ({
  callWithSession: <T,>(call: (init: RequestInit) => Promise<T>) =>
    call({ headers: { Authorization: "Bearer test" } }),
  onSessionBoundary: () => () => undefined,
}));

const GYM = "3d0a7f52-1c8e-4b6a-9f20-5e7d1b3c9a64";
const CLASS = "7a1b2c3d-0000-4000-8000-000000000501";
const OWN_STAFF = "6a1b2c3d-0000-4000-8000-000000000102";
const BOOKING = "9c1b2c3d-0000-4000-8000-000000000901";
const ROSTER = `/api/v1/gyms/${GYM}/class-occurrences/${CLASS}/bookings`;
const CHECK_IN = `/api/v1/gyms/${GYM}/class-bookings/${BOOKING}/check-in`;
const NOW = new Date("2026-11-04T10:00:00Z");

const occurrence: RosterClass = {
  occurrence_id: CLASS,
  title: "Technical boxing",
  status: "scheduled",
  time_zone: "Europe/Warsaw",
  starts_at: "2026-11-04T17:00:00Z",
  local_starts_at: "2026-11-04T18:00:00",
  local_ends_at: "2026-11-04T19:30:00",
  venue: { name: "Ring 2" },
};

const entry = (overrides: Partial<GymClassRosterEntry> = {}): GymClassRosterEntry => ({
  booking_id: BOOKING,
  gym_member_id: "8b1b2c3d-0000-4000-8000-000000000001",
  name: "Marta K.",
  status: "confirmed",
  booked_via: "member",
  confirmed_at: "2026-11-03T09:00:00Z",
  cancelled_at: null,
  cancel_reason: null,
  checked_in_at: null,
  ...overrides,
});
const roster = (entries: GymClassRosterEntry[], checkedIn = 0) => ({
  status: 200,
  body: {
    summary: {
      capacity: 16,
      confirmed_count: entries.length,
      remaining_capacity: 16 - entries.length,
      checked_in_count: checkedIn,
    },
    bookings: entries,
    next_cursor: null,
  },
});
const error = (status: number, code: string, details: Record<string, unknown> = {}) => ({
  status,
  body: { error: { code, message: code, details, request_id: null } },
});

type Answer = { status: number; body: unknown } | Error;
type Call = { method: string; path: string; search: URLSearchParams };
function api(routes: Record<string, Answer[]>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init: RequestInit = {}) => {
      const { pathname, searchParams } = new URL(url);
      const method = (init.method ?? "GET").toUpperCase();
      calls.push({ method, path: pathname, search: searchParams });
      const queue = routes[`${method} ${pathname}`];
      if (!queue) return Promise.resolve(jsonResponse({}, { status: 404 }));
      const answer = queue.length > 1 ? queue.shift()! : queue[0]!;
      if (answer instanceof Error) return Promise.reject(answer);
      return Promise.resolve(jsonResponse(answer.body, { status: answer.status }));
    }),
  );
  return calls;
}

const user = userEvent.setup();
const staff = rosterCapabilities({
  role: "front_desk",
  permissions: ["view_workspace", "view_rosters", "record_check_in"],
  staff_membership_id: "6a1b2c3d-0000-4000-8000-000000000103",
});
async function open(can = staff) {
  const rendered = await renderWithProviders(
    <ClassRosterSheet
      gymId={GYM}
      occurrence={occurrence}
      can={can}
      trigger={<Button>Roster</Button>}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Roster" }));
  return { ...rendered, dialog: await screen.findByRole("dialog", { name: "Technical boxing" }) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("rosterCapabilities", () => {
  it("lets a coach open only the rosters of classes they teach", () => {
    const coach = rosterCapabilities({
      role: "coach",
      permissions: ["view_rosters", "record_check_in"],
      staff_membership_id: OWN_STAFF,
    });
    expect(coach.canViewRoster({ instructor: { staff_membership_id: OWN_STAFF } })).toBe(true);
    expect(
      coach.canViewRoster({
        instructor: { staff_membership_id: "6a1b2c3d-0000-4000-8000-000000000999" },
      }),
    ).toBe(false);
    expect(coach.canViewRoster({ instructor: null })).toBe(false);
    expect(staff.canViewRoster({ instructor: null })).toBe(true);
    const none = rosterCapabilities({
      role: "manager",
      permissions: ["view_workspace"],
      staff_membership_id: OWN_STAFF,
    });
    expect(none.canViewRoster({ instructor: null })).toBe(false);
  });
});

describe("ClassRosterSheet (G03 in WG5, SF-100)", () => {
  it("shows the backend's counts and short names, and nothing private", async () => {
    api({ [`GET ${ROSTER}`]: [roster([entry()])] });
    const { dialog } = await open();
    expect(await within(dialog).findByText("Marta K.")).toBeVisible();
    expect(within(dialog).getByText("1/16")).toBeVisible();
    expect(within(dialog).getByText("Places left: 15")).toBeVisible();
    expect(within(dialog).getByText("Checked in: 0")).toBeVisible();
    expect(dialog).not.toHaveTextContent(/@|waitlist|pay at desk|trial/i);
  });

  it("records a check-in from the backend's answer and reads the roster and checklist again", async () => {
    const calls = api({
      [`GET ${ROSTER}`]: [
        roster([entry()]),
        roster([entry({ checked_in_at: "2026-11-04T10:00:00Z" })], 1),
      ],
      [`POST ${CHECK_IN}`]: [
        {
          status: 201,
          body: {
            check_in: {
              check_in_id: "c1",
              booking_id: BOOKING,
              occurrence_id: CLASS,
              gym_member_id: entry().gym_member_id,
              method: "manual",
              checked_in_at: "2026-11-04T10:00:00Z",
            },
          },
        },
      ],
    });
    const { dialog, queryClient } = await open();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(await within(dialog).findByRole("button", { name: "Check in Marta K." }));
    expect(await within(dialog).findByText("Marta K. is checked in.")).toBeVisible();
    await waitFor(() => expect(within(dialog).getByText("Checked in: 1")).toBeVisible());
    expect(within(dialog).queryByRole("button", { name: "Check in Marta K." })).toBeNull();
    expect(calls.filter((call) => call.method === "POST" && call.path === CHECK_IN)).toHaveLength(
      1,
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: gymFirstRunQueryKey(GYM) });
  });

  it("says a check-in outside the class's day was refused, and records nothing", async () => {
    api({
      [`GET ${ROSTER}`]: [roster([entry()])],
      [`POST ${CHECK_IN}`]: [error(409, "conflict", { class_occurrence: "not_today" })],
    });
    const { dialog } = await open();
    await user.click(await within(dialog).findByRole("button", { name: "Check in Marta K." }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Check-in is recorded on the day of the class. Nothing was recorded.",
    );
    expect(within(dialog).getByRole("button", { name: "Check in Marta K." })).toBeVisible();
  });

  it("offers no check-in to a role without record_check_in", async () => {
    api({ [`GET ${ROSTER}`]: [roster([entry()])] });
    const { dialog } = await open(
      rosterCapabilities({
        role: "coach",
        permissions: ["view_rosters"],
        staff_membership_id: OWN_STAFF,
      }),
    );
    expect(await within(dialog).findByText("Marta K.")).toBeVisible();
    expect(within(dialog).queryByRole("button", { name: /Check in/ })).toBeNull();
  });

  it("lists cancelled bookings with the backend's reason", async () => {
    const calls = api({
      [`GET ${ROSTER}`]: [
        roster([entry()]),
        roster([
          entry({
            status: "cancelled",
            cancel_reason: "member_cancelled",
            cancelled_at: "2026-11-03T12:00:00Z",
          }),
        ]),
      ],
    });
    const { dialog } = await open();
    await within(dialog).findByText("Marta K.");
    await user.click(within(dialog).getByRole("tab", { name: "Cancelled" }));
    expect(await within(dialog).findByText("Cancelled by the member")).toBeVisible();
    expect(calls.at(-1)!.search.get("status")).toBe("cancelled");
  });

  it("says a refused roster read as such (a coach for someone else's class)", async () => {
    api({ [`GET ${ROSTER}`]: [error(403, "forbidden")] });
    const { dialog } = await open();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Your role can’t do this.");
  });
});

describe("bookingProblem", () => {
  it("reads the machine-readable details, never the message", async () => {
    const { ApiError } = await import("@/shared/api/http/api-error");
    const conflict = (details: Record<string, unknown>) =>
      new ApiError(409, "conflict", "anything", details, null);
    expect(bookingProblem(conflict({ class_occurrence: "full", capacity: 12 }))).toEqual({
      kind: "full",
      capacity: 12,
    });
    expect(bookingProblem(conflict({ class_booking: "already_booked" }))).toEqual({
      kind: "alreadyBooked",
    });
    expect(bookingProblem(conflict({ class_booking: "checked_in" }))).toEqual({
      kind: "checkedIn",
    });
    expect(bookingProblem(conflict({ gym_member: "requested" }))).toEqual({
      kind: "membership",
      status: "requested",
    });
    expect(bookingProblem(conflict({ client_request_id: "reused" }))).toEqual({
      kind: "keyReused",
    });
    expect(bookingProblem(conflict({ class_occurrence: "not_today" }))).toEqual({
      kind: "notToday",
    });
    expect(bookingProblem(new ApiError(429, "rate_limited", "x", {}, null, 90))).toEqual({
      kind: "limited",
      minutes: 2,
    });
    expect(bookingProblem(new ApiError(404, "not_found", "x", {}, null))).toEqual({ kind: "gone" });
    expect(bookingProblem(new ApiError(503, "unavailable", "x", {}, null))).toEqual({
      kind: "unknown",
    });
    expect(bookingProblem(new TypeError("Failed to fetch"))).toEqual({ kind: "unknown" });
  });
});
