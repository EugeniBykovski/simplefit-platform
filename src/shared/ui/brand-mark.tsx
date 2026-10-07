import type { ComponentProps } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * The SimpleFit "S" mark (Claude Design brand lockup), drawn in currentColor.
 * Decorative: the brand name is always written next to it or in the label of
 * the link around it.
 */
export function BrandMark({ className, ...props }: ComponentProps<"svg">) {
  return (
    <svg
      viewBox="13 13 38 38"
      fill="none"
      aria-hidden
      className={cn("size-6", className)}
      {...props}
    >
      <path
        d="M44 20H26a6 6 0 0 0 0 12h12a6 6 0 0 1 0 12H29"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="44" cy="20" r="5.5" fill="currentColor" />
      <circle cx="20" cy="44" r="4.6" stroke="currentColor" strokeWidth="2.8" />
    </svg>
  );
}

/** The mark on its olive tile (site header 32 px, sidebar 30 px; radius `sm`). */
export function BrandTile({ size = "md", className }: { size?: "sm" | "md"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex flex-none items-center justify-center rounded-sm bg-primary text-primary-foreground",
        size === "md" ? "size-8" : "size-7.5",
        className,
      )}
    >
      <BrandMark className={size === "md" ? "size-5.75" : "size-5.5"} />
    </span>
  );
}
