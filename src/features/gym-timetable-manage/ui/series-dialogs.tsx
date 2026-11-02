"use client";

import { useMutation } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { Controller, useForm, type UseFormSetError } from "react-hook-form";
import { toast } from "sonner";

import {
  addDays,
  daysBetween,
  printable,
  type GymClassSeries,
  type GymInstructor,
  type GymVenue,
} from "@/entities/gym-timetable";
import { callWithSession } from "@/entities/session";
import {
  cancelGymClassSeries,
  generateGymClassSeries,
  getGymClassSeries,
  updateGymClassSeries,
} from "@/shared/api/generated/endpoints/gym-timetable/gym-timetable";
import type { GymClassSeriesUpdateRequest } from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
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

import { useDialogRefresh, useTimetableRefresh } from "../model/refresh";
import { isOutdated, timetableProblem, type TimetableProblem } from "../model/timetable-problem";
import { ConfirmDialog } from "./confirm-dialog";
import { NONE, NumberField, SelectField, useWeekdayName, WeekdayPicker, wholeIn } from "./fields";
import { ProblemNotice } from "./problem-text";
import { SkippedDates } from "./skipped-dates";

/** "Every Monday and Wednesday at 18:00 (Europe/Warsaw)". */
export function useSeriesRule() {
  const t = useTranslations("gymConsole.timetable.series");
  const format = useFormatter();
  const weekday = useWeekdayName();
  return (series: Pick<GymClassSeries, "weekdays" | "local_start_time" | "time_zone">) =>
    t("rule", {
      days: format.list(series.weekdays.map((day) => weekday(day, "long"))),
      time: series.local_start_time.slice(0, 5),
      zone: series.time_zone,
    });
}

/** "2 Nov 2026 – 31 Jan 2027". */
export function useSeriesPeriod() {
  const format = useFormatter();
  return (series: Pick<GymClassSeries, "starts_on" | "ends_on">) =>
    format.dateTimeRange(printable(series.starts_on), printable(series.ends_on), {
      dateStyle: "medium",
      timeZone: "UTC",
    });
}

type Values = {
  weekdays: number[];
  time: string;
  endsOn: string;
  venueId: string;
  instructorId: string;
  duration: string;
  capacity: string;
};

function valuesOf(series: GymClassSeries): Values {
  return {
    weekdays: [...series.weekdays],
    time: series.local_start_time.slice(0, 5),
    endsOn: series.ends_on,
    venueId: series.venue.venue_id,
    instructorId: series.instructor?.staff_membership_id ?? NONE,
    duration: String(series.duration_minutes),
    capacity: String(series.capacity),
  };
}

/**
 * "Edit series" (SF-97 `updateGymClassSeries`): the series as a whole, the
 * only scope the backend has (no "this and following" split exists, so none
 * is offered). Its weekdays, wall time, last date, venue (same zone),
 * instructor, duration and capacity; the template, zone and first date never
 * change. The dialog says what the backend does: classes still to come that
 * were not changed or cancelled on their own follow the new rule, dates the
 * rule no longer has are cancelled, new dates are scheduled; past classes
 * and individually changed or cancelled ones stay as they are. The result
 * shows the backend's counts and skipped dates.
 */
