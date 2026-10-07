import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * The canonical horizontal frame of every web surface (SF-34), from the
 * Claude Design 1440 px frames:
 *
 * - `site`: public website, auth and system pages. 64 px gutters at desktop
 *   (1312 px of content in the 1440 frame), centred beyond 1440 px.
 * - `app`: the fluid content column of the signed-in shells. 32 px gutters at
 *   desktop beside the sidebar, never capped.
 *
 * Gutters step down below the designed frame (the design draws only 1440):
 * 16 px phones, 24 px from `sm`, 32 px from `md`. Screens never add their own
 * horizontal page margins; they sit inside a Container.
 */
export const containerVariants = cva("w-full", {
  variants: {
    size: {
      site: "mx-auto max-w-[1440px] px-4 sm:px-6 md:px-8 lg:px-16",
      app: "px-4 sm:px-6 md:px-8",
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
