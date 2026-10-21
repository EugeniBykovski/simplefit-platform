"use client";

import { ChevronRightIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import {
  useCoachLine,
  useMyTrainingSessions,
  type MyTrainingSession,
} from "@/entities/training-session";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { Skeleton } from "@/shared/ui/skeleton";

/** How many completed sessions the card previews (the list itself is on Training). */
const RECENT = 3;

const notAvailable = (error: unknown) => isApiError(error) && error.status === 404;

/**
 * The Home's Training card (SF-68; Claude Design 1792578392-00ac,
 * `FirstRunWebF.dc.html` training=… recent=…), under the Pro note: the
 * fighter's next assigned session and the latest completed ones, from the
 * same SF-63 projections (and the same cache) as `/app/training`, so a
 * completion there refreshes it. The first upcoming session is the
 * backend's own (earliest first); nothing is counted, sorted or derived on
 * the client. Each projection loads and fails on its own: a failed read is
 * never an empty schedule, and it never takes the rest of Home with it.
 */
export function HomeTraining() {
  const t = useTranslations("fighterHome.training");
  const upcoming = useMyTrainingSessions("upcoming");
  const completed = useMyTrainingSessions("history", "completed");
  const unavailable = upcoming.isError && notAvailable(upcoming.error);

  return (
    <section
      aria-labelledby="home-training"
      data-home-training
      className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-training" className="type-label text-highlight">
          {t("title")}
        </h2>
        <Link
          href={routeHref("web.app.training")}
          className="rounded-xs type-body-sm font-extrabold text-highlight outline-none hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("all")}
        </Link>
      </div>

      {unavailable ? (
        <div role="status" className="flex flex-col gap-1 rounded-xl bg-muted px-3.5 py-3">
          <p className="type-body-sm font-extrabold">{t("unavailable.title")}</p>
          <p className="type-caption text-muted-foreground">{t("unavailable.body")}</p>
        </div>
      ) : upcoming.isError && upcoming.data === undefined ? (
        <Notice
          tone="coral"
          role="alert"
          action={
            <Button variant="quiet" size="sm" onClick={() => void upcoming.refetch()}>
              {t("retry")}
            </Button>
          }
        >
          {t("failed.upcoming")}
        </Notice>
      ) : upcoming.data === undefined ? (
        <div role="status" aria-label={t("loading")}>
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : (
        <Next session={upcoming.data.pages[0]?.training_sessions[0]} />
      )}

      {!unavailable && (
        <Recent
          query={completed}
          sessions={completed.data?.pages[0]?.training_sessions.slice(0, RECENT)}
        />
      )}
    </section>
  );
}

function Next({ session }: { session: MyTrainingSession | undefined }) {
  const t = useTranslations("fighterHome.training");
  const types = useTranslations("fighterTraining");
  const format = useFormatter();
  const coach = useCoachLine();

  if (session === undefined) {
    return (
      <div
        data-home-next="empty"
        className="flex flex-col gap-1 rounded-xl border-[1.5px] border-dashed border-input px-3.5 py-3"
      >
        <p className="type-body-sm font-extrabold">{t("empty.title")}</p>
        <p className="type-caption text-muted-foreground">{t("empty.body")}</p>
      </div>
    );
  }

  const start = new Date(session.starts_at);
  const zone = session.time_zone;
  return (
    <Link
      href={routeHref("web.app.training._session-id", { sessionId: session.id })}
      data-home-next={session.id}
      className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-input bg-muted px-3.5 py-3 outline-none hover:border-accent-border focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="type-label text-faint-foreground">{t("next")}</span>
      <span className="flex min-w-0 items-center gap-3.5">
        <span className="type-h3 font-display whitespace-nowrap">
          {format.dateTime(start, { hour: "2-digit", minute: "2-digit", timeZone: zone })}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate type-body-sm font-extrabold">{session.title}</span>
          <span className="truncate type-caption text-muted-foreground">
            {t("when", {
              date: format.dateTime(start, {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: zone,
              }),
              zone,
            })}
          </span>
        </span>
      </span>
      <span className="truncate type-caption text-muted-foreground">
        {[
          types(`types.${session.training_type}`),
          coach(session).line,
          types("list.minutes", { minutes: session.duration_minutes }),
        ].join(" · ")}
      </span>
    </Link>
  );
}

function Recent({
  query,
  sessions,
}: {
  query: ReturnType<typeof useMyTrainingSessions>;
  sessions: MyTrainingSession[] | undefined;
}) {
  const t = useTranslations("fighterHome.training");
  const training = useTranslations("fighterTraining");
  const format = useFormatter();
  const coach = useCoachLine();

  // The upcoming read already says "not available"; a 404 here adds nothing.
  if (query.isError && notAvailable(query.error)) return null;

  return (
    <div className="flex flex-col">
      <h3 id="home-training-recent" className="mt-0.5 mb-1 type-label text-faint-foreground">
        {t("recent")}
      </h3>
      {query.isError && sessions === undefined ? (
        <Notice
          tone="coral"
          role="alert"
          action={
            <Button variant="quiet" size="sm" onClick={() => void query.refetch()}>
              {t("retry")}
            </Button>
          }
        >
          {t("failed.recent")}
        </Notice>
      ) : sessions === undefined ? (
        <div role="status" aria-label={t("loading")}>
          <Skeleton className="h-11 rounded-lg" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="border-t py-2.5 type-caption text-muted-foreground">{t("recentEmpty")}</p>
      ) : (
        <ul aria-labelledby="home-training-recent" className="flex flex-col">
          {sessions.map((session) => (
            <li key={session.id} className="border-t">
              <Link
                href={routeHref("web.app.training._session-id", { sessionId: session.id })}
                data-home-recent={session.id}
                className="flex min-h-11 items-center gap-2.5 rounded-lg py-1.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate type-body-sm font-extrabold">{session.title}</span>
                  <span className="truncate type-caption text-muted-foreground">
                    {[
                      format.dateTime(new Date(session.starts_at), {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                        timeZone: session.time_zone,
                      }),
                      training(`types.${session.training_type}`),
                      coach(session).line,
                    ].join(" · ")}
                  </span>
                </span>
                <Badge variant="success" data-status="completed">
                  {training("status.completed")}
                </Badge>
                <ChevronRightIcon aria-hidden className="size-4 flex-none text-faint-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
