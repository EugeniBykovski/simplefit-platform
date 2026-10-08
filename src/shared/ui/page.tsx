import { cva, type VariantProps } from "class-variance-authority";
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

/**
 * How a page's composition sits in its frame's `main` (SF-42). The frame
 * (`SiteFrame`) makes `main` a column that fills the space between header and
 * footer; the page picks its alignment there, never with its own margins:
 *
 * - `center`: a short single-screen composition, centred vertically in
 *   `main` (not the window) by equal auto margins. Taller than `main`, the
 *   margins collapse to 0: it flows from the top, is never clipped, and the
 *   footer follows it.
 * - `top`: a designed page composition placed at the top of `main`, as the
 *   artboards draw landing, pricing and sign-up pages.
 * - `full-bleed`: fills `main` (both ways) for compositions that draw their own
 *   full-height regions.
 *
 * Horizontally every variant spans `main`; the page's own Container gives it
 * the frame's gutters, so its content keeps the header's left edge.
 */
export const pageContentVariants = cva("w-full min-w-0", {
  variants: {
    align: {
      center: "my-auto",
      top: "",
      "full-bleed": "flex flex-1 flex-col",
    },
  },
  defaultVariants: { align: "top" },
});

export function PageContent({
  align,
  className,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof pageContentVariants>) {
  return (
    <div
      data-slot="page-content"
      data-align={align ?? "top"}
      className={cn(pageContentVariants({ align }), className)}
      {...props}
    />
  );
}
