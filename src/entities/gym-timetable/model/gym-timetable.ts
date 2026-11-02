"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

import { useGymStaff } from "@/entities/gym-staff";
import { callWithSession } from "@/entities/session";
import {
  getGymClassOccurrence,
  getGymClassSeries,
  listGymClassOccurrences,
  listGymClassSeries,
  listGymClassTemplates,
  listGymVenues,
} from "@/shared/api/generated/endpoints/gym-timetable/gym-timetable";
import type {
  GymClassOccurrence as Occurrence,
  GymClassSeries as Series,
  GymClassSeriesSkippedDatesItem as SkippedDate,
  GymClassTemplate as Template,
  GymVenue as Venue,
  ListGymClassSeriesStatus,
  ListGymClassTemplatesStatus,
  ListGymVenuesStatus,
} from "@/shared/api/generated/model";

/**
 * The gym timetable as the gym's staff read it (SF-97, ADR 0026 amendment):
 *
 * - a **venue** is a training area at one of the gym's locations, with the
 *   IANA zone every class in it is planned in and an optional capacity;
 * - a **class template** is a reusable definition (title and defaults);
 *   editing one never changes classes already scheduled;
 * - a **series** is a bounded weekly rule that the backend materializes
 *   into dated classes when it is written (dates whose local start does not
 *   exist or exists twice are skipped and listed, never moved);
 * - an **occurrence** is one dated class: UTC instants, its zone and wall
 *   times, venue, instructor (a short name, or none) and capacity.
 *
 * The client never builds a class from a rule: every class on screen is a
 * row the backend listed. A capacity is a configured limit only; nothing is
 * booked, attended or paid in this domain.
 */
export type GymVenue = Venue;
export type GymClassTemplate = Template;
export type GymClassSeries = Series;
export type GymClassOccurrence = Occurrence;
export type GymClassSkippedDate = SkippedDate;
export type GymVenueView = ListGymVenuesStatus;
export type GymClassTemplateView = ListGymClassTemplatesStatus;
export type GymClassSeriesView = ListGymClassSeriesStatus;

/**
 * Every cache key of one gym's timetable reads (venues, templates, series,
 * classes, one class, one series). Always the gym named by the caller, never
 * "the current gym": a late answer for one gym can only land under its own
 * key, and the session boundary clears the cache.
 */
export const gymTimetableKey = (gymId: string) => ["gym-timetable", gymId] as const;
const key = (gymId: string, ...rest: readonly unknown[]) => [...gymTimetableKey(gymId), ...rest];

/** The most rows of one page the API returns (SF-97: 1–100). */
const PAGE_SIZE = 100;

/**
 * A gym's venues of one status. The list has no cursor: the backend returns
 * at most `PAGE_SIZE`, which `complete` reports (a gym with more venues sees
 * that the list may be longer, never a silently cut one).
 */
