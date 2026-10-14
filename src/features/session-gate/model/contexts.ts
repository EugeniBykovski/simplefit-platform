import type { EntryContextChoiceRequestContext } from "@/shared/api/generated/model";

import type { Capability, Entry } from "./entry";

/**
 * The profile contexts of one account (SF-51, SF-54): Fighter and Coach.
 * Which are open to the user is the backend's answer: a context is completed
 * when the entry reports its capability, and a journey is unfinished when its
 * profile is `in_progress`. Nothing here grants, stores or guesses one.
 */
export type ProfileContext = EntryContextChoiceRequestContext;

/** The contexts in the order every chooser lists them. */
export const PROFILE_CONTEXTS: readonly ProfileContext[] = ["fighter", "coach"];

/** The capability a completed context reports. */
export const CONTEXT_CAPABILITY: Record<ProfileContext, Capability> = {
  fighter: "FIGHTER",
  coach: "COACH",
};

/** A journey not completed yet: continued (`in_progress`) or not started. */
export type Journey = { context: ProfileContext; started: boolean };

export type ContextOptions = {
  /** Completed contexts, opened by recording the choice (PUT /api/v1/me/entry/context). */
  completed: ProfileContext[];
  /** Unfinished or unstarted journeys, entered with an explicit intent only. */
  journeys: Journey[];
};

const profileStatus = (entry: Entry, context: ProfileContext) =>
  context === "fighter" ? entry.fighter_profile : entry.coach_profile;

/**
 * The options the entry reports. A context counts as completed only through
 * its capability, never through a profile status alone, an intent or the
 * current URL; every other context is a journey.
 */
export function contextOptions(entry: Entry): ContextOptions {
  const held: readonly string[] = entry.capabilities;
  const completed = PROFILE_CONTEXTS.filter((context) =>
    held.includes(CONTEXT_CAPABILITY[context]),
  );
  const journeys = PROFILE_CONTEXTS.filter((context) => !completed.includes(context)).map(
    (context) => ({ context, started: profileStatus(entry, context) === "in_progress" }),
  );
  return { completed, journeys };
}
