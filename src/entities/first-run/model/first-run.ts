import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { callWithSession } from "@/entities/session";
import {
  getListMyFirstRunExperiencesQueryKey,
  listMyFirstRunExperiences,
  recordMyFirstRunOutcome,
} from "@/shared/api/generated/endpoints/first-run/first-run";
import type {
  FirstRunExperience,
  FirstRunExperienceExperience,
  FirstRunOutcomeRequestOutcome,
} from "@/shared/api/generated/model";

/**
 * One-time first-run experiences (SF-40; simplefit-api ADR 0018). The backend
 * owns whether an experience is still offered and how the user left it; the
 * record is account-wide, so another tab, browser or device sees the same
 * answer. Nothing is kept in browser storage, and nothing is written
 * optimistically: the cache only ever holds the backend's latest answer.
 */
export type FirstRunState = FirstRunExperience;
export type FirstRunExperienceKey = FirstRunExperienceExperience;
export type FirstRunOutcome = FirstRunOutcomeRequestOutcome;

export const firstRunQueryKey = getListMyFirstRunExperiencesQueryKey();

/** `GET /api/v1/me/first-run`. */
export async function fetchFirstRun(signal?: AbortSignal): Promise<FirstRunState[]> {
  const { experiences } = await callWithSession((init) =>
    listMyFirstRunExperiences({ ...init, signal }),
  );
  return experiences;
}

/**
 * The state of one experience. Refetched when the window regains focus, so an
 * outcome recorded in another tab or on another device is picked up. An
 * experience the API does not list (an older backend) is `unavailable`:
 * never offered on a guess.
 */
export function useFirstRun(experience: FirstRunExperienceKey) {
  return useQuery({
    queryKey: firstRunQueryKey,
    queryFn: ({ signal }) => fetchFirstRun(signal),
    select: (experiences): FirstRunState =>
      experiences.find((state) => state.experience === experience) ?? {
        experience,
        status: "unavailable",
        recorded_at: null,
      },
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/**
 * Records how the user left an experience (`PUT /api/v1/me/first-run/{experience}`)
 * and resolves with the kept state: the first outcome is final, so another
 * tab's earlier answer wins. The cache takes the backend's answer only.
 */
export function useRecordFirstRunOutcome(experience: FirstRunExperienceKey) {
  const client = useQueryClient();
  return useCallback(
    async (outcome: FirstRunOutcome) => {
      const { experience: kept } = await callWithSession((init) =>
        recordMyFirstRunOutcome(experience, { outcome }, init),
      );
      client.setQueryData<FirstRunState[]>(firstRunQueryKey, (current = []) => [
        ...current.filter((state) => state.experience !== kept.experience),
        kept,
      ]);
      return kept;
    },
    [client, experience],
  );
}
