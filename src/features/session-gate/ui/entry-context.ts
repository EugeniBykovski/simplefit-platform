"use client";

import { callWithSession } from "@/entities/session";
import { chooseMyEntryContext } from "@/shared/api/generated/endpoints/entry/entry";
import type { EntryContextChoiceRequestContext } from "@/shared/api/generated/model";

export type EntryContext = EntryContextChoiceRequestContext;

/**
 * Records an explicit choice of a completed profile context (SF-51,
 * `PUT /api/v1/me/entry/context`): the entry then resolves to that context's
 * home while it stays completed. The Gym context names its completed gym
 * (`id`, SF-84) and the Sponsor context its organization (`id`, SF-112); the
 * backend accepts either only while the user may use it (404 otherwise). Only
 * for a deliberate choice (a completion screen's Continue, a context
 * switcher), never on sign-in or resolution. Rejects on any failure; nothing
 * is recorded locally.
 */
export async function chooseEntryContext(context: EntryContext, id?: string): Promise<void> {
  const named = id === undefined ? {} : context === "sponsor" ? { sponsor_id: id } : { gym_id: id };
  await callWithSession((init) => chooseMyEntryContext({ context, ...named }, init));
}
