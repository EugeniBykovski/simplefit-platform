import * as React from "react";
import { cn } from "@/shared/lib/utils";

/*
 * Canonical web field: 40 px, radius md, body-sm on the `surface` well with a
 * hairline border; focus shows the olive border plus the focus ring. Below md
 * the text is 16 px so iOS Safari does not zoom the page on focus (platform
 * exception to the type scale).
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-border bg-surface px-3 py-2 type-body-sm text-foreground transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:type-caption file:font-bold file:text-foreground placeholder:text-faint-foreground hover:border-input focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/25 max-md:text-[1rem]",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
