"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Controller, useForm, type UseFormSetError } from "react-hook-form";
import { toast } from "sonner";

import type { GymClassTemplate, GymInstructor, GymVenue } from "@/entities/gym-timetable";
import { callWithSession } from "@/entities/session";
import {
  createGymClassTemplate,
  getGymClassTemplate,
  updateGymClassTemplate,
} from "@/shared/api/generated/endpoints/gym-timetable/gym-timetable";
import type { GymClassTemplateUpdateRequest } from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";
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
import { Textarea } from "@/shared/ui/textarea";

import { useDialogRefresh, useRequestKey } from "../model/refresh";
import { timetableProblem, type TimetableProblem } from "../model/timetable-problem";
import { NONE, NumberField, SelectField, wholeIn } from "./fields";
import { ProblemNotice } from "./problem-text";

type Values = {
  title: string;
  description: string;
  duration: string;
  capacity: string;
  venueId: string;
  instructorId: string;
};

const TITLE_MAX = 80;

function valuesOf(template: GymClassTemplate | undefined): Values {
  return {
    title: template?.title ?? "",
    description: template?.description ?? "",
    duration: String(template?.default_duration_minutes ?? 60),
    capacity: template ? String(template.default_capacity) : "",
    venueId: template?.default_venue_id ?? NONE,
    instructorId: template?.default_instructor?.staff_membership_id ?? NONE,
  };
}
const DESCRIPTION_MAX = 1000;

/**
 * A class template (SF-97 `createGymClassTemplate` /
 * `updateGymClassTemplate`): a title and the defaults new classes start
 * from (duration, capacity, venue, instructor). Only the fields the
 * contract has: no category, level or price. Changing a template never
 * changes classes already scheduled, and the form says so; nothing in the
 * timetable is rewritten on the client.
 */
