"use client";

import { useMutation } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Controller, useForm, useWatch, type UseFormSetError } from "react-hook-form";
import { toast } from "sonner";

import {
  wallClock,
  wallDate,
  type GymClassOccurrence,
  type GymInstructor,
  type GymVenue,
} from "@/entities/gym-timetable";
import { callWithSession } from "@/entities/session";
import {
  cancelGymClassOccurrence,
  getGymClassOccurrence,
  updateGymClassOccurrence,
} from "@/shared/api/generated/endpoints/gym-timetable/gym-timetable";
import type { GymClassOccurrenceUpdateRequest } from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";
import {
  formatOffset,
  resolveWallTime,
  toRfc3339,
  wallTimeOf,
  zoneOffsetMinutes,
  type WallTimeResolution,
} from "@/shared/lib/time-zone";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { describedBy, FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";
import { Spinner } from "@/shared/ui/spinner";

import { useDialogRefresh } from "../model/refresh";
import { isOutdated, timetableProblem, type TimetableProblem } from "../model/timetable-problem";
import { ConfirmDialog } from "./confirm-dialog";
import { NONE, NumberField, SelectField, WallTimeNotice, wholeIn } from "./fields";
import { ProblemNotice } from "./problem-text";

/** "Sat, 3 Oct 2026, 18:00–19:30 (Europe/Warsaw)": a class's wall times in its own zone. */
export function useClassWhen() {
  const format = useFormatter();
  return (occurrence: GymClassOccurrence) => {
    const day = format.dateTime(new Date(occurrence.starts_at), {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: occurrence.time_zone,
    });
    return `${day}, ${wallClock(occurrence.local_starts_at)}–${wallClock(occurrence.local_ends_at)} (${occurrence.time_zone})`;
  };
}

type Values = {
  date: string;
  time: string;
  occurrence: "" | "first" | "second";
  venueId: string;
  instructorId: string;
  duration: string;
  capacity: string;
};

function valuesOf(occurrence: GymClassOccurrence): Values {
  const date = wallDate(occurrence.local_starts_at);
  const time = wallClock(occurrence.local_starts_at);
  const resolution = resolveWallTime(date, time, occurrence.time_zone);
  return {
    date,
    time,
    occurrence:
      resolution.kind === "overlap"
        ? resolution.first.offsetMinutes === occurrence.utc_offset_minutes
          ? "first"
          : "second"
        : "",
    venueId: occurrence.venue.venue_id,
    instructorId: occurrence.instructor?.staff_membership_id ?? NONE,
    duration: String(occurrence.duration_minutes),
    capacity: String(occurrence.capacity),
  };
}

/**
 * "Change this class" (SF-97 `updateGymClassOccurrence`): one dated class
 * only, never its series. Its date and wall time (in its venue's zone),
 * venue (only venues in the same zone: the zone of a class never changes
 * here), instructor, duration and capacity. Only the fields changed are
 * sent, with the revision the form was based on. When someone changed the
 * class meanwhile (`409 stale`), nothing is overwritten: the latest class is
 * read and shown, the draft stays, and saving again is the user's explicit
 * choice. A class of a series that is changed here keeps its own time when
 * the series changes later (the backend's `rescheduled`).
 */
export function RescheduleDialog({
  gymId,
  occurrence,
  venues,
  instructors,
  trigger,
}: {
  gymId: string;
  occurrence: GymClassOccurrence;
  venues: readonly GymVenue[];
  instructors: readonly GymInstructor[];
  trigger: ReactNode;
}) {
  const t = useTranslations("gymConsole.timetable.reschedule");
  const [open, setOpen] = useState(false);
  const refresh = useDialogRefresh(gymId);
  const toggle = (next: boolean) => {
    setOpen(next);
    if (!next) refresh.onClose();
  };
  return (
    <Dialog open={open} onOpenChange={toggle}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent closeLabel={t("close")} className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        {open && (
          <RescheduleForm
            gymId={gymId}
            occurrence={occurrence}
            venues={venues}
            instructors={instructors}
            refresh={refresh}
            onClose={() => toggle(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RescheduleForm({
  gymId,
  occurrence: initial,
  venues,
  instructors,
  refresh,
  onClose,
}: {
  gymId: string;
  occurrence: GymClassOccurrence;
  venues: readonly GymVenue[];
  instructors: readonly GymInstructor[];
  refresh: ReturnType<typeof useDialogRefresh>;
  onClose: () => void;
}) {
  const t = useTranslations("gymConsole.timetable.reschedule");
  const tc = useTranslations("gymConsole.timetable.classForm");
  const when = useClassWhen();
  const ids = {
    date: useId(),
    time: useId(),
    venue: useId(),
    instructor: useId(),
    duration: useId(),
    capacity: useId(),
  };
  // The class the change is based on: the latest after a stale answer.
  const [base, setBase] = useState(initial);
  const [problem, setProblem] = useState<TimetableProblem | null>(null);
  const form = useForm<Values>({ defaultValues: valuesOf(initial), mode: "onTouched" });
  const { errors } = form.formState;
  const zone = base.time_zone;
  const [date, time, occurrence] = useWatch({
    control: form.control,
    name: ["date", "time", "occurrence"],
  });
  const resolution: WallTimeResolution = useMemo(
    () => (date && time ? resolveWallTime(date, time, zone) : { kind: "invalid" }),
    [date, time, zone],
  );
  const sameZone = venues.filter((venue) => venue.time_zone === zone);
  const venueOptions = [
    ...sameZone.map((venue) => ({ value: venue.venue_id, label: venue.name })),
    // The class's own venue stays listed even if it is no longer active.
    ...(sameZone.some((venue) => venue.venue_id === base.venue.venue_id)
      ? []
      : [{ value: base.venue.venue_id, label: base.venue.name }]),
  ];
  const instructorOptions = [
    { value: NONE, label: tc("instructor.none") },
    ...instructors.map((person) => ({
      value: person.staffMembershipId,
      label: person.name ?? tc("instructor.unnamed"),
    })),
  ];

  const save = useMutation({
    mutationFn: async (changes: GymClassOccurrenceUpdateRequest) =>
      (
        await callWithSession((init) =>
          updateGymClassOccurrence(gymId, base.occurrence_id, changes, init),
        )
      ).occurrence,
    onSuccess: (saved) => {
      toast.success(t("saved", { title: saved.title }));
      void refresh.now();
      onClose();
    },
    onError: async (error) => {
      refresh.later();
      if (applyFieldErrors(error, form.setError, tc)) return;
      const next = timetableProblem(error);
      setProblem(next);
      if (isOutdated(next)) {
        const latest = await callWithSession((init) =>
          getGymClassOccurrence(gymId, base.occurrence_id, init),
        ).catch(() => null);
        if (latest) {
          setBase(latest.occurrence);
          // The latest class, with only the user's own edits on top: saving again
          // never writes back a field someone else changed meanwhile.
          form.reset(valuesOf(latest.occurrence), { keepDirtyValues: true });
        }
      }
    },
  });
  const pending = save.isPending;

  const submit = form.handleSubmit((values) => {
    setProblem(null);
    const changes: GymClassOccurrenceUpdateRequest = { expected_revision: base.revision };
    if (resolution.kind === "invalid") {
      form.setError("time", { message: tc("time.invalid") });
      return;
    }
    if (resolution.kind === "overlap" && values.occurrence === "") {
      form.setError("occurrence", { message: tc("wallTime.required") });
      return;
    }
    const at =
      resolution.kind === "exact"
        ? toRfc3339(resolution.at)
        : resolution.kind === "overlap"
          ? toRfc3339(values.occurrence === "first" ? resolution.first : resolution.second)
          : (() => {
              // A skipped wall time, sent as written: the backend refuses it.
              const wall = Date.parse(`${values.date}T${values.time}:00Z`);
              const offset = zoneOffsetMinutes(zone, new Date(wall - 24 * 60 * 60 * 1000));
              return `${values.date}T${values.time}:00${formatOffset(offset)}`;
            })();
    if (resolution.kind === "gap" || Date.parse(at) !== Date.parse(base.starts_at))
      changes.starts_at = at;
    if (values.venueId !== base.venue.venue_id) changes.venue_id = values.venueId;
    const instructor = values.instructorId === NONE ? null : values.instructorId;
    if (instructor !== (base.instructor?.staff_membership_id ?? null))
      changes.instructor_staff_membership_id = instructor;
    if (Number(values.duration) !== base.duration_minutes)
      changes.duration_minutes = Number(values.duration);
    if (Number(values.capacity) !== base.capacity) changes.capacity = Number(values.capacity);
    if (Object.keys(changes).length === 1) return onClose();
    save.mutate(changes);
  });

  const today = wallTimeOf(new Date(), zone).date;

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="grid gap-4"
      data-reschedule-form={base.occurrence_id}
    >
      <DialogHeader>
        <DialogTitle>{t("title", { title: base.title })}</DialogTitle>
        <DialogDescription>
          {base.series_id === null ? t("leadOnce") : t("leadSeries")}
        </DialogDescription>
      </DialogHeader>
      <p className="type-caption text-muted-foreground" data-reschedule-current>
        {t("now", { when: when(base), venue: base.venue.name })}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          helpTone="muted"
          id={ids.date}
          label={tc("date.label")}
          error={errors.date?.message}
        >
          <Input
            id={ids.date}
            type="date"
            fieldSize="lg"
            min={today}
            data-field="date"
            aria-invalid={errors.date ? true : undefined}
            aria-describedby={errors.date ? describedBy(ids.date) : undefined}
            disabled={pending}
            {...form.register("date", { required: tc("date.required") })}
          />
        </FormField>
        <FormField
          helpTone="muted"
          id={ids.time}
          label={tc("time.labelIn", { zone })}
          error={errors.time?.message}
        >
          <Input
            id={ids.time}
            type="time"
            fieldSize="lg"
            data-field="time"
            aria-invalid={errors.time || resolution.kind === "gap" ? true : undefined}
            aria-describedby={errors.time ? describedBy(ids.time) : undefined}
            disabled={pending}
            {...form.register("time", {
              required: tc("time.required"),
              onChange: () => form.setValue("occurrence", ""),
            })}
          />
        </FormField>
      </div>
      <WallTimeNotice
        resolution={resolution}
        zone={zone}
        time={time}
        occurrence={occurrence}
        onOccurrence={(value) => {
          form.setValue("occurrence", value);
          form.clearErrors("occurrence");
        }}
        error={errors.occurrence?.message}
        disabled={pending}
      />
      <Controller
        control={form.control}
        name="venueId"
        render={({ field }) => (
          <SelectField
            id={ids.venue}
            label={tc("venue.label")}
            help={t("venueZone", { zone })}
            error={errors.venueId?.message}
            value={field.value}
            onChange={field.onChange}
            options={venueOptions}
            disabled={pending}
            field="venue_id"
          />
        )}
      />
      <Controller
        control={form.control}
        name="instructorId"
        render={({ field }) => (
          <SelectField
            id={ids.instructor}
            label={tc("instructor.label")}
            help={base.needs_instructor ? t("needsInstructor") : tc("instructor.help")}
            error={errors.instructorId?.message}
            value={field.value}
            onChange={field.onChange}
            options={instructorOptions}
            disabled={pending}
            field="instructor_staff_membership_id"
          />
        )}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField
          id={ids.duration}
          label={tc("duration.label")}
          error={errors.duration?.message}
          unit={tc("duration.unit")}
          disabled={pending}
          field="duration_minutes"
          registration={form.register("duration", {
            validate: (value) => wholeIn(value, 5, 480) || tc("duration.invalid"),
          })}
        />
        <NumberField
          id={ids.capacity}
          label={tc("capacity.label")}
          error={errors.capacity?.message}
          unit={tc("capacity.unit")}
          disabled={pending}
          field="capacity"
          registration={form.register("capacity", {
            validate: (value) => wholeIn(value, 1, 500) || tc("capacity.invalid"),
          })}
        />
      </div>
      {problem && isOutdated(problem) && (
        <Notice tone="amber" role="status" data-occurrence-latest={base.revision}>
          <strong className="font-extrabold">{t("changed.title")}</strong>{" "}
          {base.status === "cancelled"
            ? t("changed.cancelled")
            : t("changed.body", { when: when(base), venue: base.venue.name })}
        </Notice>
      )}
      {problem && !isOutdated(problem) && <ProblemNotice problem={problem} />}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button
          type="submit"
          aria-busy={pending || undefined}
          disabled={pending || base.status === "cancelled"}
        >
          {pending && <Spinner />}
          {pending ? t("saving") : problem?.kind === "stale" ? t("saveAgain") : t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * "Cancel class" (SF-97 `cancelGymClassOccurrence`): one dated class,
 * confirmed with its date, time, zone and venue. Its series and every other
 * class stay as they are. The class stays in the timetable as cancelled
 * (the backend's status); nobody is refunded or notified here, because
 * bookings do not exist. A class changed meanwhile is shown as it is now
 * and needs a new confirmation.
 */
export function CancelOccurrenceDialog({
  gymId,
  occurrence: initial,
  trigger,
}: {
  gymId: string;
  occurrence: GymClassOccurrence;
  trigger: ReactNode;
}) {
  const t = useTranslations("gymConsole.timetable.cancelClass");
  const when = useClassWhen();
  const [base, setBase] = useState(initial);
  return (
    <ConfirmDialog
      gymId={gymId}
      trigger={trigger}
      marker={{ "data-cancel-class": base.occurrence_id }}
      title={t("title", { title: base.title })}
      description={t("body", { when: when(base), venue: base.venue.name })}
      confirmLabel={t("confirm")}
      pendingLabel={t("pending")}
      keepLabel={t("keep")}
      run={() =>
        callWithSession((init) =>
          cancelGymClassOccurrence(
            gymId,
            base.occurrence_id,
            { expected_revision: base.revision },
            init,
          ),
        )
      }
      onDone={() => toast.success(t("done", { title: base.title }))}
      onProblem={async (problem) => {
        if (!isOutdated(problem)) return;
        const latest = await callWithSession((init) =>
          getGymClassOccurrence(gymId, base.occurrence_id, init),
        ).catch(() => null);
        if (latest) setBase(latest.occurrence);
      }}
    >
      {({ problem }) => (
        <>
          <ul className="flex list-disc flex-col gap-1 pl-5 type-body-sm text-muted-foreground">
            {base.series_id !== null && <li>{t("onlyThis")}</li>}
            <li>{t("stays")}</li>
            <li>{t("noBookings")}</li>
          </ul>
          {problem?.kind === "stale" && (
            <Notice tone="amber" role="status" data-occurrence-latest={base.revision}>
              {t("changed", { when: when(base), venue: base.venue.name })}
            </Notice>
          )}
        </>
      )}
    </ConfirmDialog>
  );
}

function applyFieldErrors(
  error: unknown,
  setError: UseFormSetError<Values>,
  t: ReturnType<typeof useTranslations<"gymConsole.timetable.classForm">>,
): boolean {
  if (!isApiError(error) || error.code !== "validation_error") return false;
  const codes = error.fieldCodes;
  const startsAt = codes.starts_at ?? [];
  const fields: [string, keyof Values, string][] = [
    ["venue_id", "venueId", t("venue.invalid")],
    ["instructor_staff_membership_id", "instructorId", t("instructor.invalid")],
    ["duration_minutes", "duration", t("duration.invalid")],
    [
      "capacity",
      "capacity",
      codes.capacity?.includes("out_of_range") ? t("capacity.overVenue") : t("capacity.invalid"),
    ],
    [
      "starts_at",
      "time",
      startsAt.includes("invalid_format")
        ? t("wallTime.gapRefused")
        : startsAt.includes("out_of_range")
          ? t("time.window")
          : t("time.invalid"),
    ],
  ];
  let applied = false;
  for (const [field, name, message] of fields) {
    if (codes[field] === undefined) continue;
    setError(name, { type: "server", message });
    applied = true;
  }
  return applied;
}
