"use client";

import { CalendarIcon, LockIcon, PlusIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import {
  fighterLabel,
  useCoachTrainingSessions,
  type CoachTrainingSession,
  type TrainingSessionFilter,
  type TrainingSessionView,
} from "@/entities/training-session";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { wallTimeOf } from "@/shared/lib/time-zone";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";

import { Card, SessionsPage, StateMessage, StatusBadge } from "./parts";

/*
 * The coach's sessions planner (`web.app.coach.sessions`, WCT1; Claude
 * Design 1792490047-d551, SF-64): an agenda list of the SF-62 sessions in
 * the two projections the backend computes with its own clock, Upcoming
 * and History (`?view=history`, narrowed with `?status=completed|cancelled`).
 * Rows are grouped by day and show the start in the session's own time
 * zone. Loading, an empty projection, planning not available (`404`) and a
 * failure to retry stay distinct. Nothing is counted, inferred or invented:
 * a past-due planned session stays "Planned".
 */

const VIEWS: readonly TrainingSessionView[] = ["upcoming", "history"];
const FILTERS: readonly TrainingSessionFilter[] = ["all", "completed", "cancelled"];

const plannerHref = (view: TrainingSessionView, filter: TrainingSessionFilter = "all") =>
  routeHref(
    "web.app.coach.sessions",
    {},
    view === "history" ? { view, ...(filter === "all" ? {} : { status: filter }) } : {},
  );

export function CoachSessions({
  view = "upcoming",
  filter = "all",
}: {
  view?: TrainingSessionView;
  filter?: TrainingSessionFilter;
}) {
  const t = useTranslations("coachSessions");
  const active = view === "history" ? filter : "all";
  const sessions = useCoachTrainingSessions(view, active);
  const unavailable =
    sessions.isError && isApiError(sessions.error) && sessions.error.status === 404;

  return (
    <SessionsPage
      eyebrow={t("eyebrow")}
      title={t("title")}
      wide
      aside={t("planner.aside")}
      actions={
        unavailable ? (
          <Button disabled>
            <PlusIcon aria-hidden />
            {t("new")}
          </Button>
        ) : (
          <Button asChild>
            <Link href={routeHref("web.app.coach.sessions.new")}>
              <PlusIcon aria-hidden />
              {t("new")}
            </Link>
          </Button>
        )
      }
    >
      <Card labelledBy="sessions-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="sessions-heading" className="type-label text-faint-foreground">
            {t(`planner.heading.${view}`)}
          </h2>
          <nav aria-label={t("planner.views")} className="flex gap-1.5">
            {VIEWS.map((item) => (
              <Button
                key={item}
                asChild
                size="sm"
                variant={item === view ? "secondary" : "ghost"}
                className="rounded-full"
              >
                <Link href={plannerHref(item)} aria-current={item === view ? "page" : undefined}>
                  {t(`planner.tabs.${item}`)}
                </Link>
              </Button>
            ))}
          </nav>
        </div>

        {view === "history" && !unavailable && (
          <nav aria-label={t("planner.filter")} className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <Button
                key={item}
                asChild
                size="sm"
                variant={item === active ? "outline" : "ghost"}
                className={cn(item !== active && "border-input")}
              >
                <Link
                  href={plannerHref("history", item)}
                  aria-current={item === active ? "page" : undefined}
                >
                  {t(`planner.filters.${item}`)}
                </Link>
              </Button>
            ))}
          </nav>
        )}

        {unavailable ? (
          <StateMessage
            role="status"
            icon={<LockIcon aria-hidden className="size-6" />}
            title={t("unavailable.title")}
            body={t("unavailable.body")}
          />
        ) : sessions.isError ? (
          <StateMessage
            role="alert"
            title={t("failed.title")}
            body={t("failed.body")}
            action={
              <Button variant="quiet" onClick={() => void sessions.refetch()}>
                {t("failed.retry")}
              </Button>
            }
          />
        ) : sessions.data === undefined ? (
          <div role="status" aria-label={t("planner.loading")} className="flex flex-col gap-2.5">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : (
          <Agenda
            rows={sessions.data.pages.flatMap((page) => page.training_sessions)}
            empty={view === "history" && active !== "all" ? active : view}
            more={
              sessions.hasNextPage ? (
                <Button
                  variant="quiet"
                  size="sm"
                  className="mt-3 self-center"
                  aria-busy={sessions.isFetchingNextPage}
                  disabled={sessions.isFetchingNextPage}
                  onClick={() => void sessions.fetchNextPage()}
                >
                  {sessions.isFetchingNextPage && <Spinner />}
                  {sessions.isFetchingNextPage ? t("planner.loadingMore") : t("planner.more")}
                </Button>
              ) : null
            }
          />
        )}
      </Card>
    </SessionsPage>
  );
}