export function useGymVenues(
  gymId: string,
  view: GymVenueView = "active",
  { enabled = true } = {},
) {
  return useQuery({
    queryKey: key(gymId, "venues", view),
    queryFn: ({ signal }) =>
      callWithSession((init) =>
        listGymVenues(gymId, { status: view, limit: PAGE_SIZE }, { ...init, signal }),
      ),
    select: (response) => ({
      venues: response.venues,
      complete: response.venues.length < PAGE_SIZE,
    }),
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/** A gym's class templates of one status (as complete as `useGymVenues`). */
export function useGymClassTemplates(
  gymId: string,
  view: GymClassTemplateView = "active",
  { enabled = true } = {},
) {
  return useQuery({
    queryKey: key(gymId, "templates", view),
    queryFn: ({ signal }) =>
      callWithSession((init) =>
        listGymClassTemplates(gymId, { status: view, limit: PAGE_SIZE }, { ...init, signal }),
      ),
    select: (response) => ({
      templates: response.templates,
      complete: response.templates.length < PAGE_SIZE,
    }),
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/** A gym's series of one status (list views: no counts or skipped dates). */
export function useGymClassSeriesList(
  gymId: string,
  view: GymClassSeriesView = "active",
  { enabled = true } = {},
) {
  return useQuery({
    queryKey: key(gymId, "series", view),
    queryFn: ({ signal }) =>
      callWithSession((init) =>
        listGymClassSeries(gymId, { status: view, limit: PAGE_SIZE }, { ...init, signal }),
      ),
    select: (response) => ({
      series: response.series,
      complete: response.series.length < PAGE_SIZE,
    }),
    enabled,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/** One series in its detail view: counts and the backend's skipped dates. */
export function useGymClassSeries(gymId: string, seriesId: string | null) {
  return useQuery({
    queryKey: key(gymId, "series-detail", seriesId),
    queryFn: ({ signal }) =>
      callWithSession((init) => getGymClassSeries(gymId, seriesId ?? "", { ...init, signal })).then(
        (response) => response.series,
      ),
    enabled: seriesId !== null,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/** One class, read again on its own (details, and after a stale revision). */
export function useGymClassOccurrence(gymId: string, occurrenceId: string | null) {
  return useQuery({
    queryKey: key(gymId, "occurrence", occurrenceId),
    queryFn: ({ signal }) =>
      callWithSession((init) =>
        getGymClassOccurrence(gymId, occurrenceId ?? "", { ...init, signal }),
      ).then((response) => response.occurrence),
    enabled: occurrenceId !== null,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/** What the timetable reads: a window of at most 31 days and the backend's own filters. */
export type OccurrenceWindow = {
  /** RFC 3339 instant (inclusive). */
  from: string;
  /** RFC 3339 instant (exclusive), at most 31 days after `from`. */
  to: string;
  venueId?: string;
  instructorId?: string;
  /** Include cancelled classes (default: scheduled only). */
  includeCancelled?: boolean;
};

/**
 * The gym's classes in a window, every page of it (SF-97 cursor pages of at
 * most 100). The pages are read one after another until the backend says
 * there are no more; until then `complete` is false and the window must not
 * be shown as the whole timetable. A failed page is an error of the window,
 * never a shorter timetable.
 */
export function useGymClassOccurrences(gymId: string, window: OccurrenceWindow) {
  const params = {
    from: window.from,
    to: window.to,
    ...(window.venueId ? { venue_id: window.venueId } : {}),
    ...(window.instructorId ? { instructor_staff_membership_id: window.instructorId } : {}),
    ...(window.includeCancelled ? {} : { status: "scheduled" as const }),
  };
  const query = useInfiniteQuery({
    queryKey: key(gymId, "occurrences", params),
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) =>
        listGymClassOccurrences(
          gymId,
          { ...params, limit: PAGE_SIZE, ...(pageParam === null ? {} : { cursor: pageParam }) },
          { ...init, signal },
        ),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const complete = query.data !== undefined && !query.hasNextPage && !query.isError;
  return {
    query,
    complete,
    occurrences: complete ? query.data.pages.flatMap((page) => page.occurrences) : [],
  };
}

/** The roles SF-97 accepts as instructors (an active owner, manager or coach of the gym). */
const INSTRUCTOR_ROLES = new Set(["owner", "manager", "coach"]);

/** A person who may teach at this gym: their staff membership and short name. */
export type GymInstructor = { staffMembershipId: string; name: string | null; role: string };

/**
 * The gym's possible instructors from its active staff (SF-93 roster, every
 * page): active owners, managers and coaches. A coach profile elsewhere does
 * not make anyone an instructor here, and nobody is added by choosing. The
 * backend checks eligibility again on every write.
 */
export function useGymInstructors(gymId: string, { enabled = true } = {}) {
  const staff = useGymStaff(gymId, "active", { enabled });
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = staff;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);
  const complete = staff.data !== undefined && !staff.hasNextPage;
  const instructors: GymInstructor[] = complete
    ? staff.data.pages
        .flatMap((page) => page.staff)
        .filter((member) => member.status === "active" && INSTRUCTOR_ROLES.has(member.role))
        .map((member) => ({
          staffMembershipId: member.staff_membership_id,
          name: member.name,
          role: member.role,
        }))
    : [];
  return { staff, complete, instructors };
}

/** The viewer's permission projection of `GET /api/v1/gyms/{gym_id}` (read-only). */
type Viewer = { permissions: readonly string[]; staff_membership_id: string };

/**
 * What the timetable offers the viewer, from the backend's permission
 * projection only (SF-83/SF-97). Hints for what to show: the backend decides
 * every request, and a refusal is shown as such.
 *
 * - `view_workspace` (every staff role): the timetable, series, templates
 *   and venues.
 * - `manage_timetable` (owner, managers): every write.
 * - `cancel_occurrence` without `manage_timetable` (a coach): cancelling the
 *   classes they teach, and nothing else; the backend enforces the scope.
 */
export function timetableCapabilities(viewer: Viewer) {
  const has = (permission: string) => viewer.permissions.includes(permission);
  const canManage = has("manage_timetable");
  const canCancelOwn = has("cancel_occurrence");
  return {
    canRead: has("view_workspace"),
    canManage,
    canCancel: (occurrence: Pick<Occurrence, "instructor">) =>
      canManage ||
      (canCancelOwn && occurrence.instructor?.staff_membership_id === viewer.staff_membership_id),
  };
}

export type TimetableCapabilities = ReturnType<typeof timetableCapabilities>;
