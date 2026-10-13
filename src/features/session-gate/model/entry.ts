import { callWithSession } from "@/entities/session";
import { resolveMyEntry } from "@/shared/api/generated/endpoints/entry/entry";
import type {
  EntryResponseEntry,
  EntryResponseEntryCapabilitiesItem,
  EntryResponseEntryDestination,
  ResolveMyEntryParams,
} from "@/shared/api/generated/model";
import { continuationQuery, type Continuation } from "@/shared/routes/continuation";
import { sanitizeReturnTo } from "@/shared/routes/return-to";
import {
  matchWebRoute,
  routeHref,
  webGuards,
  webRoute,
  type WebRouteId,
} from "@/shared/routes/routes";

/**
 * Application entry (SF-45; simplefit-api ADR 0017). Where an authenticated
 * user goes is decided by the backend (`GET /api/v1/me/entry`) from current
 * state: account registration, then the explicit intent, then role state.
 * This module only maps the semantic destination to a registry route and
 * applies the client-side `returnTo` path policy; it never re-derives
 * registration, onboarding or capability state.
 */
export type Entry = EntryResponseEntry;

/**
 * The destinations this client maps (`guards.entryDestinations`). The API may
 * return more (SF-51's `context_selection` has no route until its chooser is
 * designed and built); those stay unknown here.
 */
export type KnownDestination = keyof typeof webGuards.entryDestinations &
  EntryResponseEntryDestination;

/** An entry whose destination this client maps. */
export type KnownEntry = Entry & { destination: KnownDestination };

/**
 * Whether this client maps `destination`: a newer API may resolve to a
 * destination an older client does not know. Such an entry is a controlled
 * failure, never a guessed fallback (never `fighter_home`).
 */
export function knowsDestination(destination: string): destination is KnownDestination {
  return Object.hasOwn(webGuards.entryDestinations, destination);
}

/** Whether this client maps the entry's destination (see `knowsDestination`). */
export function isKnownEntry(entry: Entry): entry is KnownEntry {
  return knowsDestination(entry.destination);
}

/** The canonical web route of a semantic destination (`guards.entryDestinations`). */
export function destinationRoute(destination: KnownDestination): WebRouteId {
  return webGuards.entryDestinations[destination];
}

/**
 * A safe `returnTo` the user can actually open now: not the entry itself
 * (that would only resolve again) and not behind a capability the backend
 * does not report. Capabilities are a routing projection; the API still
 * authorizes every request.
 */
function usableReturnTo(returnTo: string | undefined, entry: Entry): string | undefined {
  const safe = sanitizeReturnTo(returnTo);
  if (safe === undefined) return undefined;
  const route = matchWebRoute(safe.split("?")[0] ?? safe);
  if (route === undefined || route.id === webGuards.entry) return undefined;
  const held: readonly string[] = entry.capabilities;
  if (route.capability !== null && !held.includes(route.capability)) return undefined;
  return safe;
}

/** The destinations of a completed journey: an intent leading there has nothing left to set up. */
const HOMES: ReadonlySet<KnownDestination> = new Set(["fighter_home", "coach_home"]);

export type Capability = EntryResponseEntryCapabilitiesItem;

/** Whether the resolved entry reports `capability` (a routing projection, never authorization). */
export function holds(entry: Entry, capability: Capability): boolean {
  return entry.capabilities.includes(capability);
}

/**
 * The href for a resolved entry and the continuation the user carries:
 *
 * 1. A mandatory destination (account registration, unfinished Fighter or
 *    Coach onboarding) always wins.
 * 2. An explicit intent leads to its journey, unless that journey is already
 *    complete (`fighter_home`, `coach_home`).
 * 3. Otherwise a usable `returnTo` wins over the derived destination.
 * 4. Otherwise the destination.
 *
 * Onboarding routes keep the continuation in their URL, so it survives a
 * refresh and is resolved again once the step completes.
 */
export function entryHref(entry: KnownEntry, continuation: Continuation = {}): string {
  const target = destinationRoute(entry.destination);
  const intentDriven = continuation.intent !== undefined && !HOMES.has(entry.destination);

  if (!entry.mandatory && !intentDriven) {
    const returnTo = usableReturnTo(continuation.returnTo, entry);
    if (returnTo !== undefined) return returnTo;
  }

  const carries = webRoute(target).phase === "ONBOARDING";
  return routeHref(target, {}, carries ? continuationQuery(continuation) : {});
}

/** The resolver request for a continuation: only its validated intent is sent. */
export function entryParams(continuation: Continuation): ResolveMyEntryParams | undefined {
  return continuation.intent === undefined ? undefined : { intent: continuation.intent };
}

/** Resolves the entry of the signed-in user (refreshing the session once on 401). */
export async function fetchEntry(continuation: Continuation, signal?: AbortSignal): Promise<Entry> {
  const params = entryParams(continuation);
  const { entry } = await callWithSession((init) => resolveMyEntry(params, { ...init, signal }));
  return entry;
}
