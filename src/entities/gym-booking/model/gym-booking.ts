"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { callWithSession } from "@/entities/session";
import {
  getGymClassRoster,
  listMyGymClassBookings,
  listMyGymClasses,
} from "@/shared/api/generated/endpoints/gym-bookings/gym-bookings";
import { listMyGymMemberships } from "@/shared/api/generated/endpoints/gym-members/gym-members";
import type {
  GymClassRosterEntry as RosterEntry,
  GymClassRosterSummary as RosterSummary,
  GetGymClassRosterStatus,
  GymMemberClass as MemberClass,
  MyGymClassBooking as Booking,
  MyGymMembership as Membership,
} from "@/shared/api/generated/model";

/**
 * Gym class bookings and attendance (SF-99, ADR 0026 amendment) as the
 * clients read them. The backend owns every rule: who may book, whether a
 * class can still be booked or cancelled, how many places are left, the
 * booking's lifecycle and attendance. The client only shows its answers.
 *
 * - A **membership** (SF-95) is the person's participation in one gym. Only
 *   an `active` one books; it needs no Fighter or Coach profile.
 * - A **member class** is one class of the membership's gym with the
 *   places left (`remaining_capacity`) and the viewer's own booking, never
 *   another participant.
 * - A **booking** is a place the viewer holds (`confirmed`) or held
 *   (`cancelled`, final, with the backend's reason); `checked_in_at` is set
 *   only when staff recorded the person's arrival.
 * - A **roster** is one class's bookings for its staff: a short name and
 *   booking facts per member, with the class's counts. Never an email,
 *   profile, other gym or training data.
 *
 * Nothing here is a price, credit, plan, waitlist or payment: none exists.
 */
export type GymMembership = Membership;
export type GymMemberClass = MemberClass;
export type GymClassBooking = Booking;
export type GymClassRosterEntry = RosterEntry;
export type GymClassRosterSummary = RosterSummary;
export type GymClassRosterView = GetGymClassRosterStatus;

const PAGE_SIZE = 100;

/**
 * Cache keys. Every key names its owner (the membership, or the gym and
 * class), never "the current" one, so a late answer can only land under its
 * own key; the session boundary clears the whole cache, so nothing of one
 * account is shown to the next.
 */
export const gymBookingKey = ["gym-booking"] as const;
export const myGymMembershipsKey = [...gymBookingKey, "memberships"] as const;
export const myClassBookingsKey = [...gymBookingKey, "mine"] as const;
export const allMemberClassesKey = [...gymBookingKey, "member-classes"] as const;
export const memberClassesKey = (gymMemberId: string) =>
  [...allMemberClassesKey, gymMemberId] as const;
export const classRosterKey = (gymId: string, occurrenceId: string) =>
  [...gymBookingKey, "roster", gymId, occurrenceId] as const;

/**
 * Reads every page of a cursor list, one after another, until the backend
 * says there are no more. Until then `complete` is false: a partial list is
 * never shown as the whole one, and nothing is filtered or counted from it.
 * A failed page is an error of the list, never a shorter list.
 */
function useEveryPage<Page extends { next_cursor: string | null }, Item>({
  queryKey,
  read,
  items,
  enabled = true,
}: {
  queryKey: readonly unknown[];
  read: (cursor: string | null, init: RequestInit) => Promise<Page>;
  items: (page: Page) => Item[];
  enabled?: boolean;
}) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) => read(pageParam, { ...init, signal })),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);
  const complete = query.data !== undefined && !query.hasNextPage && !query.isError;
  // A page without its list (never sent by the contract) adds nothing rather than breaking the view.
  return {
    query,
    complete,
    items: complete ? query.data.pages.flatMap((page) => items(page) ?? []) : [],
  };
}

const cursor = (value: string | null) => (value === null ? {} : { cursor: value });

/** Every gym membership of the viewer (SF-95 `GET /me/gym-memberships`), every status. */
export function useMyGymMemberships({ enabled = true } = {}) {
  const list = useEveryPage({
    queryKey: myGymMembershipsKey,
    read: (next, init) => listMyGymMemberships({ limit: PAGE_SIZE, ...cursor(next) }, init),
    items: (page) => page.memberships,
    enabled,
  });
  return { query: list.query, complete: list.complete, memberships: list.items };
}

