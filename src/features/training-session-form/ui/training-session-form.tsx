"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, useWatch, type UseFormSetError } from "react-hook-form";

import {
  isUnavailable,
  useCoachRelationships,
  type CoachRelationship,
} from "@/entities/coach-relationship";
import {
  fighterLabel,
  TRAINING_TYPES,
  type CoachTrainingSession,
  type TrainingType,
} from "@/entities/training-session";
import type { TrainingSessionUpdateRequest } from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import {
  browserTimeZone,
  formatOffset,
  resolveWallTime,
  selectableTimeZones,
  toRfc3339,
  wallTimeOf,
  type WallInstant,
  type WallTimeResolution,
} from "@/shared/lib/time-zone";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Combobox } from "@/shared/ui/combobox";
import { ChoiceField, describedBy, FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";
import { Textarea } from "@/shared/ui/textarea";

import {
  useCreateTrainingSession,
  useRequestKey,
  useUpdateTrainingSession,
  type CreateBody,
} from "../model/save-session";

type Values = {
  relationshipId: string;
  title: string;
  trainingType: TrainingType | "";
  date: string;
  time: string;
  timeZone: string;
  duration: string;
  notes: string;
  /** Which of a repeated wall time's two instants (DST fall-back), when it is one. */
  occurrence: "" | "first" | "second";
};

type Problem = "failed" | "conflict" | "unavailable";

const TITLE_MAX = 80;
const NOTES_MAX = 2000;
const DURATION = /^\d+$/;

/** A training-type choice: a native radio drawn as the artboard's chip. */
const chipClass =
  "relative flex h-9 cursor-pointer items-center rounded-md border border-input px-3.5 type-body-sm font-extrabold text-muted-foreground transition-colors has-checked:border-accent-border has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-50";

/**
 * A new training session (WC3, reconciled in Claude Design 1792490047-d551):
 * one session for one fighter of the coach's active relationships, sent to
 * `createMyCoachTrainingSession` (SF-62) with one `client_request_id` per
 * attempt, reused when the same session is sent again. The fighters come
 * from the SF-56 roster; none is its own state, and planning not available
 * (`404`) is never shown as an empty roster.
 */
export function CreateTrainingSessionForm({
  onSaved,
}: {
  onSaved: (session: CoachTrainingSession) => void;
}) {
  const t = useTranslations("coachSessions");
  const roster = useCoachRelationships("active");
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = roster;

  // Every active relationship is a choice: read the remaining pages.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (roster.isError) {
    return isUnavailable(roster.error) ? (
      <FormNotice problem="unavailable" mode="create" />
    ) : (
      <div role="alert" className="flex flex-col items-start gap-2.5">
        <p className="type-title font-display">{t("failed.title")}</p>
        <p className="type-body-sm text-muted-foreground">{t("failed.body")}</p>
        <Button variant="quiet" onClick={() => void roster.refetch()}>
          {t("failed.retry")}
        </Button>
      </div>
    );
  }

  if (roster.data === undefined || roster.hasNextPage) return <FormSkeleton />;

  const relationships = roster.data.pages.flatMap((page) => page.relationships);
  if (relationships.length === 0) {
    return (
      <div role="status" className="flex flex-col items-start gap-2">
        <p className="type-title font-display">{t("form.noFighters.title")}</p>
        <p className="type-body-sm text-muted-foreground">{t("form.noFighters.body")}</p>
        <Button asChild className="mt-1">
          <Link href={routeHref("web.app.coach.fighters")}>{t("form.noFighters.action")}</Link>
        </Button>
      </div>
    );
  }

  return <SessionFields mode={{ kind: "create", relationships }} onSaved={onSaved} />;
}

/**
 * The form of a planned session (WCT3): the session's values, the fighter
 * fixed; only the fields the coach changed are sent to
 * `updateMyCoachTrainingSession`, so a change made meanwhile elsewhere is
 * not written back. A session completed or cancelled meanwhile (`409`) or
 * no longer reachable (`404`) is reported, never retried.
 */
