"use client";

import { RepeatIcon, TriangleAlertIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState, type Ref } from "react";

import {
  wallClock,
  type GymClassOccurrence,
  type GymInstructor,
  type GymVenue,
  type TimetableCapabilities,
} from "@/entities/gym-timetable";
import { CancelOccurrenceDialog, RescheduleDialog } from "@/features/gym-timetable-manage";
import { formatOffset } from "@/shared/lib/time-zone";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

import { Fact } from "./shared";

/**
 * One class as the backend lists it (WG5's side panel, reconciled): its
 * date and wall times in its own zone with the UTC offset then, duration,
 * venue, instructor (or "Instructor needed", never a guessed name),
 * maximum capacity (a limit: nothing is booked), the backend's status and
 * its series. No roster, waitlist, attendance, visibility or "friends"
 * settings: those domains do not exist. The actions are the viewer's per
 * the permission projection, for a class still to come.
 */
export function OccurrenceDetails({
  gymId,
  occurrence,
  can,
  venues,
  instructors,
  onSeries,
  headingRef,
}: {
  gymId: string;
  occurrence: GymClassOccurrence;
  can: TimetableCapabilities;
  venues: readonly GymVenue[];
  instructors: readonly GymInstructor[];
  onSeries: (seriesId: string) => void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const t = useTranslations("gymConsole.timetable.details");
  const format = useFormatter();
  const start = new Date(occurrence.starts_at);
  const scheduled = occurrence.status === "scheduled";
  const now = useNow();
  const upcoming = start.getTime() > now;
  const canChange = can.canManage && scheduled && upcoming;
  const canCancel = can.canCancel(occurrence) && scheduled && upcoming;
  const day = format.dateTime(start, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: occurrence.time_zone,
  });
  const eyebrow = `${format.dateTime(start, { weekday: "short", timeZone: occurrence.time_zone })} · ${wallClock(occurrence.local_starts_at)} – ${wallClock(occurrence.local_ends_at)} · ${occurrence.venue.name}`;

  return (
    <section
      aria-labelledby="timetable-class-heading"
      data-occurrence-details={occurrence.occurrence_id}
      data-occurrence-status={occurrence.status}
      className="flex min-w-0 flex-col gap-3.5 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <p className="type-label font-mono text-highlight uppercase" aria-hidden>
        {eyebrow}
      </p>
      <h2
        id="timetable-class-heading"
        ref={headingRef}
        tabIndex={-1}
        className="type-title font-display break-words outline-none"
      >
        {occurrence.title}
      </h2>
      <div className="flex flex-wrap gap-1.5">
        {scheduled ? (
          <Badge variant="accent">{t("status.scheduled")}</Badge>
        ) : (
          <Badge variant="destructive" data-cancel-reason={occurrence.cancel_reason}>
            {t(`status.${occurrence.cancel_reason ?? "cancelled"}`)}
          </Badge>
        )}
        {occurrence.series_id !== null && <Badge variant="outline">{t("weekly")}</Badge>}
        {occurrence.rescheduled && <Badge variant="info">{t("rescheduled")}</Badge>}
      </div>
      <dl className="flex flex-col rounded-2xl border px-3.5">
        <Fact label={t("date")} field="date">
          {day}
        </Fact>
        <Fact label={t("time")} field="time">
          {t("timeValue", {
            from: wallClock(occurrence.local_starts_at),
            to: wallClock(occurrence.local_ends_at),
          })}
        </Fact>
        <Fact label={t("zone")} field="zone">
          {t("zoneValue", {
            zone: occurrence.time_zone,
            offset: formatOffset(occurrence.utc_offset_minutes),
          })}
        </Fact>
        <Fact label={t("duration")} field="duration">
          {t("minutes", { count: occurrence.duration_minutes })}
        </Fact>
        <Fact label={t("venue")} field="venue">
          {occurrence.venue.name}
        </Fact>
        <Fact
          label={t("instructor")}
          field="instructor"
          tone={occurrence.instructor === null ? "warning" : undefined}
        >
          {occurrence.instructor === null
            ? occurrence.needs_instructor
              ? t("instructorNeeded")
              : t("noInstructor")
            : (occurrence.instructor.name ?? t("unnamed"))}
        </Fact>
        <Fact label={t("capacity")} field="capacity">
          {t("capacityValue", { count: occurrence.capacity })}
        </Fact>
      </dl>
      {occurrence.needs_instructor && (
        <p className="flex items-start gap-2 type-caption text-warning" data-needs-instructor>
          <TriangleAlertIcon aria-hidden className="mt-0.5 size-3.5 flex-none" />
          {t("needsInstructorNote")}
        </p>
      )}
      {occurrence.series_id !== null && (
        <Button
          variant="link"
          size="sm"
          className="self-start"
          onClick={() => onSeries(occurrence.series_id ?? "")}
          data-open-series={occurrence.series_id}
        >
          <RepeatIcon aria-hidden />
          {t("openSeries")}
        </Button>
      )}
      <p className="type-caption text-faint-foreground">{t("capacityNote")}</p>
      {canChange || canCancel ? (
        <div className="flex flex-wrap gap-2">
          {canChange && (
            <RescheduleDialog
              gymId={gymId}
              occurrence={occurrence}
              venues={venues}
              instructors={instructors}
              trigger={
                <Button size="sm" data-reschedule={occurrence.occurrence_id}>
                  {t("change")}
                </Button>
              }
            />
          )}
          {canCancel && (
            <CancelOccurrenceDialog
              gymId={gymId}
              occurrence={occurrence}
              trigger={
                <Button
                  size="sm"
                  variant="destructive-subtle"
                  data-cancel-occurrence={occurrence.occurrence_id}
                >
                  {t("cancel")}
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <p className="type-caption text-faint-foreground" data-occurrence-readonly>
          {!scheduled
            ? t("readonly.cancelled")
            : !upcoming
              ? t("readonly.started")
              : t("readonly.role")}
        </p>
      )}
    </section>
  );
}

/** The clock, read when the panel opens and every half minute: a class that starts meanwhile stops offering changes. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
