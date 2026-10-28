import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { Spinner } from "./spinner";

/**
 * One row of a chooser (Claude Design WCX1 WebContextSelect, SF-54; the gym
 * chooser, SF-88): a 44 px avatar tile, a title and a line, and the action on
 * the right. While a row opens, it says so and the others are dimmed and
 * disabled: one choice at a time.
 */
export function ChoiceRow({
  avatar,
  title,
  line,
  action,
  opening,
  openingLabel,
  pending,
  onClick,
}: {
  avatar: ReactNode;
  title: string;
  line: string;
  action: string;
  /** This row's choice is under way. */
  opening: boolean;
  openingLabel: string;
  /** Some choice is under way (this row's or another's). */
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={opening}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-2xl border bg-surface px-4.5 py-4 text-left transition-colors",
        "hover:border-border-strong focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:cursor-default",
        pending && !opening && "opacity-50",
      )}
    >
      {avatar}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="type-body-lg font-extrabold break-words">{title}</span>
        <span className="type-body-sm text-muted-foreground">{line}</span>
      </span>
      <span className="flex flex-none items-center gap-2 type-body-sm font-extrabold text-highlight">
        {opening ? <Spinner /> : null}
        {opening ? openingLabel : action}
      </span>
    </button>
  );
}

/** The 44 px avatar tile of a chooser row. */
export function ChoiceAvatar({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "fighter" | "coach" | "journey" | "gym";
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-11 flex-none items-center justify-center rounded-md type-caption font-display font-bold",
        tone === "journey" || tone === "gym"
          ? "bg-accent text-highlight"
          : tone === "coach"
            ? "bg-warning text-warning-foreground"
            : "bg-highlight text-highlight-foreground",
      )}
    >
      {children}
    </span>
  );
}
