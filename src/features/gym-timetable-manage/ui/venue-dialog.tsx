"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Controller, useForm, type UseFormSetError } from "react-hook-form";
import { toast } from "sonner";

import type { Gym } from "@/entities/gym";
import type { GymVenue } from "@/entities/gym-timetable";
import { callWithSession } from "@/entities/session";
import {
  createGymVenue,
  getGymVenue,
  updateGymVenue,
} from "@/shared/api/generated/endpoints/gym-timetable/gym-timetable";
import type { GymVenueUpdateRequest } from "@/shared/api/generated/model";
import { isApiError } from "@/shared/api/http/api-error";
import { browserTimeZone, selectableTimeZones } from "@/shared/lib/time-zone";
import { Button } from "@/shared/ui/button";
import { Combobox } from "@/shared/ui/combobox";
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
import { NumberField, SelectField, wholeIn } from "./fields";
import { ProblemNotice } from "./problem-text";

type Values = {
  name: string;
  locationId: string;
  capacity: string;
  timeZone: string;
  description: string;
};

const NAME_MAX = 80;
const DESCRIPTION_MAX = 500;

/**
 * A venue of the gym (SF-97 `createGymVenue` / `updateGymVenue`): a named
 * training area at one of the gym's locations, with the IANA zone its
 * classes are planned in (chosen once; it never changes, so no schedule is
 * reinterpreted later) and an optional capacity that caps every class in
 * it. Nothing is created for the gym on its own: no default "Main Hall".
 * A create carries one `client_request_id` per attempt, reused on a retry;
 * a change carries the revision it was based on, and a stale one shows the
 * latest venue without overwriting it.
 */
