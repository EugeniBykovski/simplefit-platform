import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { callWithSession } from "@/entities/session";
import {
  completeFighterOnboarding,
  getGetMyFighterProfileQueryKey,
  getMyFighterProfile,
  updateMyFighterProfile,
} from "@/shared/api/generated/endpoints/fighter-profile/fighter-profile";
import type {
  FighterProfileResponseFighterProfile,
  FighterProfileUpdateRequest,
} from "@/shared/api/generated/model";

/**
 * The signed-in user's FighterProfile (SF-25, ADR 0015 in simplefit-api), the
 * only authority on Fighter onboarding: saved fields, `missing_requirements`
 * and `status` / `completed_at`. The client keeps nothing of its own: every
 * read and write goes through the generated operations, and the cache holds
 * the backend's latest answer only.
 */
export type FighterProfile = FighterProfileResponseFighterProfile;
export type FighterProfilePatch = FighterProfileUpdateRequest;

export const fighterProfileQueryKey = getGetMyFighterProfileQueryKey();

/** `GET /api/v1/me/fighter-profile` (always 200; `not_started` before the first save). */
export async function fetchFighterProfile(signal?: AbortSignal): Promise<FighterProfile> {
  const { fighter_profile } = await callWithSession((init) =>
    getMyFighterProfile({ ...init, signal }),
  );
  return fighter_profile;
}

/**
 * The current profile. Refetched when the window regains focus, so a save from
 * another tab or the mobile app is reconciled instead of overwritten.
 */
export function useFighterProfile() {
  return useQuery({
    queryKey: fighterProfileQueryKey,
    queryFn: ({ signal }) => fetchFighterProfile(signal),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/**
 * The profile's writes. Each resolves with the backend's profile, which
 * replaces the cache; nothing is written optimistically.
 */
export function useFighterProfileActions() {
  const client = useQueryClient();
  const settle = useCallback(
    (profile: FighterProfile) => {
      client.setQueryData(fighterProfileQueryKey, profile);
      return profile;
    },
    [client],
  );

  /** `PATCH`: any subset; omitted fields stay, `null` clears. The first save creates the profile. */
  const save = useCallback(
    async (patch: FighterProfilePatch) =>
      settle(
        (await callWithSession((init) => updateMyFighterProfile(patch, init))).fighter_profile,
      ),
    [settle],
  );

  /** `POST …/complete-onboarding`: the server checks every requirement; repeating keeps `completed_at`. */
  const complete = useCallback(
    async () =>
      settle((await callWithSession((init) => completeFighterOnboarding(init))).fighter_profile),
    [settle],
  );

  return { save, complete };
}