export function EditTrainingSessionForm({
  session,
  onSaved,
}: {
  session: CoachTrainingSession;
  onSaved: (session: CoachTrainingSession) => void;
}) {
  if (session.status !== "planned") return <FormNotice problem="conflict" mode="edit" />;
  return <SessionFields mode={{ kind: "edit", session }} onSaved={onSaved} />;
}

type Mode =
  | { kind: "create"; relationships: CoachRelationship[] }
  | { kind: "edit"; session: CoachTrainingSession };

function initialValues(mode: Mode): Values {
  if (mode.kind === "create") {
    const only = mode.relationships.length === 1 ? mode.relationships[0] : undefined;
    return {
      relationshipId: only?.relationship_id ?? "",
      title: "",
      trainingType: "",
      date: "",
      time: "",
      timeZone: browserTimeZone() ?? "UTC",
      duration: "60",
      notes: "",
      occurrence: "",
    };
  }
  const { session } = mode;
  const start = new Date(session.starts_at);
  const wall = wallTimeOf(start, session.time_zone);
  const resolution = resolveWallTime(wall.date, wall.time, session.time_zone);
  return {
    relationshipId: session.relationship_id,
    title: session.title,
    trainingType: session.training_type,
    date: wall.date,
    time: wall.time,
    timeZone: session.time_zone,
    duration: String(session.duration_minutes),
    notes: session.notes ?? "",
    occurrence:
      resolution.kind === "overlap"
        ? resolution.first.instant.getTime() === start.getTime()
          ? "first"
          : "second"
        : "",
  };
}

/** The instant the form's schedule means, or why there is none. */
function chosenInstant(resolution: WallTimeResolution, occurrence: Values["occurrence"]) {
  if (resolution.kind === "exact") return resolution.at;
  if (resolution.kind === "overlap" && occurrence !== "")
    return occurrence === "first" ? resolution.first : resolution.second;
  return null;
}

