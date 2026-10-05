import * as React from "react";
import { cn } from "@/shared/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2.5 type-body-sm text-foreground transition-colors outline-none placeholder:text-faint-foreground hover:border-input focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/25 max-md:text-[1rem]",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
