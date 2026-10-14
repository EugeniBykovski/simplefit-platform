import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { callWithSession } from "@/entities/session";
import {
  completeMyCoachOnboarding,
  getGetMyCoachProfileQueryKey,
  getMyCoachProfile,
  updateMyCoachProfile,
} from "@/shared/api/generated/endpoints/coach-profile/coach-profile";
import { getResolveMyEntryQueryKey } from "@/shared/api/generated/endpoints/entry/entry";
import type {
  CoachProfileResponseCoachProfile,
  CoachProfileUpdateRequest,
} from "@/shared/api/generated/model";

/**
 * The signed-in user's CoachProfile (SF-50, ADR 0020 in simplefit-api), the
 * only authority on Coach onboarding: saved fields, `missing_requirements`
 * and `status` / `completed_at`. Separate from the account (its full name is
 * never copied here) and from the FighterProfile. The cache holds the
 * backend's latest answer only; nothing is written optimistically.
 */
export type CoachProfile = CoachProfileResponseCoachProfile;
export type CoachProfilePatch = CoachProfileUpdateRequest;

export const coachProfileQueryKey = getGetMyCoachProfileQueryKey();

/** `GET /api/v1/me/coach-profile` (always 200; `not_started` before the first save). */
export async function fetchCoachProfile(signal?: AbortSignal): Promise<CoachProfile> {
  const { coach_profile } = await callWithSession((init) => getMyCoachProfile({ ...init, signal }));
  return coach_profile;
}

/**
 * The current profile. Refetched when the window regains focus, so a save from
 * another tab or the mobile app is reconciled instead of overwritten.
 * `enabled: false` reads nothing (a profile the user may not have).
 */
export function useCoachProfile({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: coachProfileQueryKey,
    queryFn: ({ signal }) => fetchCoachProfile(signal),
    enabled,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/** The profile's writes. Each resolves with the backend's profile, which replaces the cache. */
export function useCoachProfileActions() {
  const client = useQueryClient();
  const settle = useCallback(
    (profile: CoachProfile) => {
      client.setQueryData(coachProfileQueryKey, profile);
      return profile;
    },
    [client],
  );

  /** `PATCH`: any subset; omitted fields stay, `null` clears. The first save creates the profile. */
  const save = useCallback(
    async (patch: CoachProfilePatch) =>
      settle((await callWithSession((init) => updateMyCoachProfile(patch, init))).coach_profile),
    [settle],
  );

  /**
   * `POST …/complete-onboarding`: the server checks every requirement (and the
   * account registration); repeating keeps `completed_at`. Success drops the
   * cached entry resolutions, so the next one reflects the new COACH
   * capability.
   */
  const complete = useCallback(async () => {
    const profile = settle(
      (await callWithSession((init) => completeMyCoachOnboarding(init))).coach_profile,
    );
    await client.invalidateQueries({ queryKey: getResolveMyEntryQueryKey().slice(0, 1) });
    return profile;
  }, [client, settle]);

  return { save, complete };
}