function SessionFields({
  mode,
  onSaved,
}: {
  mode: Mode;
  onSaved: (session: CoachTrainingSession) => void;
}) {
  const t = useTranslations("coachSessions");
  const format = useFormatter();
  const editing = mode.kind === "edit";
  const [initial] = useState(() => initialValues(mode));
  const form = useForm<Values>({ defaultValues: initial, mode: "onTouched" });
  const { errors } = form.formState;
  const [problem, setProblem] = useState<Problem | null>(null);
  const requestKey = useRequestKey();
  const create = useCreateTrainingSession();
  const update = useUpdateTrainingSession(editing ? mode.session.id : "");
  const pending = create.isPending || update.isPending;

  const [date, time, timeZone] = useWatch({
    control: form.control,
    name: ["date", "time", "timeZone"],
  });
  const resolution = useMemo(
    () =>
      date && time && timeZone
        ? resolveWallTime(date, time, timeZone)
        : ({ kind: "invalid" } as const),
    [date, time, timeZone],
  );
  const zones = useMemo(
    () => selectableTimeZones([initial.timeZone]).map((zone) => ({ value: zone, label: zone })),
    [initial.timeZone],
  );
  const fighters = useMemo(
    () =>
      mode.kind === "create"
        ? mode.relationships.map((relationship) => ({
            value: relationship.relationship_id,
            label: relationshipLabel(relationship, (date) =>
              t("form.fighter.notShared", { date: format.dateTime(new Date(date), "date") }),
            ),
          }))
        : [],
    [mode, t, format],
  );

  // A new wall time drops an earlier choice between two repeated instants.
  useEffect(() => {
    if (resolution.kind !== "overlap" && form.getValues("occurrence") !== "")
      form.setValue("occurrence", "");
  }, [resolution.kind, form]);

  const error = (field: keyof Values) => errors[field]?.message;
  const control = (field: keyof Values, id: string) => ({
    id,
    "aria-invalid": errors[field] ? true : undefined,
    "aria-describedby": describedBy(id),
  });

  const submit = form.handleSubmit((values) => {
    setProblem(null);
    if (resolution.kind === "gap") return form.setFocus("time");
    if (resolution.kind === "invalid") {
      form.setError("time", { message: t("form.time.invalid") });
      return form.setFocus("time");
    }
    const at = chosenInstant(resolution, values.occurrence);
    if (at === null) {
      form.setError("occurrence", { message: t("form.overlap.required") });
      return;
    }

    const notes = values.notes.trim();
    const onError = (failure: unknown) =>
      setProblem(serverProblem(failure, form.setError, t, requestKey.reset));

    if (mode.kind === "create") {
      const body: CreateBody = {
        relationship_id: values.relationshipId,
        title: values.title.trim(),
        training_type: values.trainingType as TrainingType,
        starts_at: toRfc3339(at),
        time_zone: values.timeZone,
        duration_minutes: Number(values.duration),
        ...(notes === "" ? {} : { notes }),
      };
      create.mutate(
        { body, key: requestKey.for(body) },
        { onSuccess: (session) => onSaved(session), onError },
      );
      return;
    }

    const changes = changedFields(mode.session, values, at);
    if (Object.keys(changes).length === 0) return onSaved(mode.session);
    update.mutate(changes, { onSuccess: (session) => onSaved(session), onError });
  });

  return (
    <form
      noValidate
      aria-label={editing ? t("form.editTitle") : t("form.newTitle")}
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-4"
    >
      {mode.kind === "create" ? (
        <FormField
          id="session-fighter"
          label={t("form.fighter.label")}
          help={t("form.fighter.hint")}
          error={error("relationshipId")}
        >
          <Controller
            control={form.control}
            name="relationshipId"
            rules={{ required: t("form.fighter.required") }}
            render={({ field }) => (
              <Combobox
                id="session-fighter"
                aria-describedby={describedBy("session-fighter")}
                value={field.value || null}
                onValueChange={field.onChange}
                options={fighters}
                placeholder={t("form.fighter.placeholder")}
                searchLabel={t("form.fighter.search")}
                emptyLabel={t("form.fighter.empty")}
                invalid={errors.relationshipId !== undefined}
                disabled={pending}
              />
            )}
          />
        </FormField>
      ) : (
        <FormField
          id="session-fighter"
          label={t("form.fighter.label")}
          help={t("form.fighter.fixed")}
        >
          <Input
            id="session-fighter"
            fieldSize="lg"
            readOnly
            aria-describedby={describedBy("session-fighter")}
            value={fighterName(mode.session) ?? t("planner.fighterNotShared")}
            className="bg-muted"
          />
        </FormField>
      )}

      <FormField id="session-title" label={t("form.title.label")} error={error("title")}>
        <Input
          {...control("title", "session-title")}
          fieldSize="lg"
          maxLength={TITLE_MAX}
          disabled={pending}
          {...form.register("title", {
            validate: (value) =>
              (value.trim().length > 0 && value.trim().length <= TITLE_MAX) ||
              t("form.title.invalid"),
          })}
        />
      </FormField>

      <ChoiceField id="session-type" legend={t("form.type.label")} error={error("trainingType")}>
        <div data-field="training_type" className="flex flex-wrap gap-2">
          {TRAINING_TYPES.map((type) => (
            <label key={type} className={chipClass}>
              <input
                type="radio"
                value={type}
                className="sr-only"
                disabled={pending}
                {...form.register("trainingType", { required: t("form.type.required") })}
              />
              {t(`types.${type}`)}
            </label>
          ))}
        </div>
      </ChoiceField>

      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id="session-date" label={t("form.date.label")} error={error("date")}>
          <Input
            {...control("date", "session-date")}
            type="date"
            fieldSize="lg"
            disabled={pending}
            {...form.register("date", { required: t("form.date.required") })}
          />
        </FormField>
        <FormField id="session-time" label={t("form.time.label")} error={error("time")}>
          <Input
            {...control("time", "session-time")}
            type="time"
            fieldSize="lg"
            disabled={pending}
            aria-invalid={errors.time || resolution.kind === "gap" ? true : undefined}
            {...form.register("time", { required: t("form.time.required") })}
          />
        </FormField>
        <FormField id="session-zone" label={t("form.zone.label")} error={error("timeZone")}>
          <Controller
            control={form.control}
            name="timeZone"
            rules={{ required: t("form.zone.required") }}
            render={({ field }) => (
              <Combobox
                id="session-zone"
                aria-describedby={describedBy("session-zone")}
                value={field.value || null}
                onValueChange={field.onChange}
                options={zones}
                placeholder={t("form.zone.label")}
                searchLabel={t("form.zone.search")}
                emptyLabel={t("form.zone.empty")}
                invalid={errors.timeZone !== undefined}
                disabled={pending}
              />
            )}
          />
        </FormField>
      </div>

      {resolution.kind === "gap" && (
        <Notice tone="amber" role="alert" data-schedule="gap">
          <strong className="font-extrabold">{t("form.gap.title")}</strong>{" "}
          {t("form.gap.body", { zone: timeZone })}
        </Notice>
      )}
      {resolution.kind === "overlap" && (
        <Overlap
          resolution={resolution}
          zone={timeZone}
          time={time}
          error={error("occurrence")}
          disabled={pending}
          register={form.register("occurrence")}
        />
      )}

      <FormField
        id="session-duration"
        label={t("form.duration.label")}
        help={t("form.duration.hint")}
        error={error("duration")}
        className="max-w-56"
      >
        <div className="relative">
          <Input
            {...control("duration", "session-duration")}
            inputMode="numeric"
            fieldSize="lg"
            className="pr-20"
            disabled={pending}
            {...form.register("duration", {
              validate: (value) =>
                (DURATION.test(value.trim()) && Number(value) >= 5 && Number(value) <= 600) ||
                t("form.duration.invalid"),
            })}
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center type-caption text-faint-foreground"
          >
            {t("form.duration.unit")}
          </span>
        </div>
      </FormField>

      <FormField
        id="session-notes"
        label={t("form.notes.label")}
        help={t("form.notes.hint")}
        error={error("notes")}
      >
        <Textarea
          {...control("notes", "session-notes")}
          rows={3}
          maxLength={NOTES_MAX}
          disabled={pending}
          {...form.register("notes", {
            validate: (value) => value.trim().length <= NOTES_MAX || t("form.notes.invalid"),
          })}
        />
      </FormField>

      {problem !== null && <FormNotice problem={problem} mode={mode.kind} />}

      <div className="flex flex-wrap justify-end gap-2.5 pt-1">
        <Button asChild variant="quiet" size="system">
          <Link
            href={
              editing
                ? routeHref("web.app.coach.sessions._session-id", { sessionId: mode.session.id })
                : routeHref("web.app.coach.sessions")
            }
          >
            {t("form.cancel")}
          </Link>
        </Button>
        <Button type="submit" size="system" aria-busy={pending || undefined} disabled={pending}>
          {pending && <Spinner />}
          {pending ? t("form.saving") : editing ? t("form.save") : t("form.create")}
        </Button>
      </div>
    </form>
  );
}

