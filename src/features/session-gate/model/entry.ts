import type { Viewer } from "@/entities/session";
import { sanitizeReturnTo } from "@/shared/routes/return-to";
import { routeHref, webGuards } from "@/shared/routes/routes";

/**
 * Application entry (SF-24): where an authenticated viewer goes after
 * sign-in, sign-up or a restored session on a guest-only page. Pure.
 *
 * 1. A valid `returnTo` (see `sanitizeReturnTo`), consumed once: the
 *    destination replaces the auth page in history.
 * 2. Otherwise the neutral canonical entry, `/app` (`guards.entry`).
 *
 * The API exposes only the viewer's id today, so nothing is inferred about
 * roles, profiles, workspaces, onboarding, consent or account state. Later
 * tickets add viewer-driven branches here (onboarding phase, restricted
 * account, last workspace) once `GET /api/me` carries that state; the sign-in
 * flows do not change.
 */
export function resolveEntry(viewer: Viewer, returnTo: unknown): string {
  return sanitizeReturnTo(returnTo) ?? routeHref(webGuards.entry);
}
