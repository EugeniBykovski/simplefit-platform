import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * The canonical horizontal frame of every web surface (SF-34), from the
 * Claude Design 1440 px frames. Every variant is viewport-fluid: the frame is
 * the full viewport width at every size, never a centred 1440 px canvas
 * (docs/design-system.md, "Responsive composition"). The artboard's widths
 * apply to content inside the frame, not to the frame.
 *
 * - `site`: public website, auth and system pages. 64 px gutters at desktop,
 *   as at 1440 (1312 px of content there, more on wider viewports).
 * - `app`: the fluid content column of the signed-in shells. 32 px gutters at
 *   desktop beside the sidebar, never capped.
 * - `frame`: the full-width frame without gutters, for compositions that draw
 *   their own columns and edge padding (the auth step header).
 *
 * Gutters step down below the designed frame (the design draws only 1440):
 * 16 px phones, 24 px from `sm`, 32 px from `md`. Screens never add their own
 * horizontal page margins; they sit inside a Container.
 */
export const containerVariants = cva("w-full", {
  variants: {
    size: {
      site: "px-4 sm:px-6 md:px-8 lg:px-16",
      app: "px-4 sm:px-6 md:px-8",
      frame: "",
    },
  },
  defaultVariants: { size: "site" },
});

export function Container({
  size,
  asChild = false,
  className,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof containerVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp data-slot="container" className={cn(containerVariants({ size }), className)} {...props} />
  );
}
