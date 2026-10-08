import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/shared/lib/utils";

import { Spinner } from "./spinner";

/**
 * Variants follow the canonical design (docs/design-tokens.json):
 * - `primary` (olive): the one main action per view;
 * - `secondary` (bone): the strong neutral action ("Finish round");
 * - `quiet` (graphite): the everyday secondary action;
 * - `outline` (olive border): a quiet olive action ("Review AI draft");
 * - `ghost`: low-emphasis text and toolbar actions;
 * - `destructive` (coral) and `destructive-subtle` (tinted coral) for
 *   irreversible actions;
 * - `link`: inline text action.
 * Sizes are the canonical web control heights: sm 32, md 40, lg 48, xl 54
 * (hero and checkout CTAs). Labels are Manrope 800.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 border border-transparent font-sans font-extrabold whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/90 active:bg-secondary/80",
        quiet:
          "border-input bg-surface-elevated text-foreground hover:bg-input aria-expanded:bg-input",
        outline:
          "border-primary-muted bg-transparent text-highlight hover:bg-accent hover:text-accent-foreground",
        ghost:
          "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 active:bg-destructive/80",
        // Amber action of warning-tone system states (Claude Design "System states" sheet, SF-34).
        warning: "bg-warning text-warning-foreground hover:bg-warning/90 active:bg-warning/80",
        "destructive-subtle":
          "border-destructive-border bg-destructive-subtle text-destructive-subtle-foreground hover:bg-destructive-subtle/80",
        link: "h-auto border-0 px-0 text-highlight underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 rounded-md px-3 type-body-sm font-extrabold",
        md: "h-10 rounded-md px-4 type-body-sm font-extrabold",
        lg: "h-12 rounded-md px-4.5 type-body-sm font-extrabold",
        xl: "h-13.5 rounded-xl px-4.5 type-body-lg font-extrabold",
        // The 44 px action of the system-state cards (SF-34).
        system: "h-11 rounded-md px-4 type-body-sm font-extrabold",
        // The 42 px header action of the public site shell (SF-42): 14 px, 18 px sides.
        site: "h-10.5 rounded-md-lg border-0 px-4.5 type-body font-extrabold",
        icon: "size-10 rounded-md",
        "icon-sm": "size-8 rounded-md",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a Link) with button styling. */
    asChild?: boolean;
    /** Shows a spinner, disables the button and sets `aria-busy`. */
    loading?: boolean;
  };

function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, className }));

  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        data-variant={variant}
        data-size={size}
        className={classes}
        {...props}
      >
        {children}
      </Slot.Root>
    );
  }

  return (
    <button
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export { Button, buttonVariants, type ButtonProps };
