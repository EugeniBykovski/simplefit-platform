import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/shared/lib/utils";

/*
 * `pulse` (default) is the SF-13 skeleton. `shimmer` is the sweep of the
 * Claude Design loading artboards (LD2, LD4, SF-34); `accent` is its olive
 * variant for content that sits on accent surfaces. Both stop under
 * prefers-reduced-motion and keep their shape.
 */
const skeletonVariants = cva("rounded-md", {
  variants: {
    tone: {
      neutral: "",
      accent: "",
    },
    motion: {
      pulse: "animate-pulse motion-reduce:animate-none",
      shimmer: "",
    },
  },
  compoundVariants: [
    { tone: "neutral", motion: "pulse", className: "bg-muted" },
    { tone: "accent", motion: "pulse", className: "bg-accent-strong" },
    { tone: "neutral", motion: "shimmer", className: "skeleton-shimmer" },
    { tone: "accent", motion: "shimmer", className: "skeleton-shimmer-accent" },
  ],
  defaultVariants: { tone: "neutral", motion: "pulse" },
});

function Skeleton({
  className,
  tone,
  motion,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof skeletonVariants>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(skeletonVariants({ tone, motion }), className)}
      {...props}
    />
  );
}

export { Skeleton };
