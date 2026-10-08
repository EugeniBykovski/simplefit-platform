import { ResolveMyEntryIntent } from "@/shared/api/generated/model";

import { sanitizeReturnTo } from "./return-to";
import { routeHref, webGuards, type WebRouteId } from "./routes";

/**
 * The navigation continuation the auth and entry steps carry (SF-45):
 *
 * - `returnTo`: the page that sent the user to sign-in (SF-24 policy, see
 *   `sanitizeReturnTo`).
 * - `intent`: the journey the user explicitly tried to enter (a role call to
 *   action such as `?intent=fighter`). Navigation only: it is never stored,
 *   never a role and never a capability. Its allow-list is the backend's
 *   (`resolveMyEntry`'s `intent` enum, generated from OpenAPI).
 *
 * Both live only in the URL, so a refresh keeps them and nothing else does.
 * Every value is re-validated wherever it is read; anything not allowed is
 * dropped silently.
 */
export type EntryIntent = ResolveMyEntryIntent;

export type Continuation = { returnTo?: string; intent?: EntryIntent };

const INTENTS: ReadonlySet<string> = new Set(Object.values(ResolveMyEntryIntent));

/**
 * The entry destination each journey intent leads to (`guards.entryDestinations`):
 * the backend resolver's own vocabulary, so a route of one of these destinations
 * names that journey.
 */
const JOURNEY_DESTINATIONS = {
  fighter: "fighter_onboarding",
  coach: "coach_onboarding",
  gym: "gym_onboarding",
  sponsor: "sponsor_application",
} as const satisfies Record<EntryIntent, keyof typeof webGuards.entryDestinations>;

/**
 * The journey a route unambiguously represents (Fighter onboarding → `fighter`),
 * from the registry's entry destinations; `undefined` for every other route,
 * including account registration and role selection, which belong to no single
 * journey. Navigation only: it never authorizes anything.
 */
export function journeyIntentOf(routeId: WebRouteId | undefined): EntryIntent | undefined {
  if (routeId === undefined) return undefined;
  const match = Object.entries(JOURNEY_DESTINATIONS).find(
    ([, destination]) => webGuards.entryDestinations[destination] === routeId,
  );
  return match === undefined ? undefined : parseIntent(match[0]);
}

/** An allowed intent, or `undefined`. Exact match only: no case folding or trimming. */
export function parseIntent(value: unknown): EntryIntent | undefined {
  return typeof value === "string" && INTENTS.has(value) ? (value as EntryIntent) : undefined;
}

type SearchParamsRecord = Record<string, string | string[] | undefined>;

/**
 * The valid continuation of a query: `window.location.search`, a
 * `URLSearchParams` or a Next.js `searchParams` record (a repeated parameter
 * is rejected, not guessed).
 */
export function continuationOf(
  search: string | URLSearchParams | SearchParamsRecord,
): Continuation {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const read = (name: string): unknown => {
    if (params instanceof URLSearchParams) {
      const values = params.getAll(name);
      return values.length === 1 ? values[0] : undefined;
    }
    return params[name];
  };
  const returnTo = sanitizeReturnTo(read(webGuards.returnToParam));
  const intent = parseIntent(read(webGuards.intentParam));
  return {
    ...(returnTo === undefined ? {} : { returnTo }),
    ...(intent === undefined ? {} : { intent }),
  };
}

/** The query parameters of a continuation, re-validated. */
export function continuationQuery(continuation: Continuation = {}): Record<string, string> {
  const returnTo = sanitizeReturnTo(continuation.returnTo);
  const intent = parseIntent(continuation.intent);
  return {
    ...(returnTo === undefined ? {} : { [webGuards.returnToParam]: returnTo }),
    ...(intent === undefined ? {} : { [webGuards.intentParam]: intent }),
  };
}

/** The href of a route that carries the valid continuation along. */
export function withContinuation(id: WebRouteId, continuation: Continuation = {}): string {
  return routeHref(id, {}, continuationQuery(continuation));
}
