"use client";

import { useMutation } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useState, type ReactNode } from "react";
import { Controller, useForm, useWatch, type UseFormSetError } from "react-hook-form";
import { toast } from "sonner";

import {
  addDays,
  daysBetween,
  printable,
  type GymClassOccurrence,
  type GymClassSeries,
  type GymClassTemplate,
  type GymInstructor,
  type GymVenue,
} from "@/entities/gym-timetable";
import { callWithSession } from "@/entities/session";
import {
  createGymClassOccurrence,
  createGymClassSeries,
} from "@/shared/api/generated/endpoints/gym-timetable/gym-timetable";
import { isApiError } from "@/shared/api/http/api-error";
import {
  formatOffset,
  resolveWallTime,
  toRfc3339,
  wallTimeOf,
  zoneOffsetMinutes,
  type WallTimeResolution,
} from "@/shared/lib/time-zone";
import { cn } from "@/shared/lib/utils";
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

import { useDialogRefresh, useRequestKey } from "../model/refresh";
import { timetableProblem, type TimetableProblem } from "../model/timetable-problem";
import {
  chipClass,
  NONE,
  NumberField,
  SelectField,
  useWeekdayName,
  WallTimeNotice,
  WeekdayPicker,
  wholeIn,
} from "./fields";
import { ProblemNotice } from "./problem-text";
import { SkippedDates } from "./skipped-dates";

type Kind = "once" | "weekly";

type Values = {
  templateId: string;
  venueId: string;
  instructorId: string;
  duration: string;
  capacity: string;
  date: string;
  time: string;
  occurrence: "" | "first" | "second";
  weekdays: number[];
  startsOn: string;
  endsOn: string;
};

/** What a create brought back: one class, or a series and what the backend did with its dates. */
export type CreatedClass =
  { kind: "once"; occurrence: GymClassOccurrence } | { kind: "weekly"; series: GymClassSeries };

/**
 * "+ Class" (SF-97 `createGymClassOccurrence` / `createGymClassSeries`): a
 * one-time class or a weekly class, chosen explicitly, from a template, in
 * one of the gym's active venues, with an eligible instructor or none.
 *
 * Times are wall times in the venue's zone, shown with it. A one-time class
 * is sent as an instant with the zone's own offset: a wall time the clocks
 * skip is said before sending and refused by the backend (never moved to
 * the next hour), and a repeated one is sent only with the instant the user
 * picked. A weekly class sends its rule; the backend materializes it and
 * the result shows exactly what it scheduled and which dates it skipped
 * (never "all scheduled" when some were not). No class is built on the
 * client. Each attempt carries one `client_request_id`; sending the same
 * class again after a lost answer reuses it, so nothing is created twice.
 */
export function ClassDialog({
  gymId,
  venues,
  templates,
  instructors,
  initialDate,
  trigger,
  onCreated,
}: {
  gymId: string;
  venues: readonly GymVenue[];
  templates: readonly GymClassTemplate[];
  instructors: readonly GymInstructor[];
  /** A wall date to start from (the day the user is looking at). */
  initialDate?: string;
  trigger: ReactNode;
  onCreated: (created: CreatedClass) => void;
}) {
  const t = useTranslations("gymConsole.timetable.classForm");
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
        {open &&
          (venues.length === 0 || templates.length === 0 ? (
            <Missing
              venues={venues.length}
              templates={templates.length}
              onClose={() => toggle(false)}
            />
          ) : (
            <ClassForm
              gymId={gymId}
              venues={venues}
              templates={templates}
              instructors={instructors}
              initialDate={initialDate}
              refresh={refresh}
              onCreated={onCreated}
              onClose={() => toggle(false)}
            />
          ))}
      </DialogContent>
    </Dialog>
  );
}

