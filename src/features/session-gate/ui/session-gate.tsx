"use client";

import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";

import { useSession } from "@/entities/session";
import { usePathname, useRouter } from "@/shared/i18n/navigation";
import { continuationOf, continuationQuery, journeyIntentOf } from "@/shared/routes/continuation";
import { sanitizeReturnTo } from "@/shared/routes/return-to";
import { matchWebRoute, routeHref, type WebRouteId } from "@/shared/routes/routes";
import { Spinner } from "@/shared/ui/spinner";

import { EntryRedirect } from "./entry-redirect";

/**
 * Session part of the SF-31 access composition (route-architecture §6, §9).
 * It is a UX boundary only: the API authorizes every request, and a route
 * being reachable never makes its data reachable.
 *
 * Capability (FIGHTER, COACH, GYM_WORKSPACE, SPONSOR_WORKSPACE, ADMIN), phase
 * and restricted-account checks are not decided here: the API exposes no
 * capability, workspace or account-state data yet. Their identity tickets
 * add them on top of these gates instead of inventing that state.
 *
 * While the session cannot be confirmed because of a network or server
 * failure (`unavailable`), neither gate redirects: they render the layout's
 * `unavailable` view, which retries the restore. A transient failure is
 * never treated as a sign-out.
 */

/**
 * AUTHENTICATED: signed-out visitors go to the area's sign-in route with
 * `returnTo` when the current page is a valid destination (SF-24 policy) and
 * the journey `intent` the page carries or represents (SF-45), so an
 * onboarding deep link resumes its journey through the entry resolver.
 * While the session is restored the layout's `pending` state renders (the
 * signed-in layouts pass the LD3 launch screen, SF-34); it is shown only
 * while that real work runs.
 */
export function RequireSession({
  signIn,
  pending,
  unavailable,
  children,
}: {
  signIn: WebRouteId;
  pending?: ReactNode;
  unavailable?: ReactNode;
  children: ReactNode;
}) {
  const { status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "anonymous") return;
    // `returnTo` only when the page is a valid destination (never an onboarding
    // route); the journey intent independently: the URL's own validated `intent`,
    // or the journey the route itself represents. The resolver decides after sign-in.
    const returnTo = sanitizeReturnTo(`${pathname}${window.location.search}`);
    const intent =
      continuationOf(window.location.search).intent ?? journeyIntentOf(matchWebRoute(pathname)?.id);
    router.replace(routeHref(signIn, {}, continuationQuery({ returnTo, intent })));
  }, [status, pathname, router, signIn]);

  if (status === "authenticated") return children;
  if (status === "unavailable" && unavailable !== undefined) return unavailable;
  return pending ?? <SessionPending />;
}

/**
 * GUEST_ONLY: an authenticated viewer (a restored session, or a sign-in that
 * just completed in this or another tab) enters the application through the
 * backend entry resolution (`EntryRedirect`, SF-45) with the page's
 * continuation (`returnTo`, `intent`). This is the one place authentication
 * navigates, for every method (email code, Google, Apple); the sign-in
 * methods only complete the session. `entryFailure` renders when the entry
 * cannot be resolved (it reads `useEntryFailure`).
 */
export function GuestOnly({
  unavailable,
  entryFailure,
  children,
}: {
  unavailable?: ReactNode;
  entryFailure: ReactNode;
  children: ReactNode;
}) {
  const { status } = useSession();

  if (status === "authenticated") {
    return <EntryRedirect pending={<SessionPending />} failure={entryFailure} />;
  }
  if (status === "unavailable" && unavailable !== undefined) return unavailable;
  return children;
}

function SessionPending() {
  const t = useTranslations("auth.session");
  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center p-6">
      <Spinner label={t("checking")} className="size-6 text-muted-foreground" />
    </div>
  );
}
