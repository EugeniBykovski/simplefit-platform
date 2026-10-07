import type { ComponentProps } from "react";

import { cn } from "@/shared/lib/utils";

import { containerVariants } from "./container";

type Inset = {
  /**
   * The Container the page sits in: `app` (default) beside a shell sidebar,
   * `site` in the frames without one (public site, auth, header-only app
   * frame), so the page lines up with that frame's header.
   */
  inset?: "app" | "site";
};

/**
 * The page header region (SF-34, Claude Design W01 / LD4): 76 px tall at
 * desktop with a hairline below. It holds the page title and page-level
 * actions; the shell around it owns navigation.
 */
export function PageHeader({
  inset = "app",
  className,
  children,
  ...props
}: ComponentProps<"header"> & Inset) {
  return (
    <header data-slot="page-header" className={cn("relative border-b", className)} {...props}>
      <div
        className={cn(
          containerVariants({ size: inset }),
          "flex min-h-16 flex-wrap items-center gap-3 py-3 md:h-19 md:flex-nowrap md:py-0",
        )}
      >
        {children}
      </div>
    </header>
  );
}

/** The page content below a PageHeader: 24 px top and bottom, Container gutters. */
export function PageBody({ inset = "app", className, ...props }: ComponentProps<"div"> & Inset) {
  return (
    <div
      data-slot="page-body"
      className={cn(containerVariants({ size: inset }), "py-6", className)}
      {...props}
    />
  );
}
