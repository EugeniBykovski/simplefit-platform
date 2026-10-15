"use client";

import { LockIcon, UserPlusIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import { useCoachInvitations, type CoachInvitation } from "@/entities/coach-invitation";
import {
  isUnavailable,
  useCoachRelationships,
  type CoachRelationship,
  type CoachRelationshipStatus,
} from "@/entities/coach-relationship";
import { InviteFighterDialog } from "@/features/coach-invitation-create";
import { InvitationActions } from "@/features/coach-invitation-manage";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { countryName } from "@/shared/lib/countries";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";

/*
 * The coach's fighters (`web.app.coach.fighters`, WC7; Claude Design
 * 1792056621-3707, reconciled in SF-58): the SF-56 roster (Active / Ended)
 * and the SF-57 invitations, behind the Coach gate.
 *
 * Everything shown comes from the backend: active rows carry only the
 * fighter fields the fighter disclosed (anything else is "not shared"),
 * ended rows only the dates and the name at the end. A pending invitation is
 * never a roster member. Four outcomes stay distinct: loading, a real empty
 * roster, sharing not available (the backend refuses the read: `404`) and a
 * failure to retry. Nothing is counted or invented.
 */

const VIEWS: readonly CoachRelationshipStatus[] = ["active", "ended"];

/** `view` comes from the route's `?view=ended` query; anything else is the active roster. */
export function CoachFighters({ view = "active" }: { view?: CoachRelationshipStatus }) {
  const t = useTranslations("coachFighters");
  const roster = useCoachRelationships(view);
  const unavailable = roster.isError && isUnavailable(roster.error);

  return (
    <div data-coach-fighters className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex flex-col gap-0.5">
          <p className="type-label text-faint-foreground">{t("eyebrow")}</p>
          <h1 className="type-h3 font-display">{t("title")}</h1>
        </div>
        <div className="ml-auto">
          <InviteFighterDialog disabled={unavailable} />
        </div>
      </PageHeader>
      <PageBody className="grid content-start gap-5 pt-5.5 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
        <Roster view={view} roster={roster} unavailable={unavailable} />
        <div className="flex min-w-0 flex-col gap-3.5">
          <Invitations unavailable={unavailable} />
          <p className="flex items-start gap-2.5 rounded-lg border bg-muted px-3.5 py-3 type-caption text-muted-foreground">
            <LockIcon aria-hidden className="mt-0.5 size-4 flex-none text-faint-foreground" />
            {t("privacy")}
          </p>
        </div>
      </PageBody>
    </div>
  );
}

function Roster({
  view,
  roster,
  unavailable,
}: {
  view: CoachRelationshipStatus;
  roster: ReturnType<typeof useCoachRelationships>;
  unavailable: boolean;
}) {
  const t = useTranslations("coachFighters");
  const router = useRouter();
  const rows = roster.data?.pages.flatMap((page) => page.relationships) ?? [];

  return (
    <section
      aria-labelledby="roster-heading"
      className="flex min-w-0 flex-col gap-3.5 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="roster-heading" className="type-label text-faint-foreground">
          {t("roster.heading")}
        </h2>
        <nav aria-label={t("roster.views")} className="flex gap-1.5">
          {VIEWS.map((item) => (
            <Button
              key={item}
              size="sm"
              variant={item === view ? "secondary" : "ghost"}
              aria-current={item === view ? "page" : undefined}
              className="rounded-full"
              onClick={() =>
                router.replace(
                  routeHref(
                    "web.app.coach.fighters",
                    {},
                    item === "ended" ? { view: "ended" } : {},
                  ),
                )
              }
            >
              {t(`roster.tabs.${item}`)}
            </Button>
          ))}
        </nav>
      </div>

      {unavailable ? (
        <StateMessage
          role="status"
          icon={<LockIcon aria-hidden className="size-6" />}
          title={t("unavailable.title")}
          body={t("unavailable.body")}
        />
      ) : roster.isError ? (
        <StateMessage
          role="alert"
          title={t("failed.title")}
          body={t("failed.body")}
          action={
            <Button variant="quiet" onClick={() => void roster.refetch()}>
              {t("failed.retry")}
            </Button>
          }
        />
      ) : roster.data === undefined ? (
        <div role="status" aria-label={t("roster.loading")} className="flex flex-col gap-2.5">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-13 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <StateMessage
          icon={<UserPlusIcon aria-hidden className="size-6" />}
          title={t(`empty.${view}.title`)}
          body={t(`empty.${view}.body`)}
        />
      ) : (
        <>
          <RosterTable view={view} rows={rows} />
          {roster.hasNextPage && (
            <Button
              variant="quiet"
              size="sm"
              className="self-center"
              aria-busy={roster.isFetchingNextPage}
              disabled={roster.isFetchingNextPage}
              onClick={() => void roster.fetchNextPage()}
            >
              {roster.isFetchingNextPage && <Spinner />}
              {roster.isFetchingNextPage ? t("roster.loadingMore") : t("roster.more")}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function RosterTable({ view, rows }: { view: CoachRelationshipStatus; rows: CoachRelationship[] }) {
  const t = useTranslations("coachFighters");
  const level = useTranslations("fighterOnboarding.profile.experience.options");
  const stance = useTranslations("fighterOnboarding.profile.stance.options");
  const format = useFormatter();
  const locale = useLocale();
  const date = (value: string) => format.dateTime(new Date(value), "date");
  const notShared = <span className="text-faint-foreground">{t("roster.notShared")}</span>;

  const columns =
    view === "active"
      ? (["fighter", "place", "level", "stance", "bouts", "since"] as const)
      : (["fighter", "started", "ended", "endedBy"] as const);
  const grid =
    view === "active"
      ? "md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.6fr)_minmax(0,0.9fr)]"
      : "md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]";

  return (
    <div role="table" aria-label={t(`roster.label.${view}`)} className="flex flex-col">
      <div role="rowgroup" className="hidden md:block">
        <div
          role="row"
          className={cn("grid gap-3 px-3 pb-2 type-label text-faint-foreground", grid)}
        >
          {columns.map((column) => (
            <span key={column} role="columnheader">
              {t(`roster.columns.${column}`)}
            </span>
          ))}
        </div>
      </div>
      <div role="rowgroup">
        {rows.map((row) => {
          if (view === "ended") {
            const name = row.fighter_display_name_at_end;
            return (
              <div
                key={row.relationship_id}
                role="row"
                className={cn(
                  "grid min-h-14 items-center gap-x-3 gap-y-1 border-t px-3 py-2",
                  grid,
                )}
              >
                <span role="cell" className="flex min-w-0 items-center gap-2.5">
                  <Initials name={name} muted />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate type-body-sm font-extrabold">
                      {name ?? t("detail.fallbackName")}
                    </span>
                    <span className="type-caption text-faint-foreground">
                      {t("roster.nameAtEnd")}
                    </span>
                  </span>
                </span>
                <span role="cell" className="type-body-sm">
                  <Hidden label={t("roster.columns.started")} />
                  {date(row.started_at)}
                </span>
                <span role="cell" className="type-body-sm">
                  <Hidden label={t("roster.columns.ended")} />
                  {row.ended_at ? date(row.ended_at) : null}
                </span>
                <span role="cell" className="type-body-sm">
                  <Hidden label={t("roster.columns.endedBy")} />
                  {row.ended_by ? t(`roster.endedBy.${row.ended_by}`) : null}
                </span>
              </div>
            );
          }

          const fighter = row.fighter;
          const place = [
            fighter?.city,
            fighter?.country_code ? countryName(fighter.country_code, locale) : null,
          ]
            .filter(Boolean)
            .join(", ");
          const name = fighter?.display_name ?? null;

          return (
            // The whole row opens WC4: the name link stretches over it, so
            // the table keeps its row/cell semantics and one link per row.
            <div
              key={row.relationship_id}
              role="row"
              className={cn(
                "relative grid min-h-14 items-center gap-x-3 gap-y-1 rounded-lg border-t px-3 py-2 type-body-sm transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted",
                grid,
              )}
            >
              <span role="cell" className="flex min-w-0 items-center gap-2.5">
                <Initials name={name} />
                <span className="flex min-w-0 flex-col">
                  <Link
                    href={routeHref("web.app.coach.fighters._fighter-id", {
                      fighterId: row.relationship_id,
                    })}
                    className="truncate font-extrabold outline-none after:absolute after:inset-0 after:rounded-lg"
                  >
                    {name ?? t("detail.fallbackName")}
                  </Link>
                  <span className="truncate type-caption text-faint-foreground">
                    {fighter?.username ? `@${fighter.username}` : t("roster.notShared")}
                  </span>
                </span>
              </span>
              <span role="cell">
                <Hidden label={t("roster.columns.place")} />
                {place || notShared}
              </span>
              <span role="cell">
                <Hidden label={t("roster.columns.level")} />
                {fighter?.experience_level ? level(fighter.experience_level) : notShared}
              </span>
              <span role="cell">
                <Hidden label={t("roster.columns.stance")} />
                {fighter?.stance ? stance(fighter.stance) : notShared}
              </span>
              <span role="cell">
                <Hidden label={t("roster.columns.bouts")} />
                {fighter?.amateur_bout_count == null ? notShared : fighter.amateur_bout_count}
              </span>
              <span role="cell">
                <Hidden label={t("roster.columns.since")} />
                {date(row.started_at)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Invitations({ unavailable }: { unavailable: boolean }) {
  const t = useTranslations("coachFighters");
  const invitations = useCoachInvitations({ enabled: !unavailable });
  const items = invitations.data?.pages.flatMap((page) => page.invitations) ?? [];
  const off = unavailable || (invitations.isError && isUnavailable(invitations.error));

  return (
    <section
      aria-labelledby="invitations-heading"
      className="flex flex-col gap-1 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <h2 id="invitations-heading" className="pb-2 type-label text-faint-foreground">
        {t("invitations.heading")}
      </h2>
      {off ? (
        <p className="py-2 type-body-sm text-muted-foreground">{t("invitations.unavailable")}</p>
      ) : invitations.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2 py-2">
          <p className="type-body-sm text-muted-foreground">{t("invitations.failed")}</p>
          <Button size="sm" variant="quiet" onClick={() => void invitations.refetch()}>
            {t("invitations.retry")}
          </Button>
        </div>
      ) : invitations.data === undefined ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : items.length === 0 ? (
        <p className="py-2 type-body-sm text-muted-foreground">{t("invitations.empty")}</p>
      ) : (
        <ul className="flex flex-col">
          {items.map((invitation) => (
            <InvitationItem key={invitation.invitation_id} invitation={invitation} />
          ))}
          {invitations.hasNextPage && (
            <li className="flex justify-center pt-2">
              <Button
                size="sm"
                variant="quiet"
                aria-busy={invitations.isFetchingNextPage}
                disabled={invitations.isFetchingNextPage}
                onClick={() => void invitations.fetchNextPage()}
              >
                {t("invitations.more")}
              </Button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function InvitationItem({ invitation }: { invitation: CoachInvitation }) {
  const t = useTranslations("coachFighters");
  const format = useFormatter();
  const date = (value: string | null) => (value ? format.dateTime(new Date(value), "date") : "");
  const status = invitation.status;
  const line =
    status === "pending"
      ? t("invitations.line.pending", {
          sent: date(invitation.last_sent_at),
          expires: date(invitation.expires_at),
        })
      : t(`invitations.line.${status}`, {
          date: date(status === "expired" ? invitation.expires_at : invitation.responded_at),
        });

  return (
    <li className="flex flex-col gap-1.5 border-t py-3">
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate type-body-sm font-extrabold">
          {invitation.recipient_email}
        </span>
        <Badge variant={status === "pending" ? "accent" : "neutral"}>
          {t(`invitations.status.${status}`)}
        </Badge>
      </span>
      <span className="type-caption text-faint-foreground">{line}</span>
      {status === "pending" && <InvitationActions invitation={invitation} />}
    </li>
  );
}

function StateMessage({
  icon,
  title,
  body,
  action,
  role,
}: {
  icon?: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div role={role} className="flex flex-col items-start gap-2.5 px-2 py-8">
      {icon && (
        <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-highlight">
          {icon}
        </span>
      )}
      <p className="type-title font-display">{title}</p>
      <p className="max-w-130 type-body-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}

/** A column name for stacked rows (below md the header row is hidden). */
function Hidden({ label }: { label: string }) {
  return <span className="sr-only md:hidden">{`${label} `}</span>;
}

/** "Alex K." → "AK"; a name not shared shows a neutral mark. */
function Initials({ name, muted = false }: { name: string | null; muted?: boolean }) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8.5 flex-none items-center justify-center rounded-full type-caption font-display font-bold",
        muted ? "bg-muted text-muted-foreground" : "bg-highlight text-highlight-foreground",
      )}
    >
      {letters || "·"}
    </span>
  );
}
