"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getGetMyTrainingSessionQueryKey,
  getListMyTrainingSessionsQueryKey,
  getMyTrainingSession,
  listMyTrainingSessions,
} from "@/shared/api/generated/endpoints/training/training";
import type { MyTrainingSession as MyTrainingSessionDto } from "@/shared/api/generated/model";

import type { TrainingSessionFilter, TrainingSessionView } from "./training-session";

/**
 * A training session as the backend projects it for its fighter (SF-62,
 * SF-63; ADR 0023 in simplefit-api): the fighter's own sessions, from any
 * coach and in any relationship state (also after it ended), whatever the
 * Coach–Fighter sharing gate. `coach` is the coach's public identity while
 * the relationship is active and `null` after it ended, when only
 * `coach_display_name_at_end` remains. Status, times and completion are the
 * backend's; nothing here derives one. Nothing is kept in the browser beyond
 * the in-memory query cache, which is cleared at every session boundary.
 */
export type MyTrainingSession = MyTrainingSessionDto;

const PAGE_SIZE = 50;

/** The prefix of every list of the fighter's own sessions (invalidated after a completion). */
export const myTrainingSessionsRootKey = getListMyTrainingSessionsQueryKey().slice(0, 1);

/** One of the fighter's own sessions. */
export const myTrainingSessionKey = (sessionId: string) =>
  getGetMyTrainingSessionQueryKey(sessionId);

const listParams = (view: TrainingSessionView, filter: TrainingSessionFilter) =>
  view === "history" && filter !== "all" ? { view, status: filter } : { view };

/** The key of one projection of the fighter's sessions, paged by cursor. */
export const myTrainingSessionsKey = (
  view: TrainingSessionView,
  filter: TrainingSessionFilter = "all",
) => [...getListMyTrainingSessionsQueryKey(listParams(view, filter)), "pages"] as const;

/**
 * The fighter's sessions in one projection the backend computes with its own
 * clock (`GET /api/v1/me/training-sessions`): `upcoming` (planned and not yet
 * over, earliest first) or `history` (completed, cancelled and past-due
 * planned, newest first; `filter` narrows it to one status). `404` means the
 * viewer has no completed fighter profile.
 */
export function useMyTrainingSessions(
  view: TrainingSessionView,
  filter: TrainingSessionFilter = "all",
) {
  return useInfiniteQuery({
    queryKey: myTrainingSessionsKey(view, filter),
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) =>
        listMyTrainingSessions(
          {
            ...listParams(view, filter),
            limit: PAGE_SIZE,
            ...(pageParam === null ? {} : { cursor: pageParam }),
          },
          { ...init, signal },
        ),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/**
 * One of the fighter's own sessions (`GET /api/v1/me/training-sessions/{id}`).
 * Unknown, malformed and someone else's are `404` alike (no existence oracle).
 */
export function useMyTrainingSession(sessionId: string) {
  return useQuery({
    queryKey: myTrainingSessionKey(sessionId),
    queryFn: ({ signal }) =>
      callWithSession((init) => getMyTrainingSession(sessionId, { ...init, signal })).then(
        (response) => response.training_session,
      ),
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/**
 * How the fighter's session names its coach: the display name (and brand)
 * while the relationship is active, the name at its end afterwards, else
 * `null` (nothing disclosed).
 */
export function coachIdentity(
  session: Pick<MyTrainingSession, "coach" | "coach_display_name_at_end">,
): { name: string | null; brand: string | null; former: boolean } {
  if (session.coach !== null) {
    return { name: session.coach.display_name, brand: session.coach.brand_name, former: false };
  }
  return { name: session.coach_display_name_at_end, brand: null, former: true };
}
