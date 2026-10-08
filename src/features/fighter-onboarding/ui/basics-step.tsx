"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import type { FighterProfile, FighterProfilePatch } from "@/entities/fighter-profile";
import { countryOptions } from "@/shared/lib/countries";
import { Button } from "@/shared/ui/button";
import { Combobox } from "@/shared/ui/combobox";
import { Input } from "@/shared/ui/input";

import { rejectionOf, type FieldMessage } from "../model/errors";
import { basicsErrors, basicsFrom, basicsPatch, type BasicsValues } from "../model/form-values";
import type { FormStep } from "../model/steps";
import { describedBy, FormField } from "./form-field";
import { BasicsPreview } from "./profile-preview";
import { StepNotice, type StepProblem } from "./step-notice";

const FIELDS = ["display_name", "username", "country_code", "city"] as const;

export type StepSaver = () => Promise<boolean>;

/**
 * WF0 "Your fighter profile" (Profile basics): name, username, country, city.
 * The form starts from the backend profile; Continue checks the step's
 * completion requirements, saves with one PATCH and moves to WF1 only once
 * the API accepted it. A rejected value stays in its field with the API's
 * reason; a failed request keeps everything typed and offers Retry.
 * `registerSaver` lets the frame's Save & exit and the step card persist
 * unsaved edits the same way (without requiring the step to be complete).
 */
export function BasicsStep({
  profile,
  save,
  onDone,
  registerSaver,
}: {
  profile: FighterProfile;
  save: (patch: FighterProfilePatch) => Promise<FighterProfile>;
  onDone: (next: FormStep) => void;
  registerSaver: (saver: StepSaver) => void;
}) {
  const t = useTranslations("fighterOnboarding");
  const locale = useLocale();
  const countries = useMemo(
    () => countryOptions(locale).map(({ code, name }) => ({ value: code, label: name })),
    [locale],
  );
  const form = useForm<BasicsValues>({ defaultValues: basicsFrom(profile) });
  const { register, control, setError, clearErrors, setFocus, reset, formState } = form;
  const values = useWatch({ control }) as BasicsValues;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<StepProblem>();
  const retry = useRef<() => void>(undefined);

  // A newer backend profile (another tab, the mobile app) replaces the form
  // only while nothing here is being edited; edits win on their next save.
  useEffect(() => {
    if (!formState.isDirty) reset(basicsFrom(profile));
  }, [profile, formState.isDirty, reset]);

  const message = (key: FieldMessage) => t(`errors.${key}`);

  function showErrors(errors: Partial<Record<string, FieldMessage>>) {
    const invalid = FIELDS.filter((field) => errors[field] !== undefined);
    for (const field of invalid) {
      const key = errors[field];
      if (key !== undefined) setError(field, { type: "validate", message: message(key) });
    }
    const first = invalid[0];
    if (first !== undefined) setFocus(first);
    return invalid.length > 0;
  }

  /** Saves the form; `true` once the API accepted it (or there was nothing to save). */
  async function persist(requireComplete: boolean): Promise<boolean> {
    if (busy) return false;
    clearErrors();
    setProblem(undefined);
    const current = form.getValues();
    if (requireComplete && showErrors(basicsErrors(current))) {
      setProblem("invalid");
      return false;
    }
    if (!requireComplete && !formState.isDirty) return true;
    setBusy(true);
    try {
      reset(basicsFrom(await save(basicsPatch(current))));
      return true;
    } catch (error) {
      const rejection = rejectionOf(error);
      if (rejection !== undefined) {
        showErrors(rejection.fields);
        setProblem("invalid");
      } else {
        setProblem("failure");
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  const advance = async (next: FormStep) => {
    retry.current = () => void advance(next);
    if (await persist(next === "profile")) onDone(next);
  };

  // The frame and the step card save through the same path (no completeness check).
  const latestPersist = useRef(persist);
  useEffect(() => {
    latestPersist.current = persist;
  });
  useEffect(() => registerSaver(() => latestPersist.current(false)), [registerSaver]);

  const error = (field: keyof BasicsValues) => formState.errors[field]?.message;

  return (
    <>
      <div className="flex min-w-0 flex-col gap-5.5">
        <hgroup className="flex flex-col gap-2">
          <p className="type-label text-highlight">{t("basics.eyebrow")}</p>
          <h1 tabIndex={-1} className="type-onboarding-title outline-none">
            {t("basics.title")}
          </h1>
          <p className="type-body-lg text-pretty text-muted-foreground">{t("basics.lead")}</p>
        </hgroup>
        <StepNotice problem={problem} draft="typed" onRetry={() => retry.current?.()} />
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void advance("profile");
          }}
          className="flex min-w-0 flex-col gap-5.5"
        >
          <div className="flex min-w-0 flex-col gap-4.5">
            <FormField
              id="fighter-name"
              label={t("basics.name.label")}
              help={t("basics.name.help")}
              error={error("display_name")}
            >
              <Input
                id="fighter-name"
                fieldSize="lg"
                autoComplete="nickname"
                placeholder={t("basics.name.placeholder")}
                aria-invalid={error("display_name") !== undefined || undefined}
                aria-describedby={describedBy("fighter-name")}
                {...register("display_name")}
              />
            </FormField>
            <FormField
              id="fighter-username"
              label={t("basics.username.label")}
              help={t("basics.username.help")}
              error={error("username")}
            >
              <div className="relative">
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center type-body font-semibold text-faint-foreground"
                >
                  @
                </span>
                <Input
                  id="fighter-username"
                  fieldSize="lg"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={t("basics.username.placeholder")}
                  className="pl-8"
                  aria-invalid={error("username") !== undefined || undefined}
                  aria-describedby={describedBy("fighter-username")}
                  {...register("username")}
                />
              </div>
            </FormField>
            <div className="grid min-w-0 gap-3.5 sm:grid-cols-2">
              <FormField
                id="fighter-country"
                label={t("basics.country.label")}
                help={t("basics.country.help")}
                error={error("country_code")}
              >
                <Controller
                  control={control}
                  name="country_code"
                  render={({ field }) => (
                    <Combobox
                      id="fighter-country"
                      value={field.value}
                      onValueChange={field.onChange}
                      options={countries}
                      placeholder={t("basics.country.placeholder")}
                      searchLabel={t("basics.country.search")}
                      searchPlaceholder={t("basics.country.searchPlaceholder")}
                      emptyLabel={t("basics.country.empty")}
                      invalid={error("country_code") !== undefined}
                      aria-describedby={describedBy("fighter-country")}
                    />
                  )}
                />
              </FormField>
              <FormField
                id="fighter-city"
                label={t("basics.city.label")}
                help={t("basics.city.help")}
                error={error("city")}
              >
                <Input
                  id="fighter-city"
                  fieldSize="lg"
                  autoComplete="address-level2"
                  placeholder={t("basics.city.placeholder")}
                  aria-invalid={error("city") !== undefined || undefined}
                  aria-describedby={describedBy("fighter-city")}
                  {...register("city")}
                />
              </FormField>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2.5 border-t border-border-subtle pt-2.5">
            <span className="flex-1" />
            <Button type="submit" size="lg" className="min-w-30" loading={busy}>
              {busy ? t("basics.saving") : t("basics.continue")}
            </Button>
          </div>
        </form>
      </div>
      <aside className="flex min-w-0 flex-col gap-3.5">
        <BasicsPreview values={values} />
      </aside>
    </>
  );
}
