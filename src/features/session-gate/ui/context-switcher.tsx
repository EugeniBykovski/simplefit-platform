"use client";

import { CheckIcon, ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useCoachProfile } from "@/entities/coach-profile";
import { useFighterProfile } from "@/entities/fighter-profile";
import { cn } from "@/shared/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Spinner } from "@/shared/ui/spinner";

import { contextOptions, type Journey, type ProfileContext } from "../model/contexts";
import type { KnownEntry } from "../model/entry";
import { useContextSwitch } from "./context-switch";
import { useWorkspaceEntry } from "./workspace-gate";

/** Initials of a display name ("Alex Novak" → "AN"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = Array.from(parts[0] ?? "")[0] ?? "";
  const last = parts.length > 1 ? (Array.from(parts.at(-1) ?? "")[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * The context switcher of the Fighter and Coach sidebars (Claude Design
 * ContextSwitcher, SF-54): the identity block of the current context, which
 * opens the account's profile contexts. Every option comes from the entry
 * the workspace gate resolved: completed contexts (their capability) are
 * opened by recording the choice with the backend; unfinished journeys are
 * entered with their intent only. Choosing the current context does nothing.
 * A failure keeps the user here, in this context, with a retry.
 */
export function ContextSwitcher({ context }: { context: ProfileContext }) {
  const entry = useWorkspaceEntry();
  if (entry === undefined) return null;
  return <Switcher context={context} entry={entry} />;
}

function Switcher({ context, entry }: { context: ProfileContext; entry: KnownEntry }) {
  const t = useTranslations("contextSwitcher");
  const [open, setOpen] = useState(false);
  const { state, open: openContext, continueJourney } = useContextSwitch();
  const { completed, journeys } = contextOptions(entry);
  const names = useProfileNames(completed);
  const pending = state.status === "pending";
  const name = names[context] ?? t(`contexts.${context}`);

  return (
    <DropdownMenu
      // A menu, not a dialog: the page behind it stays in the accessibility tree.
      modal={false}
      open={open}
      onOpenChange={(next) => !pending && setOpen(next)}
    >
      <DropdownMenuTrigger
        aria-label={t("trigger", { name, context: t(`contexts.${context}`) })}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border bg-muted p-2.5 text-left",
          "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          open ? "border-primary-muted" : "border-border",
        )}
      >
        <Initials name={name} context={context} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate type-body-sm font-extrabold">{name}</span>
          <span className="type-label text-highlight">{t(`labels.${context}`)}</span>
        </span>
        <ChevronsUpDownIcon aria-hidden className="size-4 text-faint-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-53 rounded-2xl p-1.5">
        <DropdownMenuLabel className="px-2 pt-2 pb-1 type-label text-faint-foreground">
          {t("heading")}
        </DropdownMenuLabel>
        {completed.map((option) => {
          const current = option === context;
          const opening = pending && state.context === option;
          return (
            <DropdownMenuItem
              key={option}
              role="menuitemradio"
              aria-checked={current}
              disabled={pending && !opening}
              onSelect={(event) => {
                event.preventDefault();
                if (current) setOpen(false);
                else void openContext(option);
              }}
              className={cn("min-h-12 gap-2.5 rounded-lg px-2 py-1.5", current && "bg-accent")}
            >
              <Initials name={names[option] ?? t(`contexts.${option}`)} context={option} small />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="type-body-sm font-extrabold">{t(`contexts.${option}`)}</span>
                <span className="truncate type-caption text-muted-foreground">
                  {t(`homes.${option}`)}
                </span>
              </span>
              {current ? (
                <CheckIcon aria-hidden className="size-4 text-highlight" />
              ) : opening ? (
                <Spinner label={t("opening")} className="size-4" />
              ) : null}
            </DropdownMenuItem>
          );
        })}
        {journeys.length > 0 && <DropdownMenuSeparator className="mx-1.5 my-1" />}
        {journeys.map((journey) => (
          <JourneyItem
            key={journey.context}
            journey={journey}
            pending={pending}
            opening={pending && state.context === journey.context}
            onSelect={() => void continueJourney(journey.context)}
          />
        ))}
        {state.status === "failed" && (
          <div
            role="alert"
            className="mx-0.5 mt-1 flex flex-col gap-0.5 rounded-lg border border-warning-border bg-warning-subtle px-3 py-2.5 type-caption text-warning-subtle-foreground"
          >
            <span className="font-extrabold">{t("failed.title")}</span>
            <span>{t("failed.body")}</span>
          </div>
        )}
        <p className="px-2 pt-2 pb-1.5 type-caption text-faint-foreground">{t("footnote")}</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function JourneyItem({
  journey,
  pending,
  opening,
  onSelect,
}: {
  journey: Journey;
  pending: boolean;
  opening: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("contextSwitcher");
  const kind = journey.started ? "continue" : "start";
  return (
    <DropdownMenuItem
      disabled={pending && !opening}
      onSelect={(event) => {
        event.preventDefault();
        onSelect();
      }}
      className="min-h-11 gap-2.5 rounded-lg px-2 py-1.5"
    >
      <span
        aria-hidden
        className="flex size-7 flex-none items-center justify-center rounded-full border-[1.5px] border-dashed border-primary-muted text-highlight"
      >
        <PlusIcon className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="type-body-sm font-extrabold">{t(`${kind}.${journey.context}`)}</span>
        <span className="type-caption text-muted-foreground">
          {t(`${kind}Lines.${journey.context}`)}
        </span>
      </span>
      {opening ? <Spinner label={t("opening")} className="size-4" /> : null}
    </DropdownMenuItem>
  );
}

function Initials({
  name,
  context,
  small = false,
}: {
  name: string;
  context: ProfileContext;
  small?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex flex-none items-center justify-center rounded-full type-micro font-bold",
        small ? "size-7" : "size-8",
        context === "coach"
          ? "bg-warning text-warning-foreground"
          : "bg-highlight text-highlight-foreground",
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** The saved display names of the completed contexts (each profile owns its own name). */
function useProfileNames(completed: readonly ProfileContext[]) {
  const fighter = useFighterProfile({ enabled: completed.includes("fighter") });
  const coach = useCoachProfile({ enabled: completed.includes("coach") });
  return {
    fighter: fighter.data?.display_name ?? undefined,
    coach: coach.data?.display_name ?? undefined,
  } satisfies Record<ProfileContext, string | undefined>;
}
