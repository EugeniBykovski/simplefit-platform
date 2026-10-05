import { LoaderCircleIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/shared/lib/utils";

/**
 * Indeterminate loading indicator.
 *
 * With `label` it is announced (`role="status"`); without one it is
 * decorative, for use inside a control that already reports `aria-busy`.
 * Prefer Skeleton for content that takes longer than ~300 ms to load.
 */
function Spinner({
  label,
  className,
  ...props
}: ComponentProps<"svg"> & { label?: string | undefined }) {
  return (
    <LoaderCircleIcon
      data-slot="spinner"
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("size-4 animate-spin motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Spinner };