export function VenueDialog({
  gym,
  venue,
  zoneHint,
  trigger,
}: {
  gym: Gym;
  /** The venue to edit; none to create one. */
  venue?: GymVenue;
  /** The zone of the gym's other venues, offered first for a new one. */
  zoneHint?: string;
  trigger: ReactNode;
}) {
  const t = useTranslations("gymConsole.timetable.venueForm");
  const [open, setOpen] = useState(false);
  const refresh = useDialogRefresh(gym.id);
  const toggle = (next: boolean) => {
    setOpen(next);
    if (!next) refresh.onClose();
  };
  return (
    <Dialog open={open} onOpenChange={toggle}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent closeLabel={t("close")} className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open && (
          <VenueForm
            gym={gym}
            venue={venue}
            zoneHint={zoneHint}
            refresh={refresh}
            onClose={() => toggle(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function VenueForm({
  gym,
  venue: initialVenue,
  zoneHint,
  refresh,
  onClose,
}: {
  gym: Gym;
  venue?: GymVenue;
  zoneHint?: string;
  refresh: ReturnType<typeof useDialogRefresh>;
  onClose: () => void;
}) {
  const t = useTranslations("gymConsole.timetable.venueForm");
  const ids = { name: useId(), location: useId(), capacity: useId(), zone: useId(), text: useId() };
  // The record a change is based on: replaced by the latest after a stale answer.
  const [venue, setVenue] = useState(initialVenue);
  const editing = venue !== undefined;
  const [problem, setProblem] = useState<TimetableProblem | null>(null);
  const requestKey = useRequestKey();
  const defaultZone = zoneHint ?? browserTimeZone() ?? "UTC";
  const valuesOf = (record: GymVenue | undefined): Values => ({
    name: record?.name ?? "",
    locationId:
      record?.gym_location_id ?? (gym.locations.length === 1 ? (gym.locations[0]?.id ?? "") : ""),
    capacity: record?.capacity === null || record === undefined ? "" : String(record.capacity),
    timeZone: record?.time_zone ?? defaultZone,
    description: record?.description ?? "",
  });
  const form = useForm<Values>({ defaultValues: valuesOf(venue), mode: "onTouched" });
  const { errors } = form.formState;
  const zones = useMemo(
    () => selectableTimeZones([defaultZone]).map((zone) => ({ value: zone, label: zone })),
    [defaultZone],
  );

  useEffect(() => {
    form.setFocus("name");
  }, [form]);

  const save = useMutation({
    mutationFn: async (values: Values) => {
      const capacity = values.capacity.trim() === "" ? null : Number(values.capacity);
      const description = values.description.trim() === "" ? null : values.description.trim();
      if (venue === undefined) {
        const body = {
          name: values.name.trim(),
          gym_location_id: values.locationId,
          time_zone: values.timeZone,
          ...(capacity === null ? {} : { capacity }),
          ...(description === null ? {} : { description }),
        };
        const response = await callWithSession((init) =>
          createGymVenue(gym.id, { ...body, client_request_id: requestKey.for(body) }, init),
        );
        return response.venue;
      }
      const changes: GymVenueUpdateRequest = { expected_revision: venue.revision };
      if (values.name.trim() !== venue.name) changes.name = values.name.trim();
      if (values.locationId !== venue.gym_location_id) changes.gym_location_id = values.locationId;
      if (capacity !== venue.capacity) changes.capacity = capacity;
      if (description !== venue.description) changes.description = description;
      const response = await callWithSession((init) =>
        updateGymVenue(gym.id, venue.venue_id, changes, init),
      );
      return response.venue;
    },
    onSuccess: (saved) => {
      toast.success(t(editing ? "saved" : "created", { name: saved.name }));
      void refresh.now();
      onClose();
    },
    onError: async (error) => {
      refresh.later();
      if (applyFieldErrors(error, form.setError, t)) return;
      const next = timetableProblem(error);
      setProblem(next);
      if (next.kind === "stale" && venue !== undefined) {
        // Show the venue as it is now; the user's draft stays in the form.
        const latest = await callWithSession((init) =>
          getGymVenue(gym.id, venue.venue_id, init),
        ).catch(() => null);
        if (latest) {
          setVenue(latest.venue);
          // The latest venue, with only the user's own edits on top.
          form.reset(valuesOf(latest.venue), { keepDirtyValues: true });
        }
      }
    },
  });

  const pending = save.isPending;
  const submit = form.handleSubmit((values) => {
    setProblem(null);
    save.mutate(values);
  });
  const locations = gym.locations.map((location) => ({
    value: location.id,
    label: `${location.name} · ${location.city}`,
  }));

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="grid gap-4"
      data-venue-form={editing ? "edit" : "create"}
    >
      <DialogHeader>
        <DialogTitle>{editing ? t("editTitle") : t("createTitle")}</DialogTitle>
        <DialogDescription>{t("lead")}</DialogDescription>
      </DialogHeader>
      <FormField
        helpTone="muted"
        id={ids.name}
        label={t("name.label")}
        error={errors.name?.message}
      >
        <Input
          id={ids.name}
          fieldSize="lg"
          maxLength={NAME_MAX}
          data-field="name"
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? describedBy(ids.name) : undefined}
          disabled={pending}
          {...form.register("name", {
            validate: (value) =>
              (value.trim().length > 0 && value.trim().length <= NAME_MAX) || t("name.invalid"),
          })}
        />
      </FormField>
      <Controller
        control={form.control}
        name="locationId"
        rules={{ required: t("location.required") }}
        render={({ field }) => (
          <SelectField
            id={ids.location}
            label={t("location.label")}
            error={errors.locationId?.message}
            value={field.value}
            onChange={field.onChange}
            options={locations}
            placeholder={t("location.placeholder")}
            disabled={pending}
            field="gym_location_id"
          />
        )}
      />
      {editing ? (
        <FormField helpTone="muted" id={ids.zone} label={t("zone.label")} help={t("zone.fixed")}>
          <Input
            id={ids.zone}
            fieldSize="lg"
            readOnly
            value={venue.time_zone}
            className="bg-muted"
            data-field="time_zone"
            aria-describedby={describedBy(ids.zone)}
          />
        </FormField>
      ) : (
        <FormField
          helpTone="muted"
          id={ids.zone}
          label={t("zone.label")}
          help={t("zone.help")}
          error={errors.timeZone?.message}
        >
          <Controller
            control={form.control}
            name="timeZone"
            rules={{ required: t("zone.required") }}
            render={({ field }) => (
              <Combobox
                id={ids.zone}
                aria-describedby={describedBy(ids.zone)}
                value={field.value || null}
                onValueChange={field.onChange}
                options={zones}
                placeholder={t("zone.label")}
                searchLabel={t("zone.search")}
                emptyLabel={t("zone.empty")}
                invalid={errors.timeZone !== undefined}
                disabled={pending}
              />
            )}
          />
        </FormField>
      )}
      <NumberField
        id={ids.capacity}
        label={t("capacity.label")}
        help={t("capacity.help")}
        error={errors.capacity?.message}
        unit={t("capacity.unit")}
        disabled={pending}
        field="capacity"
        registration={form.register("capacity", {
          validate: (value) =>
            value.trim() === "" || wholeIn(value, 1, 500) || t("capacity.invalid"),
        })}
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
      {problem?.kind === "stale" && venue && (
        <Notice tone="amber" role="status" data-venue-latest={venue.revision}>
          {t("latest", { name: venue.name })}
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

/** The backend's field errors, on their fields. False when it was no validation error. */
function applyFieldErrors(
  error: unknown,
  setError: UseFormSetError<Values>,
  t: ReturnType<typeof useTranslations<"gymConsole.timetable.venueForm">>,
): boolean {
  if (!isApiError(error) || error.code !== "validation_error") return false;
  const codes = error.fieldCodes;
  const fields: [string, keyof Values, string][] = [
    ["name", "name", codes.name?.includes("already_exists") ? t("name.taken") : t("name.invalid")],
    ["gym_location_id", "locationId", t("location.invalid")],
    ["capacity", "capacity", t("capacity.invalid")],
    ["time_zone", "timeZone", t("zone.invalid")],
    ["description", "description", t("description.invalid")],
  ];
  let applied = false;
  for (const [field, name, message] of fields) {
    if (codes[field] === undefined) continue;
    setError(name, { type: "server", message });
    applied = true;
  }
  return applied;
}
