"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import type { GymLocationInput, GymSetup } from "@/entities/gym-setup";
import { countryOptions } from "@/shared/lib/countries";
import { Button } from "@/shared/ui/button";
import { Combobox } from "@/shared/ui/combobox";
import { describedBy, FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

import type { FieldMessage } from "../model/errors";
import {
  locationChanged,
  locationErrors,
  locationFrom,
  locationInput,
  type LocationValues,
} from "../model/form-values";
import type { FormStep } from "../model/steps";
import { LocationPreview } from "./previews";
import { SaveStatus, StepBody, StepFooter, StepHeader } from "./setup-frame";
import { StepNotice } from "./step-notice";
import type { StepSaver } from "./type-step";
import { useStepFailure } from "./use-step-failure";

const FIELDS = [
  "country_code",
  "city",
  "address_line",
  "entrance_note",
] as const satisfies readonly (keyof LocationValues)[];

/**
 * OG2 "Location": the gym's one primary location (country, city, address
 * and an optional entrance note; its name defaults to the city). The
 * location is written whole (`setGymPrimaryLocation`) against the setup's
 * revision, so a save based on an older read changes nothing and shows the
 * conflict state with the visitor's input kept. Adding more locations is
 * not available yet (approved SF-86 difference).
 */
export function LocationStep({
  setup,
  setLocation,
  reload,
  accountHref,
  onDone,
  onSaveExit,
  registerSaver,
  onRestart,
}: {
  setup: GymSetup;
  setLocation: (setup: GymSetup, location: GymLocationInput) => Promise<GymSetup>;
  reload: () => Promise<GymSetup>;
  accountHref: string;
  onDone: (next: FormStep) => void;
  onSaveExit: () => void;
  registerSaver: (saver: StepSaver) => void;
  /** The gym is gone (discarded elsewhere, or no longer the viewer's): look again. */
  onRestart?: () => void;
}) {
  const t = useTranslations("gymOnboarding");
  const locale = useLocale();
  const countries = useMemo(
    () => countryOptions(locale).map(({ code, name }) => ({ value: code, label: name })),
    [locale],
  );
  const form = useForm<LocationValues>({ defaultValues: locationFrom(setup) });
  const { register, control, setError, clearErrors, setFocus, getValues, reset, formState } = form;
  const values = useWatch({ control }) as LocationValues;
  const [busy, setBusy] = useState(false);
  // The action a Retry or Reapply repeats, run with this render's values.
  const retry = useRef<"advance" | "back">("advance");

  useEffect(() => {
    reset(locationFrom(setup), { keepDirtyValues: true });
  }, [setup, reset]);

  const showErrors = useCallback(
    (errors: Partial<Record<string, FieldMessage>>) => {
      const invalid = FIELDS.filter((field) => errors[field] !== undefined);
      for (const field of invalid) {
        const key = errors[field];
        if (key !== undefined) setError(field, { type: "validate", message: t(`errors.${key}`) });
      }
      const first = invalid[0];
      if (first === "country_code") document.getElementById("gym-country")?.focus();
      else if (first !== undefined) setFocus(first);
      return invalid.length > 0;
    },
    [setError, setFocus, t],
  );
  const { problem, setProblem, fail } = useStepFailure({ reload, accountHref, showErrors });

  /** Saves the location; `true` once the API accepted it (or it was unchanged). */
  async function persist(leaving: boolean): Promise<boolean> {
    if (busy) return false;
    clearErrors();
    setProblem(undefined);
    const current = getValues();
    if (leaving && !formState.isDirty) return true;
    if (showErrors(locationErrors(current))) {
      setProblem({ kind: "invalid" });
      return false;
    }
    if (!locationChanged(setup, current)) {
      reset(locationFrom(setup));
      return true;
    }
    setBusy(true);
    try {
      reset(locationFrom(await setLocation(setup, locationInput(current))));
      return true;
    } catch (error) {
      await fail(error, "save");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const advance = async () => {
    retry.current = "advance";
    if (await persist(false)) onDone("branding");
  };
  const back = async () => {
    retry.current = "back";
    if (await persist(true)) onDone("type");
  };

  const latestPersist = useRef(persist);
  useEffect(() => {
    latestPersist.current = persist;
  });
  useEffect(() => registerSaver(() => latestPersist.current(true)), [registerSaver]);

  const error = (field: keyof LocationValues) => formState.errors[field]?.message;
  const invalid = (field: keyof LocationValues) => error(field) !== undefined || undefined;
  const countryName =
    countries.find((country) => country.value === values.country_code)?.label ?? null;

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void advance();
      }}
      className="flex flex-1 flex-col"
    >
      <StepHeader
        eyebrow={t("location.eyebrow")}
        title={t("location.title")}
        lead={t("location.lead")}
        status={
          <SaveStatus
            state={formState.isDirty ? "unsaved" : setup.primary_location ? "saved" : "none"}
          />
        }
      />
      <StepBody
        aside={
          <LocationPreview
            gymName={setup.name}
            city={values.city ?? ""}
            countryName={countryName}
            address={values.address_line ?? ""}
            note={values.entrance_note ?? ""}
          />
        }
      >
        <StepNotice
          problem={problem}
          onRestart={onRestart}
          onRetry={() => void (retry.current === "back" ? back() : advance())}
          onReapply={() => void (retry.current === "back" ? back() : advance())}
        />
        <div className="grid min-w-0 gap-4 md:grid-cols-2 desktop:grid-cols-[1fr_1fr_2fr]">
          <FormField
            id="gym-country"
            label={t("location.country.label")}
            error={error("country_code")}
          >
            <Controller
              control={control}
              name="country_code"
              render={({ field }) => (
                <Combobox
                  id="gym-country"
                  value={field.value}
                  onValueChange={field.onChange}
                  options={countries}
                  placeholder={t("location.country.placeholder")}
                  searchLabel={t("location.country.search")}
                  searchPlaceholder={t("location.country.searchPlaceholder")}
                  emptyLabel={t("location.country.empty")}
                  invalid={error("country_code") !== undefined}
                  aria-describedby={describedBy("gym-country")}
                />
              )}
            />
          </FormField>
          <FormField id="gym-city" label={t("location.city.label")} error={error("city")}>
            <Input
              id="gym-city"
              fieldSize="lg"
              autoComplete="address-level2"
              placeholder={t("location.city.placeholder")}
              aria-invalid={invalid("city")}
              aria-describedby={describedBy("gym-city")}
              {...register("city")}
            />
          </FormField>
          <FormField
            id="gym-address"
            label={t("location.address.label")}
            error={error("address_line")}
            className="md:col-span-2 desktop:col-span-1"
          >
            <Input
              id="gym-address"
              fieldSize="lg"
              autoComplete="street-address"
              placeholder={t("location.address.placeholder")}
              aria-invalid={invalid("address_line")}
              aria-describedby={describedBy("gym-address")}
              {...register("address_line")}
            />
          </FormField>
        </div>
        <FormField
          id="gym-entrance"
          label={t("location.entrance.label")}
          help={t("location.entrance.help")}
          error={error("entrance_note")}
        >
          <Input
            id="gym-entrance"
            fieldSize="lg"
            autoComplete="off"
            placeholder={t("location.entrance.placeholder")}
            aria-invalid={invalid("entrance_note")}
            aria-describedby={describedBy("gym-entrance")}
            {...register("entrance_note")}
          />
        </FormField>
        <p className="type-caption text-faint-foreground">{t("location.more")}</p>
      </StepBody>
      <StepFooter
        back={
          <Button
            type="button"
            variant="quiet"
            size="lg"
            onClick={() => void back()}
            disabled={busy}
          >
            {t("back")}
          </Button>
        }
        note={t("location.note")}
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="text-muted-foreground"
              onClick={onSaveExit}
              disabled={busy}
            >
              {t("frame.saveExit")}
            </Button>
            <Button type="submit" size="lg" className="min-w-30" loading={busy}>
              {busy ? t("saving") : t("continue")}
            </Button>
          </>
        }
      />
    </form>
  );
}
