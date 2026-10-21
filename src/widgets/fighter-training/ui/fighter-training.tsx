"use client";

import { CalendarIcon, LockIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import {
  useMyTrainingSessions,
  type MyTrainingSession,
  type TrainingSessionFilter,
  type TrainingSessionView,
} from "@/entities/training-session";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { wallTimeOf } from "@/shared/lib/time-zone";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";

import { Card, StateMessage, StatusBadge, TrainingPage, useCoachLine } from "./parts";

/*
 * The fighter's Training (`web.app.training`, WFT1; Claude Design
 * 1792573853-9116, WebCampBoard.dc.html screen=training, SF-67): the
 * backend's own projections of the fighter's assigned sessions (SF-63,
 * `listMyTrainingSessions`), Upcoming and History (`?view=history`,
 * narrowed with `?status=completed|cancelled`), from every coach and also
 * after a relationship ended. Order, buckets and statuses are the server's;
 * a past-due planned session stays Planned. Rows are grouped by the day of
 * each session in its own time zone. Loading, empty, not available (`404`:
 * no completed fighter profile) and failure stay distinct. No timer, log,
 * score or count: those domains do not exist (W06 Fight camp is FUTURE).
 */

const VIEWS: readonly TrainingSessionView[] = ["upcoming", "history"];
const FILTERS: readonly TrainingSessionFilter[] = ["all", "completed", "cancelled"];

const trainingHref = (view: TrainingSessionView, filter: TrainingSessionFilter = "all") =>
  routeHref(
    "web.app.training",
    {},
    view === "history" ? { view, ...(filter === "all" ? {} : { status: filter }) } : {},
  );

export function FighterTraining({
  view = "upcoming",
  filter = "all",
}: {
  view?: TrainingSessionView;
  filter?: TrainingSessionFilter;
}) {
  const t = useTranslations("fighterTraining");
  const active = view === "history" ? filter : "all";
  const sessions = useMyTrainingSessions(view, active);
  const unavailable =
    sessions.isError && isApiError(sessions.error) && sessions.error.status === 404;

  return (
    <TrainingPage title={t("title")} wide aside={t("list.note")}>
      <Card labelledBy="training-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="training-heading" className="type-label text-faint-foreground">
            {t(`list.heading.${view}`)}
          </h2>
          <nav aria-label={t("list.views")} className="flex gap-1.5">
            {VIEWS.map((item) => (
              <Button
                key={item}
                asChild
                size="sm"
                variant={item === view ? "secondary" : "ghost"}
                className="rounded-full"
              >
                <Link href={trainingHref(item)} aria-current={item === view ? "page" : undefined}>
                  {t(`list.tabs.${item}`)}
                </Link>
              </Button>
            ))}
          </nav>
        </div>

        {view === "history" && !unavailable && (
          <nav aria-label={t("list.filter")} className="flex flex-wrap gap-1.5">
            {FILTERS.map((item) => (
              <Button
                key={item}
                asChild
                size="sm"
                variant={item === active ? "outline" : "ghost"}
                className={cn(item !== active && "border-input")}
              >
                <Link
                  href={trainingHref("history", item)}
                  aria-current={item === active ? "page" : undefined}
                >
                  {t(`list.filters.${item}`)}
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
        ) : sessions.isError && sessions.data === undefined ? (
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
          <div role="status" aria-label={t("list.loading")} className="flex flex-col gap-2.5">
            {[0, 1, 2, 3, 4].map((index) => (
              <Skeleton key={index} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : (
          <Agenda
            rows={sessions.data.pages.flatMap((page) => page.training_sessions)}
            empty={view === "history" && active !== "all" ? active : view}
            more={
              <>
                {sessions.isFetchNextPageError && (
                  <Notice tone="coral" role="alert" className="mt-3">
                    {t("failed.more")}
                  </Notice>
                )}
                {sessions.hasNextPage && (
                  <Button
                    variant="quiet"
                    size="sm"
                    className="mt-3 self-center"
                    aria-busy={sessions.isFetchingNextPage}
                    disabled={sessions.isFetchingNextPage}
                    onClick={() => void sessions.fetchNextPage()}
                  >
                    {sessions.isFetchingNextPage && <Spinner />}
                    {sessions.isFetchingNextPage ? t("list.loadingMore") : t("list.more")}
                  </Button>
                )}
              </>
            }
          />
        )}
      </Card>
    </TrainingPage>
  );
}

/** Consecutive rows that start on the same day of their own time zone. */
function byDay(rows: MyTrainingSession[]) {
  const days: { key: string; first: MyTrainingSession; rows: MyTrainingSession[] }[] = [];
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
  rows: MyTrainingSession[];
  empty: "upcoming" | "history" | "completed" | "cancelled";
  more: ReactNode;
}) {
  const t = useTranslations("fighterTraining");
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

function Row({ row }: { row: MyTrainingSession }) {
  const t = useTranslations("fighterTraining");
  const format = useFormatter();
  const coach = useCoachLine()(row);
  const cancelled = row.status === "cancelled";
  const type = t(`types.${row.training_type}`);
  const minutes = t("list.minutes", { minutes: row.duration_minutes });

  return (
    // The whole row opens WFT2: the title link stretches over it.
    <li
      data-session-row={row.id}
      className="relative grid min-h-14 grid-cols-[6rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg border-t px-3 py-2 type-body-sm transition-colors focus-within:ring-3 focus-within:ring-ring/50 hover:bg-muted @2xl:grid-cols-[6rem_minmax(8rem,1fr)_auto_minmax(0,12rem)_auto_auto]"
    >
      <span
        className={cn(
          "type-body font-display font-semibold whitespace-nowrap",
          cancelled && "text-faint-foreground",
        )}
      >
        {format.dateTime(new Date(row.starts_at), {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: row.time_zone,
        })}
      </span>
      <span className="flex min-w-0 flex-col">
        <Link
          href={routeHref("web.app.training._session-id", { sessionId: row.id })}
          className={cn(
            "truncate font-extrabold outline-none after:absolute after:inset-0 after:rounded-lg",
            cancelled && "text-muted-foreground",
          )}
        >
          {row.title}
        </Link>
        <span className="truncate type-caption text-faint-foreground">
          {row.time_zone}
          <span className="@2xl:hidden">
            {" · "}
            {type} · {coach.line} · {minutes}
          </span>
        </span>
      </span>
      <span className="hidden @2xl:block">
        <span className="rounded-sm bg-muted px-2 py-1 type-badge text-highlight">{type}</span>
      </span>
      <span className={cn("hidden truncate @2xl:block", coach.faint && "text-muted-foreground")}>
        {coach.line}
      </span>
      <span className="hidden text-muted-foreground @2xl:block">{minutes}</span>
      <span className="justify-self-end">
        <StatusBadge status={row.status} />
      </span>
    </li>
  );
}