/**
 * The viewer's membership of one gym that decides what they may do there:
 * the active one, else a pending request, else the latest other one (the
 * backend lists newest first); `null` when the viewer never joined this gym.
 */
export function membershipOf(
  memberships: readonly GymMembership[],
  gymId: string,
): GymMembership | null {
  const ofGym = memberships.filter((membership) => membership.gym.gym_id === gymId);
  return (
    ofGym.find((membership) => membership.status === "active") ??
    ofGym.find((membership) => membership.status === "requested") ??
    ofGym[0] ??
    null
  );
}

/** The gyms the viewer may book at or is waiting for: active memberships and pending requests. */
export const currentMemberships = (memberships: readonly GymMembership[]) =>
  memberships.filter(
    (membership) => membership.status === "active" || membership.status === "requested",
  );

/** A window of member classes: RFC 3339 instants, `[from, to)`, at most 31 days. */
export type MemberClassWindow = { from: string; to: string };

/**
 * The classes of one active membership's gym in a window, with the places
 * left and the viewer's own booking (SF-99 `GET /me/gym-memberships/{id}/classes`),
 * every page, by start time.
 */
export function useMemberClasses(gymMemberId: string | null, window: MemberClassWindow) {
  const list = useEveryPage({
    queryKey: [...memberClassesKey(gymMemberId ?? ""), window],
    read: (next, init) =>
      listMyGymClasses(
        gymMemberId ?? "",
        { from: window.from, to: window.to, limit: PAGE_SIZE, ...cursor(next) },
        init,
      ),
    items: (page) => page.classes,
    enabled: gymMemberId !== null,
  });
  return { query: list.query, complete: list.complete, classes: list.items };
}

/** Every class booking of the viewer at every gym (SF-99 `GET /me/class-bookings`), newest first. */
export function useMyClassBookings() {
  const list = useEveryPage({
    queryKey: myClassBookingsKey,
    read: (next, init) => listMyGymClassBookings({ limit: PAGE_SIZE, ...cursor(next) }, init),
    items: (page) => page.bookings,
  });
  return { query: list.query, complete: list.complete, bookings: list.items };
}

/**
 * One class's roster for its staff (SF-99 `GET /gyms/{id}/class-occurrences/{id}/bookings`):
 * confirmed bookings (oldest confirmation first) or cancelled ones, every
 * page, and the class's counts from the backend (the first page's summary,
 * which is the same on every page).
 */
export function useClassRoster(
  gymId: string,
  occurrenceId: string,
  view: GymClassRosterView,
  { enabled = true } = {},
) {
  const list = useEveryPage({
    queryKey: [...classRosterKey(gymId, occurrenceId), view],
    read: (next, init) =>
      getGymClassRoster(
        gymId,
        occurrenceId,
        { status: view, limit: PAGE_SIZE, ...cursor(next) },
        init,
      ),
    items: (page) => page.bookings,
    enabled,
  });
  const summary = list.query.data?.pages[0]?.summary ?? null;
  return { query: list.query, complete: list.complete, entries: list.items, summary };
}

/**
 * Whether the viewer's staff role may open a class's roster, from the
 * gym's permission projection: `view_rosters` for any class, except that a
 * coach (who holds it for their own classes only) sees only classes they
 * instruct. The backend checks again on every read.
 */
export function rosterCapabilities(viewer: {
  role: string;
  permissions: readonly string[];
  staff_membership_id: string;
}) {
  const has = (permission: string) => viewer.permissions.includes(permission);
  return {
    canViewRoster: (occurrence: { instructor: { staff_membership_id: string } | null }) =>
      has("view_rosters") &&
      (viewer.role !== "coach" ||
        occurrence.instructor?.staff_membership_id === viewer.staff_membership_id),
    canCheckIn: has("record_check_in"),
  };
}
export type RosterCapabilities = ReturnType<typeof rosterCapabilities>;
