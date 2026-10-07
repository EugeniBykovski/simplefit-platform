import * as React from "react";
import { cn } from "@/shared/lib/utils";

const fieldSizes = {
  // docs/design-tokens.json controls.field.web
  md: "h-10 px-3 type-body-sm",
  // controls.field.webLarge: the 44 px email field of the auth screens (SF-24)
  lg: "h-11 px-3.5 type-body font-semibold",
} as const;

/*
 * Canonical web field: 40 px (`lg`: 44 px), radius md, on the `surface` well
 * with a hairline border; focus shows the olive border plus the focus ring.
 * Below md the text is 16 px so iOS Safari does not zoom the page on focus
 * (platform exception to the type scale).
 */
function Input({
  className,
  type,
  fieldSize = "md",
  ...props
}: React.ComponentProps<"input"> & { fieldSize?: keyof typeof fieldSizes }) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={fieldSize}
      className={cn(
        "w-full min-w-0 rounded-md border border-border bg-surface py-2 text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:type-caption file:font-bold file:text-foreground placeholder:text-faint-foreground hover:border-input focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/25 max-md:text-[1rem]",
        fieldSizes[fieldSize],
        className,
      )}
      {...props}
    />
  );
}

export { Input };
