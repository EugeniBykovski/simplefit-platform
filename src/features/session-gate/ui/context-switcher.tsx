"use client";

import {
  Building2Icon,
  CalendarCheckIcon,
  CheckIcon,
  ChevronsUpDownIcon,
  PlusIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { useCoachProfile } from "@/entities/coach-profile";
import { useFighterProfile } from "@/entities/fighter-profile";
import type { GymRole } from "@/entities/gym";
import { currentMemberships, useMyGymMemberships } from "@/entities/gym-booking";
import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
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
import { gymWorkspaceOptions, type GymWorkspace } from "../model/gyms";
import { sponsorWorkspaceOptions, type SponsorWorkspace } from "../model/sponsors";
import { gymTarget, sponsorTarget, useContextSwitch, type SwitchTarget } from "./context-switch";
import { useWorkspaceEntry } from "./workspace-gate";

/** Initials of a display name ("Alex Novak" → "AN"). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = Array.from(parts[0] ?? "")[0] ?? "";
  const last = parts.length > 1 ? (Array.from(parts.at(-1) ?? "")[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/**
 * The gym a gym console shows, as its identity block names it: the gym's
 * name, the viewer's role there and its location count, all from the
 * backend's answer for that gym (never from the URL).
 */
export type GymIdentity = { id: string; name: string; role: GymRole; locations: number };

/**
 * The organization a partner portal shows (SF-117), as its identity block names
 * it: the backend's answer for that organization (never the URL).
 */
export type SponsorIdentity = {
  id: string;
  name: string;
  role: SponsorWorkspace["role"];
  status: "active" | "suspended";
};

/** Where the switcher sits: a profile workspace, the console of one gym, or one partner portal. */
export type SwitcherCurrent =
  | { kind: "profile"; context: ProfileContext }
  | { kind: "gym"; gym: GymIdentity }
  | { kind: "sponsor"; sponsor: SponsorIdentity };

/**
 * The context switcher of the Fighter, Coach and Gym sidebars (Claude Design
 * ContextSwitcher, SF-54; GymWebNav's identity block, SF-88): the identity
 * block of the current context, which opens the account's other contexts.
 * Every option comes from the entry the workspace gate resolved:
 *
 * - gym workspaces the backend lets the user enter (completed gyms, any
 *   staff role) open that gym's console; the user's own draft continues its
 *   setup; more gyms than the entry lists are reached through the chooser;
 * - sponsor organizations (SF-117; SPE1's organization switcher): active
 *   memberships of active organizations, each opening its own portal. Only
 *   real memberships are listed, and switching is navigation: each portal
 *   page checks access for the organization in its address;
 * - completed profile contexts are opened by recording the choice with the
 *   backend; unfinished journeys are entered with their intent only.
 *
 * Choosing the current context or gym does nothing. A failure keeps the user
 * here, in this context, with a retry.
 */
export function ContextSwitcher(
  props: { context: ProfileContext } | { gym: GymIdentity } | { sponsor: SponsorIdentity },
) {
  const entry = useWorkspaceEntry();
  if (entry === undefined) return null;
  const current: SwitcherCurrent =
    "gym" in props
      ? { kind: "gym", gym: props.gym }
      : "sponsor" in props
        ? { kind: "sponsor", sponsor: props.sponsor }
        : { kind: "profile", context: props.context };
  return <Switcher current={current} entry={entry} />;
}

function Switcher({ current, entry }: { current: SwitcherCurrent; entry: KnownEntry }) {
  const t = useTranslations("contextSwitcher");
  const g = useTranslations("gymConsole.switcher");
  const sp = useTranslations("sponsorPortal");
  const [open, setOpen] = useState(false);
  const switching = useContextSwitch();
  const { state } = switching;
  const { completed, journeys } = contextOptions(entry);
  const gyms = gymWorkspaceOptions(entry);
  const sponsors = sponsorWorkspaceOptions(entry);
  const names = useProfileNames(completed);
  // The account's gym memberships (SF-95), read with the page (never as the
  // menu opens, so opening it makes no request): a member's classes and
  // bookings are account-level (D-G07), never a workspace, so they are a link
  // of their own.
  const memberships = useMyGymMemberships();
  const membershipCount = currentMemberships(memberships.memberships).length;
  const pending = state.status === "pending";
  const opening = (target: SwitchTarget) => pending && state.target === target;

  const trigger =
    current.kind === "gym"
      ? {
          label: g("trigger", { name: current.gym.name, role: g(`roles.${current.gym.role}`) }),
          tile: <GymTile name={current.gym.name} />,
          title: current.gym.name,
          line: g("identity", {
            role: g(`roles.${current.gym.role}`),
            count: current.gym.locations,
          }),
        }
      : current.kind === "sponsor"
        ? {
            label: sp("switcher.trigger", {
              name: current.sponsor.name,
              role: sp(`roles.${current.sponsor.role}`),
            }),
            tile: <SponsorTile />,
            title: current.sponsor.name,
            line: sp("switcher.identity", { status: sp(`statuses.${current.sponsor.status}`) }),
          }
        : (() => {
            const name = names[current.context] ?? t(`contexts.${current.context}`);
            return {
              label: t("trigger", { name, context: t(`contexts.${current.context}`) }),
              tile: <Initials name={name} context={current.context} />,
              title: name,
              line: t(`labels.${current.context}`),
            };
          })();

  const currentGym = current.kind === "gym" ? current.gym.id : undefined;
  const currentSponsor = current.kind === "sponsor" ? current.sponsor.id : undefined;
  const currentProfile = current.kind === "profile" ? current.context : undefined;
  const hasGyms = gyms.enter.length > 0 || gyms.setup.length > 0;

  return (
    <DropdownMenu
      // A menu, not a dialog: the page behind it stays in the accessibility tree.
      modal={false}
      open={open}
      onOpenChange={(next) => !pending && setOpen(next)}
    >
      <DropdownMenuTrigger
        aria-label={trigger.label}
        data-workspace-switcher
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border bg-muted p-2.5 text-left",
          "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          open ? "border-primary-muted" : "border-border",
        )}
      >
        {trigger.tile}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate type-body-sm font-extrabold">{trigger.title}</span>
          <span className="truncate type-label text-highlight">{trigger.line}</span>
        </span>
        <ChevronsUpDownIcon aria-hidden className="size-4 flex-none text-faint-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="max-h-[min(32rem,var(--radix-dropdown-menu-content-available-height))] w-53 overflow-y-auto rounded-2xl p-1.5"
      >
        {hasGyms && (
          <>
            <DropdownMenuLabel className="px-2 pt-2 pb-1 type-label text-faint-foreground">
              {g("heading")}
            </DropdownMenuLabel>
            {gyms.enter.map((gym) => (
              <GymItem
                key={gym.gym_id}
                gym={gym}
                current={gym.gym_id === currentGym}
                pending={pending}
                opening={opening(gymTarget(gym.gym_id))}
                onSelect={() =>
                  gym.gym_id === currentGym ? setOpen(false) : void switching.openGym(gym.gym_id)
                }
              />
            ))}
            {gyms.setup.map((gym) => (
              <MenuRow
                key={gym.gym_id}
                pending={pending}
                opening={opening("gym-setup")}
                onSelect={() => void switching.continueGymSetup()}
                icon={<PlusTile />}
                title={g("continueSetup")}
                line={gym.name}
              />
            ))}
            {gyms.more && (
              <DropdownMenuItem asChild className="min-h-10 rounded-lg px-2 py-1.5">
                <Link href={routeHref("web.app.gyms")} className="type-body-sm font-extrabold">
                  {g("allGyms", { count: entry.gym_workspace_count })}
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="mx-1.5 my-1" />
          </>
        )}
        {sponsors.enter.length > 0 && (
          <>
            <DropdownMenuLabel className="px-2 pt-2 pb-1 type-label text-faint-foreground">
              {sp("switcher.heading")}
            </DropdownMenuLabel>
            {sponsors.enter.map((sponsor) => (
              <SponsorItem
                key={sponsor.sponsor_id}
                sponsor={sponsor}
                current={sponsor.sponsor_id === currentSponsor}
                pending={pending}
                opening={opening(sponsorTarget(sponsor.sponsor_id))}
                onSelect={() =>
                  sponsor.sponsor_id === currentSponsor
                    ? setOpen(false)
                    : void switching.openSponsor(sponsor.sponsor_id)
                }
              />
            ))}
            <DropdownMenuSeparator className="mx-1.5 my-1" />
          </>
        )}
        <DropdownMenuLabel className="px-2 pt-2 pb-1 type-label text-faint-foreground">
          {t("heading")}
        </DropdownMenuLabel>
        {completed.map((option) => {
          const isCurrent = option === currentProfile;
          return (
            <DropdownMenuItem
              key={option}
              role="menuitemradio"
              aria-checked={isCurrent}
              disabled={pending && !opening(option)}
              onSelect={(event) => {
                event.preventDefault();
                if (isCurrent) setOpen(false);
                else void switching.open(option);
              }}
              className={cn("min-h-12 gap-2.5 rounded-lg px-2 py-1.5", isCurrent && "bg-accent")}
            >
              <Initials name={names[option] ?? t(`contexts.${option}`)} context={option} small />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="type-body-sm font-extrabold">{t(`contexts.${option}`)}</span>
                <span className="truncate type-caption text-muted-foreground">
                  {t(`homes.${option}`)}
                </span>
              </span>
              <State current={isCurrent} opening={opening(option)} />
            </DropdownMenuItem>
          );
        })}
        {journeys.length > 0 && <DropdownMenuSeparator className="mx-1.5 my-1" />}
        {journeys.map((journey) => (
          <JourneyItem
            key={journey.context}
            journey={journey}
            pending={pending}
            opening={opening(journey.context)}
            onSelect={() => void switching.continueJourney(journey.context)}
          />
        ))}
        {memberships.complete && (
          <>
            <DropdownMenuSeparator className="mx-1.5 my-1" />
            <DropdownMenuLabel className="px-2 pt-2 pb-1 type-label text-faint-foreground">
              {t("memberships.heading")}
            </DropdownMenuLabel>
            <DropdownMenuItem asChild className="min-h-11 gap-2.5 rounded-lg px-2 py-1.5">
              <Link href={routeHref("web.app.me.gyms")} data-member-gyms-link>
                <span
                  aria-hidden
                  className="flex size-8 flex-none items-center justify-center rounded-md bg-accent text-highlight"
                >
                  <CalendarCheckIcon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="type-body-sm font-extrabold">{t("memberships.title")}</span>
                  <span className="truncate type-caption text-muted-foreground">
                    {membershipCount > 0
                      ? t("memberships.line", { count: membershipCount })
                      : t("memberships.join")}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          </>
        )}
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

function GymItem({
  gym,
  current,
  pending,
  opening,
  onSelect,
}: {
  gym: GymWorkspace;
  current: boolean;
  pending: boolean;
  opening: boolean;
  onSelect: () => void;
}) {
  const g = useTranslations("gymConsole.switcher");
  return (
    <DropdownMenuItem
      role="menuitemradio"
      aria-checked={current}
      disabled={pending && !opening}
      onSelect={(event) => {
        event.preventDefault();
        onSelect();
      }}
      className={cn("min-h-12 gap-2.5 rounded-lg px-2 py-1.5", current && "bg-accent")}
    >
      <GymTile name={gym.name} small />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate type-body-sm font-extrabold">{gym.name}</span>
        <span className="truncate type-caption text-muted-foreground">
          {g(`roles.${gym.role}`)}
        </span>
      </span>
      <State current={current} opening={opening} />
    </DropdownMenuItem>
  );
}

function SponsorItem({
  sponsor,
  current,
  pending,
  opening,
  onSelect,
}: {
  sponsor: SponsorWorkspace;
  current: boolean;
  pending: boolean;
  opening: boolean;
  onSelect: () => void;
}) {
  const sp = useTranslations("sponsorPortal");
  return (
    <DropdownMenuItem
      role="menuitemradio"
      aria-checked={current}
      disabled={pending && !opening}
      onSelect={(event) => {
        event.preventDefault();
        onSelect();
      }}
      className={cn("min-h-12 gap-2.5 rounded-lg px-2 py-1.5", current && "bg-accent")}
    >
      <SponsorTile small />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate type-body-sm font-extrabold">{sponsor.display_name}</span>
        <span className="truncate type-caption text-muted-foreground">
          {sp("switcher.line", { role: sp(`roles.${sponsor.role}`) })}
        </span>
      </span>
      <State current={current} opening={opening} />
    </DropdownMenuItem>
  );
}

function MenuRow({
  pending,
  opening,
  onSelect,
  icon,
  title,
  line,
}: {
  pending: boolean;
  opening: boolean;
  onSelect: () => void;
  icon: ReactNode;
  title: string;
  line: string;
}) {
  return (
    <DropdownMenuItem
      disabled={pending && !opening}
      onSelect={(event) => {
        event.preventDefault();
        onSelect();
      }}
      className="min-h-11 gap-2.5 rounded-lg px-2 py-1.5"
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="type-body-sm font-extrabold">{title}</span>
        <span className="truncate type-caption text-muted-foreground">{line}</span>
      </span>
      <State current={false} opening={opening} />
    </DropdownMenuItem>
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
    <MenuRow
      pending={pending}
      opening={opening}
      onSelect={onSelect}
      icon={<PlusTile />}
      title={t(`${kind}.${journey.context}`)}
      line={t(`${kind}Lines.${journey.context}`)}
    />
  );
}

function State({ current, opening }: { current: boolean; opening: boolean }) {
  const t = useTranslations("contextSwitcher");
  if (current) return <CheckIcon aria-hidden className="size-4 flex-none text-highlight" />;
  if (opening) return <Spinner label={t("opening")} className="size-4 flex-none" />;
  return null;
}

function PlusTile() {
  return (
    <span
      aria-hidden
      className="flex size-7 flex-none items-center justify-center rounded-full border-[1.5px] border-dashed border-primary-muted text-highlight"
    >
      <PlusIcon className="size-3.5" />
    </span>
  );
}

/** SponsorNav's organization tile: the building mark (no logo exists for an organization). */
export function SponsorTile({ small = false }: { small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex flex-none items-center justify-center rounded-md border-[1.5px] border-warning bg-background text-warning",
        small ? "size-7" : "size-8",
      )}
    >
      <Building2Icon className={small ? "size-3.5" : "size-4"} />
    </span>
  );
}

/** GymWebNav's 32 px gym tile: the gym's initials on the olive tile. */
export function GymTile({ name, small = false }: { name: string; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex flex-none items-center justify-center rounded-md bg-accent type-micro font-display font-semibold text-highlight",
        small ? "size-7" : "size-8",
      )}
    >
      {initialsOf(name)}
    </span>
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
