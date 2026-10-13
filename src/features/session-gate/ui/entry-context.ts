"use client";

import { callWithSession } from "@/entities/session";
import { chooseMyEntryContext } from "@/shared/api/generated/endpoints/entry/entry";
import type { EntryContextChoiceRequestContext } from "@/shared/api/generated/model";

export type EntryContext = EntryContextChoiceRequestContext;

/**
 * Records an explicit choice of a completed profile context (SF-51,
 * `PUT /api/v1/me/entry/context`): the entry then resolves to that context's
 * home while it stays completed. Only for a deliberate choice (a completion
 * screen's Continue, a context switcher), never on sign-in or resolution.
 * Rejects on any failure; nothing is recorded locally.
 */
export async function chooseEntryContext(context: EntryContext): Promise<void> {
  await callWithSession((init) => chooseMyEntryContext({ context }, init));
}
