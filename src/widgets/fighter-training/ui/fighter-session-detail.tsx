"use client";

import { LockIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { useMyTrainingSession, type MyTrainingSession } from "@/entities/training-session";
import { CompleteSessionDialog, type CompleteOutcome } from "@/features/training-session-complete";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { browserTimeZone, formatOffset, zoneOffsetMinutes } from "@/shared/lib/time-zone";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { Skeleton } from "@/shared/ui/skeleton";

import { Card, StateMessage, StatusBadge, TrainingPage, useCoachLine } from "./parts";

/*
 * One of the fighter's own sessions (`web.app.training._session-id`, WFT2;
 * Claude Design 1792573853-9116, WebCampBoard.dc.html screen=session,
 * SF-67) from `getMyTrainingSession`: the coach's public identity (or the
 * name at the end of the relationship), type, the start in the session's
 * zone with its offset and in the viewer's, duration, the coach's notes, the
 * backend status and, once it ended, the completion time or the
 * cancellation. "Mark as completed" only while planned, behind a
 * confirmation; the backend decides whether it has started and sets
 * `completed_at`. Completed and cancelled sessions are read-only. Unknown
 * and someone else's sessions are one "not available" state (`404`).
 */

const WHEN = {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as const;

type Refusal = "notStarted" | "cancelled";

export function FighterSessionDetail({ sessionId }: { sessionId: string }) {
  const t = useTranslations("fighterTraining");
  const query = useMyTrainingSession(sessionId);
  const missing = query.isError && isApiError(query.error) && query.error.status === 404;

  // A session already shown stays on screen when reading it again fails
  // (offline): the backend's last answer, never an error instead of it. Only
  // the backend saying it is gone (404) replaces it.
  if (query.data !== undefined && !missing) return <Detail session={query.data} />;

  if (query.isError) {
    return (
      <TrainingPage
        title={t("detail.heading")}
        back
        aside={missing ? t("detail.missing.aside") : t("detail.aside.planned")}
      >
        <Card>
          {missing ? (
            <StateMessage
              role="status"
              icon={<LockIcon aria-hidden className="size-6" />}
              title={t("detail.missing.title")}
              body={t("detail.missing.body")}
              action={
                <Button asChild variant="quiet">
                  <Link href={routeHref("web.app.training")}>{t("back")}</Link>
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
      </TrainingPage>
    );
  }

  return (
    <TrainingPage title={t("detail.heading")} back aside={t("detail.aside.planned")}>
      <div role="status" aria-label={t("detail.loading")} className="flex flex-col gap-3">
        <Skeleton className="h-80 rounded-3xl" />
      </div>
    </TrainingPage>
  );
}

function Detail({ session }: { session: MyTrainingSession }) {
  const t = useTranslations("fighterTraining");
  const coach = useCoachLine()(session);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const planned = session.status === "planned";
  const aside = planned
    ? session.coach === null
      ? t("detail.aside.ended")
      : t("detail.aside.planned")
    : t(`detail.aside.${session.status}`);

  const done = (outcome: CompleteOutcome) => {
    // Only the backend's answer is shown; the page then renders the session it returned.
    if (outcome.kind === "completed") {
      setRefusal(null);
      toast.success(t("complete.done"));
    } else if (outcome.kind === "unavailable") toast(t("complete.unavailable"));
    else setRefusal(outcome.kind);
  };

  return (
    <TrainingPage
      title={session.title}
      back
      aside={aside}
      actions={
        planned ? (
          <CompleteSessionDialog sessionId={session.id} coachName={coach.name} onDone={done} />
        ) : undefined
      }
    >
      {refusal !== null && session.status !== "completed" && (
        <Notice tone="amber" role="alert" data-refusal={refusal}>
          <span className="flex flex-col gap-0.5">
            <strong className="font-extrabold">{t(`complete.refused.${refusal}.title`)}</strong>
            <span>{t(`complete.refused.${refusal}.body`)}</span>
          </span>
        </Notice>
      )}
      <Card labelledBy="session-heading">
        <div className="flex items-center justify-between gap-3 pb-1">
          <h2 id="session-heading" className="type-label text-faint-foreground">
            {t("detail.heading")}
          </h2>
          <StatusBadge status={session.status} />
        </div>
        <Facts session={session} coach={coach} />
      </Card>
    </TrainingPage>
  );
}

function Facts({
  session,
  coach,
}: {
  session: MyTrainingSession;
  coach: { line: string; faint: boolean };
}) {
  const t = useTranslations("fighterTraining");
  const format = useFormatter();
  const start = new Date(session.starts_at);
  const zone = session.time_zone;
  // Rendered only in the browser (the session is read there): the fighter's own zone.
  const viewer = browserTimeZone();
  const at = (iso: string) => format.dateTime(new Date(iso), { ...WHEN, timeZone: viewer ?? zone });

  const facts: [string, string, boolean?][] = [
    [t("detail.facts.coach"), coach.line, coach.faint],
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
      viewer === zone || zoneOffsetMinutes(viewer, start) === zoneOffsetMinutes(zone, start)
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
    [t("detail.facts.duration"), t("list.minutes", { minutes: session.duration_minutes })],
    [t("detail.facts.notes"), session.notes ?? t("detail.noNotes"), session.notes === null],
  );
  if (session.status === "completed" && session.completed_at !== null)
    facts.push([t("detail.facts.completed"), at(session.completed_at)]);
  if (session.status === "cancelled" && session.cancelled_at !== null) {
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