export function TemplateDialog({
  gymId,
  template,
  venues,
  instructors,
  trigger,
}: {
  gymId: string;
  template?: GymClassTemplate;
  venues: readonly GymVenue[];
  instructors: readonly GymInstructor[];
  trigger: ReactNode;
}) {
  const t = useTranslations("gymConsole.timetable.templateForm");
  const [open, setOpen] = useState(false);
  const refresh = useDialogRefresh(gymId);
  const toggle = (next: boolean) => {
    setOpen(next);
    if (!next) refresh.onClose();
  };
  return (
    <Dialog open={open} onOpenChange={toggle}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent closeLabel={t("close")} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open && (
          <TemplateForm
            gymId={gymId}
            template={template}
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

function TemplateForm({
  gymId,
  template: initialTemplate,
  venues,
  instructors,
  refresh,
  onClose,
}: {
  gymId: string;
  template?: GymClassTemplate;
  venues: readonly GymVenue[];
  instructors: readonly GymInstructor[];
  refresh: ReturnType<typeof useDialogRefresh>;
  onClose: () => void;
}) {
  const t = useTranslations("gymConsole.timetable.templateForm");
  const ids = {
    title: useId(),
    text: useId(),
    duration: useId(),
    capacity: useId(),
    venue: useId(),
    instructor: useId(),
  };
  const [template, setTemplate] = useState(initialTemplate);
  const editing = template !== undefined;
  const [problem, setProblem] = useState<TimetableProblem | null>(null);
  const requestKey = useRequestKey();
  const form = useForm<Values>({ defaultValues: valuesOf(template), mode: "onTouched" });
  const { errors } = form.formState;

  useEffect(() => {
    form.setFocus("title");
  }, [form]);

  const save = useMutation({
    mutationFn: async (values: Values) => {
      const description = values.description.trim() === "" ? null : values.description.trim();
      const venueId = values.venueId === NONE ? null : values.venueId;
      const instructorId = values.instructorId === NONE ? null : values.instructorId;
      if (template === undefined) {
        const body = {
          title: values.title.trim(),
          default_duration_minutes: Number(values.duration),
          default_capacity: Number(values.capacity),
          ...(description === null ? {} : { description }),
          ...(venueId === null ? {} : { default_venue_id: venueId }),
          ...(instructorId === null
            ? {}
            : { default_instructor_staff_membership_id: instructorId }),
        };
        const response = await callWithSession((init) =>
          createGymClassTemplate(gymId, { ...body, client_request_id: requestKey.for(body) }, init),
        );
        return response.template;
      }
      const changes: GymClassTemplateUpdateRequest = { expected_revision: template.revision };
      if (values.title.trim() !== template.title) changes.title = values.title.trim();
      if (description !== template.description) changes.description = description;
      if (Number(values.duration) !== template.default_duration_minutes)
        changes.default_duration_minutes = Number(values.duration);
      if (Number(values.capacity) !== template.default_capacity)
        changes.default_capacity = Number(values.capacity);
      if (venueId !== template.default_venue_id) changes.default_venue_id = venueId;
      if (instructorId !== (template.default_instructor?.staff_membership_id ?? null))
        changes.default_instructor_staff_membership_id = instructorId;
      const response = await callWithSession((init) =>
        updateGymClassTemplate(gymId, template.template_id, changes, init),
      );
      return response.template;
    },
    onSuccess: (saved) => {
      toast.success(t(editing ? "saved" : "created", { title: saved.title }));
      void refresh.now();
      onClose();
    },
    onError: async (error) => {
      refresh.later();
      if (applyFieldErrors(error, form.setError, t)) return;
      const next = timetableProblem(error);
      setProblem(next);
      if (next.kind === "stale" && template !== undefined) {
        const latest = await callWithSession((init) =>
          getGymClassTemplate(gymId, template.template_id, init),
        ).catch(() => null);
        if (latest) {
          setTemplate(latest.template);
          // The latest template, with only the user's own edits on top.
          form.reset(valuesOf(latest.template), { keepDirtyValues: true });
        }
      }
    },
  });

  const pending = save.isPending;
  const submit = form.handleSubmit((values) => {
    setProblem(null);
    save.mutate(values);
  });
  const venueOptions = [
    { value: NONE, label: t("venue.none") },
    ...venues.map((venue) => ({
      value: venue.venue_id,
      label:
        venue.capacity === null
          ? venue.name
          : t("venue.option", { name: venue.name, capacity: venue.capacity }),
    })),
  ];
  const instructorOptions = [
    { value: NONE, label: t("instructor.none") },
    ...instructors.map((person) => ({
      value: person.staffMembershipId,
      label: person.name ?? t("instructor.unnamed"),
    })),
  ];

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="grid gap-4"
      data-template-form={editing ? "edit" : "create"}
    >
      <DialogHeader>
        <DialogTitle>{editing ? t("editTitle") : t("createTitle")}</DialogTitle>
        <DialogDescription>{editing ? t("editLead") : t("lead")}</DialogDescription>
      </DialogHeader>
      <FormField
        helpTone="muted"
        id={ids.title}
        label={t("title.label")}
        error={errors.title?.message}
      >
        <Input
          id={ids.title}
          fieldSize="lg"
          maxLength={TITLE_MAX}
          data-field="title"
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? describedBy(ids.title) : undefined}
          disabled={pending}
          {...form.register("title", {
            validate: (value) =>
              (value.trim().length > 0 && value.trim().length <= TITLE_MAX) || t("title.invalid"),
          })}
        />
      </FormField>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField
          id={ids.duration}
          label={t("duration.label")}
          help={t("duration.help")}
          error={errors.duration?.message}
          unit={t("duration.unit")}
          disabled={pending}
          field="default_duration_minutes"
          registration={form.register("duration", {
            validate: (value) => wholeIn(value, 5, 480) || t("duration.invalid"),
          })}
        />
        <NumberField
          id={ids.capacity}
          label={t("capacity.label")}
          help={t("capacity.help")}
          error={errors.capacity?.message}
          unit={t("capacity.unit")}
          disabled={pending}
          field="default_capacity"
          registration={form.register("capacity", {
            validate: (value) => wholeIn(value, 1, 500) || t("capacity.invalid"),
          })}
        />
      </div>
      <Controller
        control={form.control}
        name="venueId"
        render={({ field }) => (
          <SelectField
            id={ids.venue}
            label={t("venue.label")}
            error={errors.venueId?.message}
            value={field.value}
            onChange={field.onChange}
            options={venueOptions}
            disabled={pending}
            field="default_venue_id"
          />
        )}
      />
      <Controller
        control={form.control}
        name="instructorId"
        render={({ field }) => (
          <SelectField
            id={ids.instructor}
            label={t("instructor.label")}
            help={t("instructor.help")}
            error={errors.instructorId?.message}
            value={field.value}
            onChange={field.onChange}
            options={instructorOptions}
            disabled={pending}
            field="default_instructor_staff_membership_id"
          />
        )}
      />
      <FormField
        helpTone="muted"
        id={ids.text}
        label={t("description.label")}
        error={errors.description?.message}
      >
        <Textarea
          id={ids.text}
          rows={2}
          maxLength={DESCRIPTION_MAX}
          data-field="description"
          aria-invalid={errors.description ? true : undefined}
          aria-describedby={errors.description ? describedBy(ids.text) : undefined}
          disabled={pending}
          {...form.register("description", {
            validate: (value) => value.trim().length <= DESCRIPTION_MAX || t("description.invalid"),
          })}
        />
      </FormField>
      {editing && <Notice tone="muted">{t("historyNote")}</Notice>}
      {problem?.kind === "stale" && template && (
        <Notice tone="amber" role="status" data-template-latest={template.revision}>
          {t("latest", { title: template.title })}
        </Notice>
      )}
      {problem && problem.kind !== "stale" && <ProblemNotice problem={problem} />}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" aria-busy={pending || undefined} disabled={pending}>
          {pending && <Spinner />}
          {pending
            ? t("saving")
            : problem?.kind === "stale"
              ? t("saveAgain")
              : editing
                ? t("save")
                : t("create")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function applyFieldErrors(
  error: unknown,
  setError: UseFormSetError<Values>,
  t: ReturnType<typeof useTranslations<"gymConsole.timetable.templateForm">>,
): boolean {
  if (!isApiError(error) || error.code !== "validation_error") return false;
  const codes = error.fieldCodes;
  const fields: [string, keyof Values, string][] = [
    ["title", "title", t("title.invalid")],
    ["description", "description", t("description.invalid")],
    ["default_duration_minutes", "duration", t("duration.invalid")],
    [
      "default_capacity",
      "capacity",
      // The client already checks 1–500: a range refusal is the venue's own limit.
      codes.default_capacity?.includes("out_of_range")
        ? t("capacity.overVenue")
        : t("capacity.invalid"),
    ],
    ["default_venue_id", "venueId", t("venue.invalid")],
    ["default_instructor_staff_membership_id", "instructorId", t("instructor.invalid")],
  ];
  let applied = false;
  for (const [field, name, message] of fields) {
    if (codes[field] === undefined) continue;
    setError(name, { type: "server", message });
    applied = true;
  }
  return applied;
}