export function EditSeriesDialog({
  gymId,
  series,
  venues,
  instructors,
  trigger,
}: {
  gymId: string;
  series: GymClassSeries;
  venues: readonly GymVenue[];
  instructors: readonly GymInstructor[];
  trigger: ReactNode;
}) {
  const t = useTranslations("gymConsole.timetable.seriesForm");
  const [open, setOpen] = useState(false);
  const refresh = useDialogRefresh(gymId);
  const toggle = (next: boolean) => {
    setOpen(next);
    if (!next) refresh.onClose();
  };
  return (
    <Dialog open={open} onOpenChange={toggle}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent closeLabel={t("close")} className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        {open && (
          <SeriesForm
            gymId={gymId}
            series={series}
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

function SeriesForm({
  gymId,
  series: initial,
  venues,
  instructors,
  refresh,
  onClose,
}: {
  gymId: string;
  series: GymClassSeries;
  venues: readonly GymVenue[];
  instructors: readonly GymInstructor[];
  refresh: ReturnType<typeof useDialogRefresh>;
  onClose: () => void;
}) {
  const t = useTranslations("gymConsole.timetable.seriesForm");
  const tc = useTranslations("gymConsole.timetable.classForm");
  const rule = useSeriesRule();
  const period = useSeriesPeriod();
  const ids = {
    days: useId(),
    time: useId(),
    endsOn: useId(),
    venue: useId(),
    instructor: useId(),
    duration: useId(),
    capacity: useId(),
  };
  const [base, setBase] = useState(initial);
  const [problem, setProblem] = useState<TimetableProblem | null>(null);
  const [saved, setSaved] = useState<GymClassSeries | null>(null);
  const form = useForm<Values>({ defaultValues: valuesOf(initial), mode: "onTouched" });
  const { errors } = form.formState;
  const zone = base.time_zone;
  const sameZone = venues.filter((venue) => venue.time_zone === zone);
  const venueOptions = [
    ...sameZone.map((venue) => ({ value: venue.venue_id, label: venue.name })),
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
    mutationFn: async (changes: GymClassSeriesUpdateRequest) =>
      (await callWithSession((init) => updateGymClassSeries(gymId, base.series_id, changes, init)))
        .series,
    onSuccess: (next) => {
      void refresh.now();
      setSaved(next);
    },
    onError: async (error) => {
      refresh.later();
      if (applyFieldErrors(error, form.setError, t, tc)) return;
      const next = timetableProblem(error);
      setProblem(next);
      if (isOutdated(next)) {
        const latest = await callWithSession((init) =>
          getGymClassSeries(gymId, base.series_id, init),
        ).catch(() => null);
        if (latest) {
          setBase(latest.series);
          // The latest series, with only the user's own edits on top.
          form.reset(valuesOf(latest.series), { keepDirtyValues: true });
        }
      }
    },
  });
  const pending = save.isPending;

  if (saved) {
    const skipped = saved.skipped_dates ?? [];
    return (
      <div className="grid gap-4" data-series-saved={saved.series_id}>
        <DialogHeader>
          <DialogTitle>{t("savedTitle")}</DialogTitle>
          <DialogDescription role="status">
            {t("savedBody", { rule: rule(saved), period: period(saved) })}
          </DialogDescription>
        </DialogHeader>
        {skipped.length > 0 && <SkippedDates dates={skipped} zone={saved.time_zone} />}
        <DialogFooter>
          <Button onClick={onClose}>{t("done")}</Button>
        </DialogFooter>
      </div>
    );
  }

  const submit = form.handleSubmit((values) => {
    setProblem(null);
    const changes: GymClassSeriesUpdateRequest = { expected_revision: base.revision };
    if (values.weekdays.join() !== base.weekdays.join()) changes.weekdays = values.weekdays;
    if (values.time !== base.local_start_time.slice(0, 5)) changes.local_start_time = values.time;
    if (values.endsOn !== base.ends_on) changes.ends_on = values.endsOn;
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

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="grid gap-4"
      data-series-form={base.series_id}
    >
      <DialogHeader>
        <DialogTitle>{t("title", { title: base.title })}</DialogTitle>
        <DialogDescription>{t("lead")}</DialogDescription>
      </DialogHeader>
      <p className="type-caption text-muted-foreground">
        {t("now", { rule: rule(base), period: period(base) })}
      </p>
      <Controller
        control={form.control}
        name="weekdays"
        rules={{ validate: (value) => value.length > 0 || tc("weekly.daysRequired") }}
        render={({ field }) => (
          <WeekdayPicker
            id={ids.days}
            legend={tc("weekly.days")}
            value={field.value}
            onChange={field.onChange}
            error={errors.weekdays?.message}
            disabled={pending}
          />
        )}
      />
      <div className="grid gap-3 sm:grid-cols-2">
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
            data-field="local_start_time"
            aria-invalid={errors.time ? true : undefined}
            aria-describedby={errors.time ? describedBy(ids.time) : undefined}
            disabled={pending}
            {...form.register("time", { required: tc("time.required") })}
          />
        </FormField>
        <FormField
          helpTone="muted"
          id={ids.endsOn}
          label={tc("weekly.endsOn")}
          help={t("endsOnHelp")}
          error={errors.endsOn?.message}
        >
          <Input
            id={ids.endsOn}
            type="date"
            fieldSize="lg"
            min={base.starts_on}
            max={addDays(base.starts_on, 365)}
            data-field="ends_on"
            aria-invalid={errors.endsOn ? true : undefined}
            aria-describedby={describedBy(ids.endsOn)}
            disabled={pending}
            {...form.register("endsOn", {
              required: tc("weekly.endsOnRequired"),
              validate: (value) =>
                (daysBetween(base.starts_on, value) >= 0 &&
                  daysBetween(base.starts_on, value) <= 365) ||
                tc("weekly.tooLong"),
            })}
          />
        </FormField>
      </div>
      <Controller
        control={form.control}
        name="venueId"
        render={({ field }) => (
          <SelectField
            id={ids.venue}
            label={tc("venue.label")}
            help={t("venueZone", { zone })}
            value={field.value}
            onChange={field.onChange}
            options={venueOptions}
            error={errors.venueId?.message}
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
            help={tc("instructor.help")}
            value={field.value}
            onChange={field.onChange}
            options={instructorOptions}
            error={errors.instructorId?.message}
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
      <Notice tone="muted" data-series-impact>
        <strong className="font-extrabold">{t("impact.title")}</strong>
        <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4">
          <li>{t("impact.follow")}</li>
          <li>{t("impact.dropped")}</li>
          <li>{t("impact.kept")}</li>
          <li>{t("impact.past")}</li>
        </ul>
      </Notice>
      {problem && isOutdated(problem) && (
        <Notice tone="amber" role="status" data-series-latest={base.revision}>
          <strong className="font-extrabold">{t("changed.title")}</strong>{" "}
          {base.status === "cancelled"
            ? t("changed.cancelled")
            : t("changed.body", { rule: rule(base), period: period(base) })}
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
 * "Cancel series" (SF-97 `cancelGymClassSeries`): every class of the series
 * still to come is cancelled (the backend's `series_cancelled`); past
 * classes stay. A stronger confirmation than one class: the user ticks that
 * they understand the scope before the action is offered.
 */
export function CancelSeriesDialog({
  gymId,
  series: initial,
  trigger,
}: {
  gymId: string;
  series: GymClassSeries;
  trigger: ReactNode;
}) {
  const t = useTranslations("gymConsole.timetable.cancelSeries");
  const rule = useSeriesRule();
  const period = useSeriesPeriod();
  const checkId = useId();
  const [base, setBase] = useState(initial);
  const [understood, setUnderstood] = useState(false);
  return (
    <ConfirmDialog
      gymId={gymId}
      trigger={trigger}
      marker={{ "data-cancel-series": base.series_id }}
      title={t("title", { title: base.title })}
      description={t("body", { rule: rule(base), period: period(base) })}
      confirmLabel={t("confirm")}
      pendingLabel={t("pending")}
      keepLabel={t("keep")}
      ready={understood}
      run={() =>
        callWithSession((init) =>
          cancelGymClassSeries(gymId, base.series_id, { expected_revision: base.revision }, init),
        )
      }
      onDone={() => toast.success(t("done", { title: base.title }))}
      onProblem={async (problem) => {
        if (!isOutdated(problem)) return;
        setUnderstood(false);
        const latest = await callWithSession((init) =>
          getGymClassSeries(gymId, base.series_id, init),
        ).catch(() => null);
        if (latest) setBase(latest.series);
      }}
    >
      {({ problem, pending }) => (
        <>
          <ul className="flex list-disc flex-col gap-1 pl-5 type-body-sm text-muted-foreground">
            <li>{t("future")}</li>
            <li>{t("past")}</li>
            <li>{t("final")}</li>
            <li>{t("noBookings")}</li>
          </ul>
          <label htmlFor={checkId} className="flex items-start gap-2.5 type-body-sm font-bold">
            <Checkbox
              id={checkId}
              checked={understood}
              disabled={pending}
              onCheckedChange={(value) => setUnderstood(value === true)}
              data-cancel-series-understood
              className="mt-0.5"
            />
            {t("understand")}
          </label>
          {problem?.kind === "stale" && (
            <Notice tone="amber" role="status" data-series-latest={base.revision}>
              {t("changed", { rule: rule(base), period: period(base) })}
            </Notice>
          )}
        </>
      )}
    </ConfirmDialog>
  );
}

/**
 * "Check for missing classes" (SF-97 `generateGymClassSeries`): asks the
 * backend to schedule any date of the rule that has no class. Safe to repeat
 * (normally nothing is missing); the result is the backend's count.
 */
export function RepairSeriesButton({ gymId, seriesId }: { gymId: string; seriesId: string }) {
  const t = useTranslations("gymConsole.timetable.repair");
  const refresh = useTimetableRefresh(gymId);
  const [problem, setProblem] = useState<TimetableProblem | null>(null);
  const repair = useMutation({
    mutationFn: () => callWithSession((init) => generateGymClassSeries(gymId, seriesId, init)),
    onSuccess: ({ created_count }) => {
      setProblem(null);
      toast.success(created_count === 0 ? t("none") : t("created", { count: created_count }));
      void refresh();
    },
    onError: (error) => {
      setProblem(timetableProblem(error));
      void refresh();
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="self-start"
        aria-busy={repair.isPending || undefined}
        disabled={repair.isPending}
        onClick={() => repair.mutate()}
        data-series-repair
      >
        {repair.isPending && <Spinner />}
        {t("action")}
      </Button>
      {problem && <ProblemNotice problem={problem} />}
    </div>
  );
}

function applyFieldErrors(
  error: unknown,
  setError: UseFormSetError<Values>,
  t: ReturnType<typeof useTranslations<"gymConsole.timetable.seriesForm">>,
  tc: ReturnType<typeof useTranslations<"gymConsole.timetable.classForm">>,
): boolean {
  if (!isApiError(error) || error.code !== "validation_error") return false;
  const codes = error.fieldCodes;
  const fields: [string, keyof Values, string][] = [
    ["weekdays", "weekdays", tc("weekly.noDates")],
    ["local_start_time", "time", tc("time.invalid")],
    ["ends_on", "endsOn", tc("weekly.endsOnInvalid")],
    ["venue_id", "venueId", t("venueInvalid")],
    ["instructor_staff_membership_id", "instructorId", tc("instructor.invalid")],
    ["duration_minutes", "duration", tc("duration.invalid")],
    [
      "capacity",
      "capacity",
      codes.capacity?.includes("out_of_range") ? tc("capacity.overVenue") : tc("capacity.invalid"),
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
