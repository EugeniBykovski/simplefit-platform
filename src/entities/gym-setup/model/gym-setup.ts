import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { callWithSession } from "@/entities/session";
import { getResolveMyEntryQueryKey } from "@/shared/api/generated/endpoints/entry/entry";
import {
  completeGymSetup,
  createGym,
  getGetGymSetupQueryKey,
  getGymSetup,
  getListMyGymsQueryKey,
  listMyGyms,
  setGymPrimaryLocation,
  updateGymSetup,
} from "@/shared/api/generated/endpoints/gyms/gyms";
import type {
  GymCreateRequest,
  GymPrimaryLocationRequest,
  GymSetup as GymSetupModel,
  GymSetupUpdateRequest,
} from "@/shared/api/generated/model";

/**
 * A gym's setup (SF-85, ADR 0026 in simplefit-api): the only authority on Gym
 * owner registration. Saved fields, `revision`, `missing_requirements` and
 * `setup_status`. The cache holds the backend's latest answer only; nothing
 * is written optimistically, and no business state is kept in the browser.
 */
export type GymSetup = GymSetupModel;
export type GymSetupPatch = Omit<GymSetupUpdateRequest, "expected_revision">;
export type GymLocationInput = Omit<GymPrimaryLocationRequest, "expected_revision">;
export type GymCreateInput = GymCreateRequest;

export const gymSetupQueryKey = (gymId: string) => getGetGymSetupQueryKey(gymId);

/** The cache key of the viewer's open draft lookup (one per account session). */
export const gymDraftQueryKey = [...getListMyGymsQueryKey(), "open-draft"] as const;

const PAGE = 100;
/** A guard against a misbehaving cursor; far beyond any real number of workspaces. */
const MAX_PAGES = 20;

/** What the viewer's gym workspaces mean for registration. */
export type GymDraftLookup = {
  /** The draft gym the viewer owns, or `null`. */
  draftId: string | null;
  /** How many completed gyms the viewer staffs (a new gym is then a second one). */
  completed: number;
};

/**
 * The draft gym the viewer owns, if any, and how many completed gyms they
 * staff (SF-83 `GET /me/gyms`). The creation rules keep at most one open
 * draft per creator, so the first owned draft is the one to resume. A
 * completed gym is never resumed here.
 */
export async function fetchGymDraft(signal?: AbortSignal): Promise<GymDraftLookup> {
  let cursor: string | undefined;
  let draftId: string | null = null;
  let completed = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { gyms, next_cursor } = await callWithSession((init) =>
      listMyGyms({ limit: PAGE, ...(cursor ? { cursor } : {}) }, { ...init, signal }),
    );
    for (const gym of gyms) {
      if (gym.setup_status === "completed") completed += 1;
      else if (draftId === null && gym.viewer.role === "owner") draftId = gym.id;
    }
    if (next_cursor === null) break;
    cursor = next_cursor;
  }
  return { draftId, completed };
}

/** `GET /api/v1/gyms/{gym_id}/setup`. */
export async function fetchGymSetup(gymId: string, signal?: AbortSignal): Promise<GymSetup> {
  const { setup } = await callWithSession((init) => getGymSetup(gymId, { ...init, signal }));
  return setup;
}

/**
 * The draft this account owns and its completed gyms, read when the page
 * opens. It is not re-read on focus: the open gym's own setup is (below),
 * so a draft completed or discarded on another device is seen through that
 * gym, never by silently switching the page to another one.
 */
export function useGymDraft() {
  return useQuery({
    queryKey: gymDraftQueryKey,
    queryFn: ({ signal }) => fetchGymDraft(signal),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

/** One gym's setup; `gymId: null` reads nothing. */
export function useGymSetup(gymId: string | null) {
  return useQuery({
    queryKey: gymSetupQueryKey(gymId ?? ""),
    queryFn: ({ signal }) => fetchGymSetup(gymId as string, signal),
    enabled: gymId !== null,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/**
 * The setup writes. Each resolves with the backend's setup, which replaces
 * the cache; a rejection changes nothing here. Every partial write carries
 * the `revision` it was based on (`expected_revision`), so a write based on
 * an older read answers `409 conflict` instead of overwriting.
 */
export function useGymSetupActions() {
  const client = useQueryClient();
  const settle = useCallback(
    (setup: GymSetup) => {
      client.setQueryData(gymSetupQueryKey(setup.gym_id), setup);
      return setup;
    },
    [client],
  );

  /**
   * `POST /api/v1/gyms` with the caller's idempotency key, then the new
   * draft's setup. The backend answers with the open draft it already has
   * for a new key (the request's fields are then ignored), and with the same
   * gym for a repeated key, so a retry after a lost response never creates
   * a second gym.
   */
  const create = useCallback(
    async (input: GymCreateInput) => {
      const { gym } = await callWithSession((init) => createGym(input, init));
      client.setQueryData<GymDraftLookup>(gymDraftQueryKey, (lookup) => ({
        draftId: gym.id,
        completed: lookup?.completed ?? 0,
      }));
      return settle(await fetchGymSetup(gym.id));
    },
    [client, settle],
  );

  /** `PATCH …/setup`: any subset; omitted fields stay, `null` clears. */
  const save = useCallback(
    async (setup: GymSetup, patch: GymSetupPatch) =>
      settle(
        (
          await callWithSession((init) =>
            updateGymSetup(setup.gym_id, { ...patch, expected_revision: setup.revision }, init),
          )
        ).setup,
      ),
    [settle],
  );

  /** `PUT …/setup/primary-location`: the full location; the name defaults to the city. */
  const setLocation = useCallback(
    async (setup: GymSetup, location: GymLocationInput) =>
      settle(
        (
          await callWithSession((init) =>
            setGymPrimaryLocation(
              setup.gym_id,
              { ...location, expected_revision: setup.revision },
              init,
            ),
          )
        ).setup,
      ),
    [settle],
  );

  /**
   * `POST …/complete-setup`: the server checks every requirement; repeating
   * keeps the completed gym. Success drops the cached entry resolutions and
   * the draft lookup, so the next entry reflects the new GYM_WORKSPACE.
   */
  const complete = useCallback(
    async (setup: GymSetup) => {
      const done = settle(
        (await callWithSession((init) => completeGymSetup(setup.gym_id, init))).setup,
      );
      await Promise.all([
        client.invalidateQueries({ queryKey: getResolveMyEntryQueryKey().slice(0, 1) }),
        client.invalidateQueries({ queryKey: gymDraftQueryKey, refetchType: "none" }),
      ]);
      return done;
    },
    [client, settle],
  );

  /** Re-reads one gym's setup (after a conflict) and replaces the cache. */
  const reload = useCallback(async (gymId: string) => settle(await fetchGymSetup(gymId)), [settle]);

  return { create, save, setLocation, complete, reload };
}