/** A class needs a venue and a template first: said, with nothing to fill in. */
function Missing({
  venues,
  templates,
  onClose,
}: {
  venues: number;
  templates: number;
  onClose: () => void;
}) {
  const t = useTranslations("gymConsole.timetable.classForm.missing");
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription role="status">
          {venues === 0 && templates === 0 ? t("both") : venues === 0 ? t("venue") : t("template")}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={onClose}>{t("done")}</Button>
      </DialogFooter>
    </>
  );
}

/** The zone's offset just before a wall time, to send a skipped time as written. */
function asWritten(date: string, time: string, zone: string): string {
  const wall = Date.parse(`${date}T${time}:00Z`);
  const offset = zoneOffsetMinutes(zone, new Date(wall - 24 * 60 * 60 * 1000));
  return `${date}T${time}:00${formatOffset(offset)}`;
}

function ClassForm({
  gymId,
  venues,
  templates,
  instructors,
  initialDate,
  refresh,
  onCreated,
  onClose,
}: {
  gymId: string;
  venues: readonly GymVenue[];
  templates: readonly GymClassTemplate[];
  instructors: readonly GymInstructor[];
  initialDate?: string;
  refresh: ReturnType<typeof useDialogRefresh>;
  onCreated: (created: CreatedClass) => void;
  onClose: () => void;
}) {
  const t = useTranslations("gymConsole.timetable.classForm");
  const format = useFormatter();
  const weekday = useWeekdayName();
  const ids = {
    template: useId(),
    venue: useId(),
    instructor: useId(),
    duration: useId(),
    capacity: useId(),
    date: useId(),
    time: useId(),
    startsOn: useId(),
    endsOn: useId(),
    weekdays: useId(),
  };
  const [kind, setKind] = useState<Kind>("once");
  const [problem, setProblem] = useState<TimetableProblem | null>(null);
  const [series, setSeries] = useState<GymClassSeries | null>(null);
  const requestKey = useRequestKey();

  const only = templates.length === 1 ? templates[0] : undefined;
  const form = useForm<Values>({
    defaultValues: {
      templateId: only?.template_id ?? "",
      venueId: only?.default_venue_id ?? (venues.length === 1 ? (venues[0]?.venue_id ?? "") : ""),
      instructorId: only?.default_instructor?.staff_membership_id ?? NONE,
      duration: only ? String(only.default_duration_minutes) : "60",
      capacity: only ? String(only.default_capacity) : "",
      date: initialDate ?? "",
      time: "",
      occurrence: "",
      weekdays: [],
      startsOn: initialDate ?? "",
      endsOn: "",
    },
    mode: "onTouched",
  });
  const { errors } = form.formState;
  const [venueId, date, time, occurrence, weekdays, startsOn, endsOn] = useWatch({
    control: form.control,
    name: ["venueId", "date", "time", "occurrence", "weekdays", "startsOn", "endsOn"],
  });
  const venue = venues.find((item) => item.venue_id === venueId);
  const zone = venue?.time_zone ?? null;
  const today = zone ? wallTimeOf(new Date(), zone).date : undefined;
  const resolution: WallTimeResolution =
    kind === "once" && zone && date && time
      ? resolveWallTime(date, time, zone)
      : { kind: "invalid" };

  const create = useMutation({
    mutationFn: async (values: Values): Promise<CreatedClass> => {
      const common = {
        template_id: values.templateId,
        venue_id: values.venueId,
        duration_minutes: Number(values.duration),
        capacity: Number(values.capacity),
        instructor_staff_membership_id: values.instructorId === NONE ? null : values.instructorId,
      };
      if (kind === "once") {
        const at =
          resolution.kind === "exact"
            ? toRfc3339(resolution.at)
            : resolution.kind === "overlap"
              ? toRfc3339(values.occurrence === "first" ? resolution.first : resolution.second)
              : asWritten(values.date, values.time, zone ?? "UTC");
        const body = { ...common, starts_at: at };
        const response = await callWithSession((init) =>
          createGymClassOccurrence(
            gymId,
            { ...body, client_request_id: requestKey.for(body) },
            init,
          ),
        );
        return { kind: "once", occurrence: response.occurrence };
      }
      const body = {
        ...common,
        weekdays: values.weekdays,
        local_start_time: values.time,
        starts_on: values.startsOn,
        ends_on: values.endsOn,
      };
      const response = await callWithSession((init) =>
        createGymClassSeries(gymId, { ...body, client_request_id: requestKey.for(body) }, init),
      );
      return { kind: "weekly", series: response.series };
    },
    onSuccess: (created) => {
      void refresh.now();
      onCreated(created);
      if (created.kind === "weekly") {
        // The result stays on screen: what was scheduled and what was skipped.
        setSeries(created.series);
        return;
      }
      toast.success(t("createdOnce", { title: created.occurrence.title }));
      onClose();
    },
    onError: (error) => {
      refresh.later();
      if (applyFieldErrors(error, form.setError, t, kind)) return;
      setProblem(timetableProblem(error));
    },
  });

  if (series) return <SeriesCreated series={series} onClose={onClose} />;

  const pending = create.isPending;
  const submit = form.handleSubmit((values) => {
    setProblem(null);
    if (kind === "once") {
      if (resolution.kind === "invalid") {
        form.setError("time", { message: t("time.invalid") });
        return form.setFocus("time");
      }
      if (resolution.kind === "overlap" && values.occurrence === "") {
        form.setError("occurrence", { message: t("wallTime.required") });
        return;
      }
    }
    create.mutate(values);
  });

  const templateOptions = templates.map((template) => ({
    value: template.template_id,
    label: template.title,
  }));
  const venueOptions = venues.map((item) => ({
    value: item.venue_id,
    label: t("venue.option", { name: item.name, zone: item.time_zone }),
  }));
  const instructorOptions = [
    { value: NONE, label: t("instructor.none") },
    ...instructors.map((person) => ({
      value: person.staffMembershipId,
      label: person.name ?? t("instructor.unnamed"),
    })),
  ];
  const chooseTemplate = (templateId: string) => {
    const template = templates.find((item) => item.template_id === templateId);
    form.setValue("templateId", templateId, { shouldValidate: true });
    if (!template) return;
    // The template's defaults, shown and editable: never sent unseen.
    form.setValue("duration", String(template.default_duration_minutes));
    form.setValue("capacity", String(template.default_capacity));
    if (template.default_venue_id && venues.some((v) => v.venue_id === template.default_venue_id))
      form.setValue("venueId", template.default_venue_id);
    form.setValue(
      "instructorId",
      template.default_instructor &&
        instructors.some(
          (p) => p.staffMembershipId === template.default_instructor?.staff_membership_id,
        )
        ? template.default_instructor.staff_membership_id
        : NONE,
    );
  };

  const summary =
    kind === "weekly" && weekdays.length > 0 && time && startsOn && endsOn && zone
      ? t("weekly.summary", {
          days: format.list(weekdays.map((day) => weekday(day, "long"))),
          time,
          zone,
          from: format.dateTime(printable(startsOn), { dateStyle: "medium", timeZone: "UTC" }),
          to: format.dateTime(printable(endsOn), { dateStyle: "medium", timeZone: "UTC" }),
        })
      : null;

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="grid gap-4"
      data-class-form={kind}
    >
      <DialogHeader>
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>{t("lead")}</DialogDescription>
      </DialogHeader>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 type-caption font-bold text-muted-foreground">
          {t("kind.label")}
        </legend>
        <div className="grid grid-cols-2 gap-2" data-field="kind">
          {(["once", "weekly"] as const).map((option) => (
            <label
              key={option}
              className={cn(chipClass, "h-auto flex-col items-start px-3.5 py-2.5 text-left")}
            >
              <input
                type="radio"
                name="class-kind"
                value={option}
                className="sr-only"
                checked={kind === option}
                disabled={pending}
                onChange={() => {
                  setKind(option);
                  setProblem(null);
                  requestKey.reset();
                }}
              />
              <span>{t(`kind.${option}`)}</span>
              <span className="type-caption text-muted-foreground">{t(`kind.${option}Hint`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Controller
        control={form.control}
        name="templateId"
        rules={{ required: t("template.required") }}
        render={({ field }) => (
          <SelectField
            id={ids.template}
            label={t("template.label")}
            error={errors.templateId?.message}
            value={field.value}
            onChange={chooseTemplate}
            options={templateOptions}
            placeholder={t("template.placeholder")}
            disabled={pending}
            field="template_id"
          />
        )}
      />
      <Controller
        control={form.control}
        name="venueId"
        rules={{ required: t("venue.required") }}
        render={({ field }) => (
          <SelectField
            id={ids.venue}
            label={t("venue.label")}
            help={zone ? t("venue.zone", { zone }) : undefined}
            error={errors.venueId?.message}
            value={field.value}
            onChange={field.onChange}
            options={venueOptions}
            placeholder={t("venue.placeholder")}
            disabled={pending}
            field="venue_id"
          />
        )}
      />

      {kind === "once" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            helpTone="muted"
            id={ids.date}
            label={t("date.label")}
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
              {...form.register("date", { required: t("date.required") })}
            />
          </FormField>
          <FormField
            helpTone="muted"
            id={ids.time}
            label={zone ? t("time.labelIn", { zone }) : t("time.label")}
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
                required: t("time.required"),
                onChange: () => form.setValue("occurrence", ""),
              })}
            />
          </FormField>
        </div>
      ) : (
        <>
          <Controller
            control={form.control}
            name="weekdays"
            rules={{ validate: (value) => value.length > 0 || t("weekly.daysRequired") }}
            render={({ field }) => (
              <WeekdayPicker
                id={ids.weekdays}
                legend={t("weekly.days")}
                value={field.value}
                onChange={field.onChange}
                error={errors.weekdays?.message}
                disabled={pending}
              />
            )}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField
              helpTone="muted"
              id={ids.time}
              label={zone ? t("time.labelIn", { zone }) : t("time.label")}
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
                {...form.register("time", { required: t("time.required") })}
              />
            </FormField>
            <FormField
              helpTone="muted"
              id={ids.startsOn}
              label={t("weekly.startsOn")}
              error={errors.startsOn?.message}
            >
              <Input
                id={ids.startsOn}
                type="date"
                fieldSize="lg"
                min={today}
                data-field="starts_on"
                aria-invalid={errors.startsOn ? true : undefined}
                aria-describedby={errors.startsOn ? describedBy(ids.startsOn) : undefined}
                disabled={pending}
                {...form.register("startsOn", { required: t("weekly.startsOnRequired") })}
              />
            </FormField>
            <FormField
              helpTone="muted"
              id={ids.endsOn}
              label={t("weekly.endsOn")}
              help={t("weekly.endsOnHelp")}
              error={errors.endsOn?.message}
            >
              <Input
                id={ids.endsOn}
                type="date"
                fieldSize="lg"
                min={startsOn || today}
                max={startsOn ? addDays(startsOn, 365) : undefined}
                data-field="ends_on"
                aria-invalid={errors.endsOn ? true : undefined}
                aria-describedby={describedBy(ids.endsOn)}
                disabled={pending}
                {...form.register("endsOn", {
                  required: t("weekly.endsOnRequired"),
                  validate: (value) => {
                    const from = form.getValues("startsOn");
                    if (!from || !value) return true;
                    if (daysBetween(from, value) < 0) return t("weekly.endsBefore");
                    return daysBetween(from, value) <= 365 || t("weekly.tooLong");
                  },
                })}
              />
            </FormField>
          </div>
          {summary && (
            <p
              className="type-body-sm text-muted-foreground"
              data-weekly-summary
              aria-live="polite"
            >
              {summary}
            </p>
          )}
          <Notice tone="muted">{t("weekly.dstNote")}</Notice>
        </>
      )}

      {kind === "once" && zone && (
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
      )}

      <Controller
        control={form.control}
        name="instructorId"
        render={({ field }) => (
          <SelectField
            id={ids.instructor}
            label={t("instructor.label")}
            help={instructors.length === 0 ? t("instructor.noneEligible") : t("instructor.help")}
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
          label={t("duration.label")}
          help={t("duration.help")}
          error={errors.duration?.message}
          unit={t("duration.unit")}
          disabled={pending}
          field="duration_minutes"
          registration={form.register("duration", {
            validate: (value) => wholeIn(value, 5, 480) || t("duration.invalid"),
          })}
        />
        <NumberField
          id={ids.capacity}
          label={t("capacity.label")}
          help={
            venue?.capacity
              ? t("capacity.venueLimit", { capacity: venue.capacity })
              : t("capacity.help")
          }
          error={errors.capacity?.message}
          unit={t("capacity.unit")}
          disabled={pending}
          field="capacity"
          registration={form.register("capacity", {
            validate: (value) => wholeIn(value, 1, 500) || t("capacity.invalid"),
          })}
        />
      </div>

      {problem?.kind === "unknown" ? (
        <Notice tone="coral" role="alert" data-timetable-problem="unknown">
          <strong className="font-extrabold">{t("unknown.title")}</strong> {t("unknown.body")}
        </Notice>
      ) : (
        problem && <ProblemNotice problem={problem} />
      )}

      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" aria-busy={pending || undefined} disabled={pending} data-class-submit>
          {pending && <Spinner />}
          {pending
            ? t("saving")
            : problem?.kind === "unknown"
              ? t("retry")
              : kind === "once"
                ? t("createOnce")
                : t("createWeekly")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * A weekly class as the backend created it: its rule, the classes it
 * scheduled (the backend's count) and every date it skipped, with why.
 */
function SeriesCreated({ series, onClose }: { series: GymClassSeries; onClose: () => void }) {
  const t = useTranslations("gymConsole.timetable.classForm.created");
  const skipped = series.skipped_dates ?? [];
  return (
    <div className="grid gap-4" data-series-created={series.series_id}>
      <DialogHeader>
        <DialogTitle>{skipped.length > 0 ? t("titleSkipped") : t("title")}</DialogTitle>
        <DialogDescription role="status">
          {series.scheduled_count === undefined
            ? t("bodyUncounted", { title: series.title })
            : t("body", { title: series.title, count: series.scheduled_count })}
        </DialogDescription>
      </DialogHeader>
      {skipped.length > 0 && <SkippedDates dates={skipped} zone={series.time_zone} />}
      <DialogFooter>
        <Button onClick={onClose}>{t("done")}</Button>
      </DialogFooter>
    </div>
  );
}

function applyFieldErrors(
  error: unknown,
  setError: UseFormSetError<Values>,
  t: ReturnType<typeof useTranslations<"gymConsole.timetable.classForm">>,
  kind: Kind,
): boolean {
  if (!isApiError(error) || error.code !== "validation_error") return false;
  const codes = error.fieldCodes;
  const startsAt = codes.starts_at ?? [];
  const fields: [string, keyof Values, string][] = [
    ["template_id", "templateId", t("template.invalid")],
    ["venue_id", "venueId", t("venue.invalid")],
    ["instructor_staff_membership_id", "instructorId", t("instructor.invalid")],
    ["duration_minutes", "duration", t("duration.invalid")],
    [
      "capacity",
      "capacity",
      // The client already checks 1–500: a range refusal is the venue's own limit.
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
    ["local_start_time", "time", t("time.invalid")],
    ["weekdays", kind === "weekly" ? "weekdays" : "time", t("weekly.noDates")],
    ["starts_on", "startsOn", t("weekly.startsOnInvalid")],
    ["ends_on", "endsOn", t("weekly.endsOnInvalid")],
  ];
  let applied = false;
  for (const [field, name, message] of fields) {
    if (codes[field] === undefined) continue;
    setError(name, { type: "server", message });
    applied = true;
  }
  return applied;
}
