"use client";

import { useEffect } from "react";

import { usePathname, useRouter } from "@/shared/i18n/navigation";
import { routeHref, signInRouteFor, webGuards } from "@/shared/routes/routes";
import { Container } from "@/shared/ui/container";

import { failureFor } from "../model/error-state";
import { ErrorState } from "./error-state";

/** The sign-in route of the area a path belongs to (`/admin/*`, `/sponsor/*`, the rest). */
function areaOf(pathname: string) {
  if (pathname.startsWith("/admin")) return "web.admin" as const;
  if (pathname.startsWith("/sponsor")) return "web.sponsor" as const;
  return "web" as const;
}

/**
 * The body of the error boundaries: resolves the failure state of `error`
 * and renders it centred on the site Container. A 401 is not a screen: the
 * session has ended, so it goes to the area's sign-in route with `returnTo`,
 * as RequireSession does (route-architecture §9).
 */
export function FailureView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const failure = failureFor(error);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (failure !== "unauthorized") return;
    router.replace(
      routeHref(signInRouteFor(areaOf(pathname)), {}, { [webGuards.returnToParam]: pathname }),
    );
  }, [failure, pathname, router]);

  if (failure === "unauthorized") return null;

  return (
    <Container className="flex flex-1 items-center justify-center py-14">
      <ErrorState kind={failure} onRetry={onRetry} />
    </Container>
  );
}