function Overlap({
  resolution,
  zone,
  time,
  error,
  disabled,
  register,
}: {
  resolution: Extract<WallTimeResolution, { kind: "overlap" }>;
  zone: string;
  time: string;
  error: string | undefined;
  disabled: boolean;
  register: ReturnType<ReturnType<typeof useForm<Values>>["register"]>;
}) {
  const t = useTranslations("coachSessions");
  const options: [Values["occurrence"], WallInstant, "first" | "second"][] = [
    ["first", resolution.first, "first"],
    ["second", resolution.second, "second"],
  ];
  return (
    <fieldset
      data-schedule="overlap"
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? describedBy("session-occurrence") : undefined}
      className="flex flex-col gap-2 rounded-lg border border-warning-border bg-warning-subtle px-3.5 py-3 type-caption text-warning-subtle-foreground"
    >
      <legend className="float-left font-extrabold">{t("form.overlap.title")}</legend>
      <p className="clear-both">{t("form.overlap.body", { zone, time })}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(([option, at, label]) => (
          <label
            key={option}
            className={cn(chipClass, "h-8 border-warning-border text-warning-subtle-foreground")}
          >
            <input
              type="radio"
              value={option}
              className="sr-only"
              disabled={disabled}
              {...register}
            />
            {t(`form.overlap.${label}`, { offset: formatOffset(at.offsetMinutes) })}
          </label>
        ))}
      </div>
      {error && (
        <p id={describedBy("session-occurrence")} className="font-bold" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function FormNotice({ problem, mode }: { problem: Problem; mode: Mode["kind"] }) {
  const t = useTranslations("coachSessions");
  const tone = problem === "failed" ? "coral" : "amber";
  const body =
    problem === "failed" ? t(`form.notices.failed.${mode}`) : t(`form.notices.${problem}.body`);
  return (
    <Notice tone={tone} role="alert" data-problem={problem}>
      <strong className="font-extrabold">{t(`form.notices.${problem}.title`)}</strong> {body}
    </Notice>
  );
}

function FormSkeleton() {
  const t = useTranslations("coachSessions");
  return (
    <div role="status" aria-label={t("form.loading")} className="flex flex-col gap-4">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-16 rounded-xl" />
      ))}
    </div>
  );
}

