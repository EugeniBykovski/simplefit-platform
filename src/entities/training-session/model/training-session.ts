"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { callWithSession } from "@/entities/session";
import {
  getGetMyCoachTrainingSessionQueryKey,
  getListMyCoachTrainingSessionsQueryKey,
  getMyCoachTrainingSession,
  listMyCoachTrainingSessions,
} from "@/shared/api/generated/endpoints/training/training";
import {
  CoachTrainingSessionTrainingType,
  type CoachTrainingSession as CoachTrainingSessionDto,
  type CoachTrainingSessionStatus,
  type ListMyCoachTrainingSessionsView,
} from "@/shared/api/generated/model";

/**
 * A training session as the backend projects it for its coach (SF-62,
 * SF-63; ADR 0023 in simplefit-api): one planned training for one fighter of
 * an active relationship, `planned` until the fighter completes it or it is
 * cancelled (by the coach, or by the system when the relationship ends).
 * The backend owns every status, time and permission; nothing here derives
 * one. A planned session whose time has passed stays `planned` (past due),
 * never "completed".
 */
export type CoachTrainingSession = CoachTrainingSessionDto;
export type TrainingSessionStatus = CoachTrainingSessionStatus;
export type TrainingSessionView = ListMyCoachTrainingSessionsView;
export type TrainingType = CoachTrainingSessionTrainingType;

/** History narrowed to one terminal status, or `all` (completed, cancelled and past due). */
export type TrainingSessionFilter = "all" | "completed" | "cancelled";

/** The five training types, in the order the form offers them. */
export const TRAINING_TYPES = Object.values(CoachTrainingSessionTrainingType);

const PAGE_SIZE = 50;

/** The prefix of every coach session list (for invalidation after a change). */
export const coachTrainingSessionsRootKey = getListMyCoachTrainingSessionsQueryKey().slice(0, 1);

/** One session of the coach. */
export const coachTrainingSessionKey = (sessionId: string) =>
  getGetMyCoachTrainingSessionQueryKey(sessionId);

const listParams = (view: TrainingSessionView, filter: TrainingSessionFilter) =>
  view === "history" && filter !== "all" ? { view, status: filter } : { view };

/** The key of one projection (`upcoming`, or `history` with its filter), paged by cursor. */
export const coachTrainingSessionsKey = (
  view: TrainingSessionView,
  filter: TrainingSessionFilter = "all",
) => [...getListMyCoachTrainingSessionsQueryKey(listParams(view, filter)), "pages"] as const;

/**
 * The coach's sessions in one projection the backend computes with its own
 * clock: `upcoming` (planned and not yet over, earliest first) or `history`
 * (completed, cancelled and past-due planned, newest first; `filter` narrows
 * it to one status). One cursor page at a time; `404` means planning is not
 * available (no coach profile, or Coach–Fighter sharing switched off).
 */
export function useCoachTrainingSessions(
  view: TrainingSessionView,
  filter: TrainingSessionFilter = "all",
) {
  return useInfiniteQuery({
    queryKey: coachTrainingSessionsKey(view, filter),
    queryFn: ({ pageParam, signal }) =>
      callWithSession((init) =>
        listMyCoachTrainingSessions(
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
 * One session of the coach. `404` covers an unknown session, someone else's,
 * one whose relationship ended, and planning being unavailable alike (no
 * existence oracle).
 */
export function useCoachTrainingSession(sessionId: string) {
  return useQuery({
    queryKey: coachTrainingSessionKey(sessionId),
    queryFn: ({ signal }) =>
      callWithSession((init) => getMyCoachTrainingSession(sessionId, { ...init, signal })).then(
        (response) => response.training_session,
      ),
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

/**
 * How a session's fighter is named: the display name, else `@username`,
 * else `null` (the fighter disclosed neither, or the relationship ended).
 */
export function fighterLabel(fighter: CoachTrainingSession["fighter"]): string | null {
  if (fighter === null) return null;
  if (fighter.display_name) return fighter.display_name;
  return fighter.username ? `@${fighter.username}` : null;
}
