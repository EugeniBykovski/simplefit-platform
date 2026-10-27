"use client";

import { callWithSession } from "@/entities/session";
import { chooseMyEntryContext } from "@/shared/api/generated/endpoints/entry/entry";
import type { EntryContextChoiceRequestContext } from "@/shared/api/generated/model";

export type EntryContext = EntryContextChoiceRequestContext;

/**
 * Records an explicit choice of a completed profile context (SF-51,
 * `PUT /api/v1/me/entry/context`): the entry then resolves to that context's
 * home while it stays completed. The Gym context names its completed gym
 * (`gymId`, SF-84). Only for a deliberate choice (a completion
 * screen's Continue, a context switcher), never on sign-in or resolution.
 * Rejects on any failure; nothing is recorded locally.
 */
export async function chooseEntryContext(context: EntryContext, gymId?: string): Promise<void> {
  await callWithSession((init) =>
    chooseMyEntryContext({ context, ...(gymId === undefined ? {} : { gym_id: gymId }) }, init),
  );
}
