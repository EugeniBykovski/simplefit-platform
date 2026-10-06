"use client";

import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";

import { useSessionStatus } from "@/entities/session";
import { usePathname, useRouter } from "@/shared/i18n/navigation";
import { routeHref, webGuards, type WebRouteId } from "@/shared/routes/routes";
import { Spinner } from "@/shared/ui/spinner";

/**
 * Session part of the SF-31 access composition (route-architecture §6, §9).
 * It is a UX boundary only: the API authorizes every request, and a route
 * being reachable never makes its data reachable.
 *
 * Capability (FIGHTER, COACH, GYM_WORKSPACE, SPONSOR_WORKSPACE, ADMIN), phase
 * and restricted-account checks are not decided here: the API exposes no
 * capability, workspace or account-state data yet. Their identity tickets
 * add them on top of these gates instead of inventing that state.
 */

/** AUTHENTICATED: signed-out visitors go to the area's sign-in route with `returnTo`. */
export function RequireSession({ signIn, children }: { signIn: WebRouteId; children: ReactNode }) {
  const status = useSessionStatus();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "anonymous") return;
    const returnTo = `${pathname}${window.location.search}`;
    router.replace(routeHref(signIn, {}, { [webGuards.returnToParam]: returnTo }));
  }, [status, pathname, router, signIn]);

  return status === "authenticated" ? children : <SessionPending />;
}

/** GUEST_ONLY: signed-in users go to the web entry route (`/app`), which resolves their destination. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const status = useSessionStatus();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace(routeHref(webGuards.entry));
  }, [status, router]);

  return status === "authenticated" ? <SessionPending /> : children;
}

function SessionPending() {
  const t = useTranslations("auth.session");
  return (
    <div className="flex min-h-dvh flex-1 items-center justify-center p-6">
      <Spinner label={t("checking")} className="size-6 text-muted-foreground" />
    </div>
  );
}
