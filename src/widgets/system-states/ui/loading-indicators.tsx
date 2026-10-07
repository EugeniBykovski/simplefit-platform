import { cn } from "@/shared/lib/utils";

/**
 * Indeterminate segmented progress of the launch screens: the design's
 * segments, lit in turn. The app does not know discrete bootstrap steps, so
 * no step count is shown (SF-34 decision 1). Static under reduced motion.
 */
export function LoadingSegments({ count, className }: { count: number; className?: string }) {
  return (
    <div aria-hidden className={cn("flex w-full gap-1", className)}>
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="h-1.5 flex-1 animate-system-segment rounded-full bg-input"
          // Runtime value: each segment starts its pulse a step later.
          style={{ animationDelay: `${(index * 1.4) / count}s` }}
        />
      ))}
    </div>
  );
}

/** The 3 px running bar of the loading artboards (LD2 top edge, LD4 header). */
export function LoadingBar({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("h-0.75 overflow-hidden", className)}>
      <span className="block h-0.75 w-1/5 animate-system-bar rounded-full bg-highlight" />
    </div>
  );
}

/** The olive status pill with a small spinner (LD2, LD4). */
export function LoadingPill({ children, className }: { children: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border border-accent-border bg-accent px-3.5 type-caption font-extrabold whitespace-nowrap text-accent-foreground",
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 24 24" fill="none" className="size-3.5 animate-system-spin">
        <circle cx="12" cy="12" r="9" className="stroke-accent-border" strokeWidth="3" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          className="stroke-highlight"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {children}
    </span>
  );
}
