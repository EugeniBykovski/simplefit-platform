import type { LucideProps } from "lucide-react";

import { cn } from "@/shared/lib/utils";

/**
 * The boxing glove (SF-43): a SimpleFit-specific glyph, because no Lucide
 * icon carries the meaning (docs/design-handoff.md §8.2). Drawn on Lucide's
 * 24-grid with its stroke conventions (2 px, round caps and joins,
 * `currentColor`), so it sits beside Lucide icons and takes the same props.
 * Decorative by default, like every interface icon.
 */
export function GloveIcon({
  size = 24,
  strokeWidth = 2,
  className,
  ...props
}: Omit<LucideProps, "ref">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("lucide", className)}
      {...props}
    >
      <path d="M7 11V7a3 3 0 0 1 3-3h4a4 4 0 0 1 4 4v5a6 6 0 0 1-6 6H9a3 3 0 0 1-3-3v-3a2 2 0 0 1 2-2h4" />
    </svg>
  );
}
