import { locales } from "@/shared/i18n/routing";

import { matchWebRoute, webGuards, type WebRouteId } from "./routes";

/**
 * The `returnTo` policy (SF-24; route-architecture §9). After authentication
 * the user may continue to the page that sent them to sign-in, but only to a
 * page of this web app that sign-in can actually lead to. Anything else is
 * dropped silently and the neutral application entry is used instead.
 *
 * Accepted: a same-origin relative path (`/…`, decoded exactly once by the
 * URL parser that read the query) of at most 2048 characters that resolves
 * to a canonical registry route which is neither guest-only (sign-in and
 * sign-up steps: no login loop), nor an onboarding or restricted-account
 * route (those are reached from viewer state only), nor the not-found
 * catch-all, nor the verification-link page. Only pathname and search are
 * kept; the hash is discarded. A leading locale segment is removed: the
 * localized router adds the current one.
 */
const MAX_LENGTH = 2048;
const SENTINEL_ORIGIN = "https://return-to.invalid";

const NEVER: ReadonlySet<WebRouteId> = new Set<WebRouteId>([
  "web.verify-email",
  webGuards.notFound,
  webGuards.restrictedAccount.suspended,
  webGuards.restrictedAccount.pendingDeletion,
]);

const localeSegments: ReadonlySet<string> = new Set(locales.map((locale) => locale.toLowerCase()));

// Backslashes (browsers treat `/\host` as `//host`), whitespace and control characters.
const UNSAFE = /[\\\s\u0000-\u001f\u007f]/;

export function sanitizeReturnTo(value: unknown): string | undefined {
  if (typeof value !== "string" || value === "" || value.length > MAX_LENGTH) return undefined;
  if (!value.startsWith("/") || value.startsWith("//") || UNSAFE.test(value)) return undefined;

  let url: URL;
  try {
    url = new URL(value, SENTINEL_ORIGIN);
  } catch {
    return undefined;
  }
  if (url.origin !== SENTINEL_ORIGIN) return undefined;

  const segments = url.pathname.split("/");
  if (segments[1] !== undefined && localeSegments.has(segments[1].toLowerCase())) {
    segments.splice(1, 1);
  }
  const pathname = segments.join("/") || "/";
  if (pathname.startsWith("//")) return undefined;

  const route = matchWebRoute(pathname);
  if (route === undefined || NEVER.has(route.id)) return undefined;
  if (route.session === "GUEST_ONLY" || route.phase === "ONBOARDING") return undefined;

  return `${pathname}${url.search}`;
}
