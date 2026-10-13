import { cn } from "@/shared/lib/utils";

/** A selectable pill (coaching languages, competition levels) around a native checkbox. */
export const pillClass = (checked: boolean) =>
  cn(
    "flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3.5 type-body-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
    checked
      ? "border-[1.5px] border-primary-muted bg-accent font-extrabold text-accent-foreground"
      : "border-input font-bold text-muted-foreground",
  );
