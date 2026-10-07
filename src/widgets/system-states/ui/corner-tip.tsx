import { TimerIcon } from "lucide-react";

/** The Corner Tip card of the launch screens (LD1/LD3): a boxing tip, never data. */
export function CornerTip({ label, tip }: { label: string; tip: string }) {
  return (
    <div className="flex w-full items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3.5">
      <span className="flex size-8.5 flex-none items-center justify-center rounded-md bg-accent text-highlight">
        <TimerIcon aria-hidden className="size-4.25" />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="type-label text-faint-foreground">{label}</span>
        <span className="type-body-sm text-foreground/80">{tip}</span>
      </span>
    </div>
  );
}
