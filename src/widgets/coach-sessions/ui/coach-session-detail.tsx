"use client";

import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  fighterLabel,
  useCoachTrainingSession,
  type CoachTrainingSession,
} from "@/entities/training-session";
import { CancelSessionDialog } from "@/features/training-session-cancel";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { browserTimeZone, formatOffset, zoneOffsetMinutes } from "@/shared/lib/time-zone";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";

import { Card, SessionsPage, StateMessage, StatusBadge } from "./parts";

/*
 * One session the coach planned (`web.app.coach.sessions._session-id`,
 * WCT2; Claude Design 1792490047-d551, SF-64): its plan, its start in the
 * session's time zone and in the coach's own, and, once it ended, when it
 * was completed or cancelled and by whom. Edit and Cancel session exist only
 * while it is planned. The backend answers `404` for an unknown session,
 * someone else's, one whose relationship ended and planning switched off:
 * one truthful "not available" state.
 */

const WHEN = {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as const;

export function CoachSessionDetail({ sessionId }: { sessionId: string }) {
  const t = useTranslations("coachSessions");
  const query = useCoachTrainingSession(sessionId);
  const session = query.data;

  if (query.isError) {
    const missing = isApiError(query.error) && query.error.status === 404;
    return (
      <SessionsPage
        eyebrow={t("sessionEyebrow")}
        title={t("detail.heading")}
        back
        aside={missing ? t("detail.missing.aside") : t("detail.aside.planned")}
      >
        <Card>
          {missing ? (
            <StateMessage
              role="status"
              title={t("detail.missing.title")}
              body={t("detail.missing.body")}
              action={
                <Button asChild variant="quiet">
                  <Link href={routeHref("web.app.coach.sessions")}>{t("back")}</Link>
                </Button>
              }
            />
          ) : (
            <StateMessage
              role="alert"
              title={t("detail.failed.title")}
              body={t("detail.failed.body")}
              action={
                <Button variant="quiet" onClick={() => void query.refetch()}>
                  {t("failed.retry")}
                </Button>
              }
            />
          )}
        </Card>
      </SessionsPage>
    );
  }

  if (session === undefined) {
    return (
      <SessionsPage
        eyebrow={t("sessionEyebrow")}
        title={t("detail.heading")}
        back
        aside={t("detail.aside.planned")}
      >
        <div role="status" aria-label={t("detail.loading")} className="flex flex-col gap-3">
          <Skeleton className="h-80 rounded-3xl" />
        </div>
      </SessionsPage>
    );
  }

  const fighter = fighterLabel(session.fighter);

  return (
    <SessionsPage
      eyebrow={t("sessionEyebrow")}
      title={session.title}
      back
      aside={t(`detail.aside.${session.status}`)}
      actions={
        session.status === "planned" ? (
          <>
            <Button asChild variant="quiet">
              <Link
                href={routeHref("web.app.coach.sessions._session-id.edit", {
                  sessionId: session.id,
                })}
              >
                {t("detail.edit")}
              </Link>
            </Button>
            <CancelSessionDialog
              sessionId={session.id}
              fighter={fighter}
              onDone={(outcome) => {
                if (outcome.kind === "cancelled") toast.success(t("cancelDialog.cancelled"));
                else toast(t(`cancelDialog.${outcome.kind}`));
              }}
            />
          </>
        ) : undefined
      }
    >
      <Card labelledBy="session-heading">
        <div className="flex items-center justify-between gap-3 pb-1">
          <h2 id="session-heading" className="type-label text-faint-foreground">
            {t("detail.heading")}
          </h2>
          <StatusBadge status={session.status} />
        </div>
        <Facts session={session} fighter={fighter} />
      </Card>
    </SessionsPage>
  );
}

function Facts({ session, fighter }: { session: CoachTrainingSession; fighter: string | null }) {
  const t = useTranslations("coachSessions");
  const format = useFormatter();
  const start = new Date(session.starts_at);
  const zone = session.time_zone;
  // Rendered only in the browser (the session is read there): the coach's own zone.
  const viewer = browserTimeZone();
  const handle = session.fighter?.username ? `@${session.fighter.username}` : null;
  const at = (iso: string) => format.dateTime(new Date(iso), { ...WHEN, timeZone: viewer ?? zone });

  const facts: [string, string, boolean?][] = [
    [
      t("detail.facts.fighter"),
      fighter === null
        ? t("planner.fighterNotShared")
        : handle && handle !== fighter
          ? `${fighter} · ${handle}`
          : fighter,
      fighter === null,
    ],
    [t("detail.facts.type"), t(`types.${session.training_type}`)],
    [
      t("detail.facts.starts"),
      t("detail.startsValue", {
        when: format.dateTime(start, { ...WHEN, timeZone: zone }),
        zone,
        offset: formatOffset(zoneOffsetMinutes(zone, start)),
      }),
    ],
  ];
  if (viewer !== null) {
    facts.push([
      t("detail.facts.yourTime"),
      viewer === zone
        ? t("detail.sameZone", {
            time: format.dateTime(start, { hour: "2-digit", minute: "2-digit", timeZone: zone }),
          })
        : t("detail.otherZone", {
            when: format.dateTime(start, { ...WHEN, timeZone: viewer }),
            zone: viewer,
          }),
    ]);
  }
  facts.push(
    [t("detail.facts.duration"), t("detail.minutes", { minutes: session.duration_minutes })],
    [t("detail.facts.notes"), session.notes ?? t("detail.noNotes"), session.notes === null],
  );
  if (session.completed_at !== null)
    facts.push([t("detail.facts.completed"), at(session.completed_at)]);
  if (session.cancelled_at !== null) {
    facts.push([
      t("detail.facts.cancelled"),
      session.cancelled_by === "system"
        ? t("detail.cancelledBySystem", { when: at(session.cancelled_at) })
        : t("detail.cancelledByCoach", { when: at(session.cancelled_at) }),
    ]);
  }

  return (
    <dl className="flex flex-col">
      {facts.map(([label, value, faint]) => (
        <div
          key={label}
          className="grid min-h-10 items-center gap-x-3 gap-y-0.5 border-t py-2 type-body-sm sm:grid-cols-[10rem_minmax(0,1fr)]"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd
            className={
              faint
                ? "font-bold whitespace-pre-line text-faint-foreground"
                : "font-bold break-words whitespace-pre-line"
            }
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