/** Consecutive rows that start on the same day of their own time zone. */
function byDay(rows: CoachTrainingSession[]) {
  const days: { key: string; first: CoachTrainingSession; rows: CoachTrainingSession[] }[] = [];
  for (const row of rows) {
    const key = wallTimeOf(new Date(row.starts_at), row.time_zone).date;
    const last = days.at(-1);
    if (last?.key === key) last.rows.push(row);
    else days.push({ key, first: row, rows: [row] });
  }
  return days;
}

function Agenda({
  rows,
  empty,
  more,
}: {
  rows: CoachTrainingSession[];
  empty: "upcoming" | "history" | "completed" | "cancelled";
  more: ReactNode;
}) {
  const t = useTranslations("coachSessions");
  const format = useFormatter();

  if (rows.length === 0) {
    return (
      <StateMessage
        icon={<CalendarIcon aria-hidden className="size-6" />}
        title={t(`empty.${empty}.title`)}
        body={t(`empty.${empty}.body`)}
      />
    );
  }

  return (
    // The row layout follows the list's own width (a container query), not
    // the window's: beside the shell and the aside, a 1280 px window leaves a
    // narrow list.
    <div className="@container flex flex-col">
      {byDay(rows).map((day) => (
        <div key={day.key} className="flex flex-col">
          <h3 id={`day-${day.key}`} className="mt-2.5 mb-1 type-label text-faint-foreground">
            {format.dateTime(new Date(day.first.starts_at), {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: day.first.time_zone,
            })}
          </h3>
          <ul aria-labelledby={`day-${day.key}`} className="flex flex-col">
            {day.rows.map((row) => (
              <Row key={row.id} row={row} />
            ))}
          </ul>
        </div>
      ))}
      {more}
    </div>
  );
}

function Row({ row }: { row: CoachTrainingSession }) {
  const t = useTranslations("coachSessions");
  const format = useFormatter();
  const fighter = fighterLabel(row.fighter);

  return (
    // The whole row opens WCT2: the title link stretches over it.
    <li
      data-session-row={row.id}
      className="relative grid min-h-14 grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg border-t px-3 py-2 type-body-sm transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted @2xl:grid-cols-[6rem_minmax(8rem,1fr)_auto_minmax(0,9rem)_auto_auto]"
    >
      <span className="type-body font-display font-semibold whitespace-nowrap">
        {format.dateTime(new Date(row.starts_at), {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: row.time_zone,
        })}
      </span>
      <span className="flex min-w-0 flex-col">
        <Link
          href={routeHref("web.app.coach.sessions._session-id", { sessionId: row.id })}
          className="truncate font-extrabold outline-none after:absolute after:inset-0 after:rounded-lg"
        >
          {row.title}
        </Link>
        <span className="truncate type-caption text-faint-foreground">
          {row.time_zone}
          <span className="@2xl:hidden">
            {" · "}
            {t(`types.${row.training_type}`)} · {fighter ?? t("planner.fighterNotShared")} ·{" "}
            {t("planner.minutes", { minutes: row.duration_minutes })}
          </span>
        </span>
      </span>
      <span className="hidden @2xl:block">
        <span className="rounded-sm bg-muted px-2 py-1 type-badge text-highlight">
          {t(`types.${row.training_type}`)}
        </span>
      </span>
      <span
        className={cn("hidden truncate @2xl:block", fighter === null && "text-faint-foreground")}
      >
        {fighter ?? t("planner.fighterNotShared")}
      </span>
      <span className="hidden text-muted-foreground @2xl:block">
        {t("planner.minutes", { minutes: row.duration_minutes })}
      </span>
      <span className="justify-self-end">
        <StatusBadge status={row.status} />
      </span>
    </li>
  );
}
