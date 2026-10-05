"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { getQueryClient } from "@/shared/api/query-client";
import { TooltipProvider } from "@/shared/ui/tooltip";

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

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      themes={["light", "dark"]}
      enableSystem
      storageKey="simplefit-theme"
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
