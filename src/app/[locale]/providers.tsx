"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { getQueryClient } from "@/shared/api/query-client";
import { TooltipProvider } from "@/shared/ui/tooltip";

/**
 * Client-side providers for the whole application. This is the only global
 * provider boundary; add to it only for genuinely app-wide client concerns.
 */
export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  );
}