function relationshipLabel(
  relationship: CoachRelationship,
  unnamed: (startedAt: string) => string,
): string {
  const { fighter } = relationship;
  const name = fighter?.display_name ?? null;
  const handle = fighter?.username ? `@${fighter.username}` : null;
  if (name && handle) return `${name} · ${handle}`;
  return name ?? handle ?? unnamed(relationship.started_at);
}

function fighterName(session: CoachTrainingSession): string | null {
  const name = fighterLabel(session.fighter);
  const handle = session.fighter?.username ? `@${session.fighter.username}` : null;
  return name && handle && name !== handle ? `${name} · ${handle}` : name;
}

/** The fields of `values` that differ from `session`, in the update body's shape. */
function changedFields(
  session: CoachTrainingSession,
  values: Values,
  at: WallInstant,
): TrainingSessionUpdateRequest {
  const changes: TrainingSessionUpdateRequest = {};
  const title = values.title.trim();
  if (title !== session.title) changes.title = title;
  if (values.trainingType !== session.training_type)
    changes.training_type = values.trainingType as TrainingType;
  const duration = Number(values.duration);
  if (duration !== session.duration_minutes) changes.duration_minutes = duration;
  const notes = values.notes.trim() === "" ? null : values.notes.trim();
  if (notes !== session.notes) changes.notes = notes;
  const zoneChanged = values.timeZone !== session.time_zone;
  if (zoneChanged || at.instant.getTime() !== new Date(session.starts_at).getTime()) {
    changes.starts_at = toRfc3339(at);
    // The offset must be the zone's: a changed zone travels with its start.
    if (zoneChanged) changes.time_zone = values.timeZone;
  }
  return changes;
}

/**
 * What the backend's refusal means for the form: field errors land on their
 * fields; `409` is a session that can no longer change; `404` a fighter or
 * session the coach can no longer plan for. Anything else changed nothing.
 */
function serverProblem(
  failure: unknown,
  setError: UseFormSetError<Values>,
  t: ReturnType<typeof useTranslations<"coachSessions">>,
  resetKey: () => void,
): Problem | null {
  if (!isApiError(failure)) return "failed";
  if (failure.status === 404) return "unavailable";
  if (failure.code === "conflict") {
    // A request key reused for another session: the next attempt gets a new one.
    if (failure.details["client_request_id"] !== undefined) {
      resetKey();
      return "failed";
    }
    return "conflict";
  }
  if (failure.code !== "validation_error") return "failed";

  const codes = failure.fieldCodes;
  const fields: [string, keyof Values, string][] = [
    ["relationship_id", "relationshipId", t("form.fighter.required")],
    ["title", "title", t("form.title.invalid")],
    ["training_type", "trainingType", t("form.type.required")],
    [
      "starts_at",
      "time",
      codes.starts_at?.includes("out_of_range") ? t("form.time.window") : t("form.time.invalid"),
    ],
    ["time_zone", "timeZone", t("form.zone.invalid")],
    ["duration_minutes", "duration", t("form.duration.invalid")],
    ["notes", "notes", t("form.notes.invalid")],
  ];
  let applied = false;
  for (const [field, name, message] of fields) {
    if (codes[field] === undefined) continue;
    setError(name, { type: "server", message });
    applied = true;
  }
  return applied ? null : "failed";
}
