import type { ComponentProps } from "react";

import { siteConfig } from "@/shared/config/site";
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

const tileSizes = {
  sm: { tile: "size-7.5 rounded-sm", mark: "size-5.5" },
  md: { tile: "size-8 rounded-sm", mark: "size-5.75" },
  lg: { tile: "size-9 rounded-sm", mark: "size-6.5" },
  xl: { tile: "size-18 rounded-3xl", mark: "size-13" },
} as const;

/**
 * The mark on its olive tile: sidebar and registration header 30 px, site
 * header 32 px, sign-in panel 36 px (radius `sm`); the 72 px sign-up tile
 * (radius `3xl`, O02w).
 */
export function BrandTile({
  size = "md",
  className,
}: {
  size?: keyof typeof tileSizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex flex-none items-center justify-center bg-primary text-primary-foreground",
        tileSizes[size].tile,
        className,
      )}
    >
      <BrandMark className={tileSizes[size].mark} />
    </span>
  );
}

const wordmarkSizes = {
  // The 72 px auth header (WA3, WA4, WA4b): 14 px.
  sm: "type-auth-wordmark-sm",
  // The public site header and product chrome: 15 px.
  md: "type-title",
  // The WA1 / WA1b brand panel: 16 px.
  lg: "type-auth-wordmark",
} as const;

/** "SimpleFit Boxing" with the sport in olive 500, as in every brand lockup. */
export function BrandWordmark({
  size = "md",
  className,
}: {
  size?: keyof typeof wordmarkSizes;
  className?: string;
}) {
  const [brand, ...sport] = siteConfig.name.split(" ");
  return (
    <span className={cn(wordmarkSizes[size], className)}>
      {brand}
      <span className="text-primary-muted"> {sport.join(" ")}</span>
    </span>
  );
}
