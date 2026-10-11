"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useEffect, type ReactNode } from "react";

import { onSessionBoundary } from "@/entities/session";
import { getQueryClient } from "@/shared/api/query-client";
import { TooltipProvider } from "@/shared/ui/tooltip";

/**
 * next-themes renders its theme-initialisation <script> inside this Client
 * Component. It only has to run from the server HTML, before hydration. When
 * the provider mounts on the client (navigating to another locale remounts
 * the [locale] layout), the provider applies the theme itself; a script
 * created there could never execute and React 19 reports it. On the client
 * the element is therefore rendered as an inert data block. Hydration keeps
 * the server's executable script, and next-themes marks the element
 * `suppressHydrationWarning`.
 */
const themeScriptProps = {
  type: typeof window === "undefined" ? "text/javascript" : "application/json",
};

/**
 * Client-side providers for the whole application. This is the only global
 * provider boundary; add to it only for genuinely app-wide client concerns.
 *
 * Theme: dark by default (the brand is dark-first); users may choose light or
 * follow the system. next-themes sets the `light`/`dark` class on <html>
 * before hydration, so statically rendered pages do not flash.
 */
export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  // Server state belongs to the signed-in user (SF-28): whenever the identity
  // ends or changes (sign-out, expiry, a sign-in here or in another tab), the
  // session runs this before publishing the new state, so the next user never
  // sees the previous user's cached profile, onboarding or entry, not even
  // for one render. In-flight queries are cancelled; their late answers are
  // discarded by the session (SessionChangedError).
  useEffect(
    () =>
      onSessionBoundary(() => {
        void queryClient.cancelQueries();
        queryClient.clear();
      }),
    [queryClient],
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      themes={["light", "dark"]}
      enableSystem
      storageKey="simplefit-theme"
      disableTransitionOnChange
      scriptProps={themeScriptProps}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
