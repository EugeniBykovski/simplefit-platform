"use client";

import { CheckIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import type { CoachProfile, CoachProfilePatch } from "@/entities/coach-profile";
import { countryOptions } from "@/shared/lib/countries";
import { changedOnly } from "@/shared/lib/forms";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Combobox } from "@/shared/ui/combobox";
import { ChoiceField, describedBy, FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";

import { rejectionOf, type FieldMessage } from "../model/errors";
import {
  LANGUAGES,
  LIMITS,
  lengthOf,
  profileErrors,
  profileFrom,
  profilePatch,
  type ProfileValues,
} from "../model/form-values";
import type { FormStep } from "../model/steps";
import { CoachPreview } from "./coach-preview";
import { pillClass } from "./pill";
import { StepNotice, type StepProblem } from "./step-notice";

const FIELDS = [
  "display_name",
  "brand_name",
  "country_code",
  "city",
  "bio",
  "languages",
] as const satisfies readonly (keyof ProfileValues)[];

export type StepSaver = () => Promise<boolean>;

/**
 * WCR1 "Your coach profile": coach name, brand, country, city, bio and
 * coaching languages, every value in the SF-50 vocabulary. Continue checks
 * the step's completion requirements, saves what changed with one PATCH and
 * moves to WCR2 only once the API accepted it. A rejected value stays in its
 * field with the API's reason; a failed request keeps everything typed and
 * offers Retry. `registerSaver` lets the frame's Save & exit and the step
 * card persist unsaved edits the same way (without the completeness check).
 *
 * `suggestion` (a new, unsaved profile only) pre-fills the coach name with
 * the account's full name as an editable, unsaved value: it reaches the API
 * only when the visitor saves the step, and a coach name saved meanwhile
 * (another tab, the mobile app) replaces it untouched.
 */
export function ProfileStep({
  profile,
  suggestion,
  save,
  onDone,
  registerSaver,
}: {
  profile: CoachProfile;
  suggestion?: string;
  save: (patch: CoachProfilePatch) => Promise<CoachProfile>;
  onDone: (next: FormStep) => void;
  registerSaver: (saver: StepSaver) => void;
}) {
  const t = useTranslations("coachOnboarding");
  const locale = useLocale();
  const countries = useMemo(
    () => countryOptions(locale).map(({ code, name }) => ({ value: code, label: name })),
    [locale],
  );
  const form = useForm<ProfileValues>({ defaultValues: profileFrom(profile) });
  const {
    register,
    control,
    setError,
    clearErrors,
    setFocus,
    setValue,
    getValues,
    reset,
    resetField,
    formState,
  } = form;
  const values = useWatch({ control }) as ProfileValues;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<StepProblem>();
  const retry = useRef<() => void>(undefined);
  // The suggestion offered when this step opened; never re-offered.
  const [offered] = useState(suggestion);

  // Offer the suggestion as an edit of this form (so Continue saves it).
  useEffect(() => {
    if (offered !== undefined) setValue("display_name", offered, { shouldDirty: true });
  }, [offered, setValue]);

  // A newer backend profile (another tab, the mobile app) updates every field
  // not being edited here; the fields being edited keep the visitor's input.
  // A coach name saved elsewhere replaces the untouched suggestion.
  useEffect(() => {
    reset(profileFrom(profile), { keepDirtyValues: true });
    if (
      offered !== undefined &&
      profile.display_name !== null &&
      getValues("display_name") === offered
    ) {
      resetField("display_name", { defaultValue: profile.display_name });
    }
  }, [profile, reset, resetField, getValues, offered]);
  const { dirtyFields } = formState;
  const showsSuggestion =
    offered !== undefined && profile.display_name === null && values.display_name === offered;

  function showErrors(errors: Partial<Record<string, FieldMessage>>) {
    const invalid = FIELDS.filter((field) => errors[field] !== undefined);
    for (const field of invalid) {
      const key = errors[field];
      if (key !== undefined) setError(field, { type: "validate", message: t(`errors.${key}`) });
    }
    const first = invalid[0];
    if (first === "languages") {
      document.querySelector<HTMLElement>('[data-field="languages"] input')?.focus();
    } else if (first !== undefined) {
      setFocus(first);
    }
    return invalid.length > 0;
  }

  /** Saves the form; `true` once the API accepted it (or there was nothing to save). */
  async function persist(requireComplete: boolean): Promise<boolean> {
    if (busy) return false;
    clearErrors();
    setProblem(undefined);
    const current = getValues();
    const errors = profileErrors(current);
    // Leaving early saves a partial step, but never a value the API would refuse.
    if (
      showErrors(
        requireComplete
          ? errors
          : Object.fromEntries(Object.entries(errors).filter(([, key]) => key === "tooLong")),
      )
    ) {
      setProblem({ kind: "invalid" });
      return false;
    }
    // Only what changed here: another client's newer values are never overwritten.
    const changed = changedOnly(profilePatch(current), dirtyFields);
    if (Object.keys(changed).length === 0) return true;
    setBusy(true);
    try {
      reset(profileFrom(await save(changed)));
      return true;
    } catch (error) {
      const rejection = rejectionOf(error);
      if (rejection !== undefined) {
        showErrors(rejection.fields);
        setProblem({ kind: "invalid" });
      } else {
        setProblem({ kind: "failure", action: "save" });
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  const advance = async () => {
    retry.current = () => void advance();
    if (await persist(true)) onDone("type");
  };

  // The frame and the step card save through the same path (no completeness check).
  const latestPersist = useRef(persist);
  useEffect(() => {
    latestPersist.current = persist;
  });
  useEffect(() => registerSaver(() => latestPersist.current(false)), [registerSaver]);

  const error = (field: keyof ProfileValues) => formState.errors[field]?.message;
  const invalid = (field: keyof ProfileValues) => error(field) !== undefined || undefined;

  return (
    <>
      <div className="flex min-w-0 flex-col gap-5.5">
        <hgroup className="flex flex-col gap-2">
          <p className="type-label text-highlight">{t("profile.eyebrow")}</p>
          <h1 tabIndex={-1} className="type-onboarding-title outline-none">
            {t("profile.title")}
          </h1>
          <p className="type-body-lg text-pretty text-muted-foreground">{t("profile.lead")}</p>
        </hgroup>
        <StepNotice problem={problem} draft="typed" onRetry={() => retry.current?.()} />
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void advance();
          }}
          className="flex min-w-0 flex-col gap-5.5"
        >
          <div className="flex min-w-0 flex-col gap-4">
            <FormField
              id="coach-name"
              label={t("profile.name.label")}
              help={showsSuggestion ? t("profile.name.suggested") : t("profile.name.help")}
              error={error("display_name")}
            >
              <Counted
                count={t("profile.count", {
                  count: lengthOf(values.display_name ?? ""),
                  max: LIMITS.display_name,
                })}
              >
                <Input
                  id="coach-name"
                  fieldSize="lg"
                  autoComplete="off"
                  placeholder={t("profile.name.placeholder")}
                  className="pr-16"
                  aria-invalid={invalid("display_name")}
                  aria-describedby={describedBy("coach-name")}
                  {...register("display_name")}
                />
              </Counted>
            </FormField>
            <FormField
              id="coach-brand"
              label={t("profile.brand.label")}
              help={t("profile.brand.help")}
              error={error("brand_name")}
            >
              <Input
                id="coach-brand"
                fieldSize="lg"
                autoComplete="organization"
                placeholder={t("profile.brand.placeholder")}
                aria-invalid={invalid("brand_name")}
                aria-describedby={describedBy("coach-brand")}
                {...register("brand_name")}
              />
            </FormField>
            <div className="grid min-w-0 gap-3.5 sm:grid-cols-2">
              <FormField
                id="coach-country"
                label={t("profile.country.label")}
                help={t("profile.country.help")}
                error={error("country_code")}
              >
                <Controller
                  control={control}
                  name="country_code"
                  render={({ field }) => (
                    <Combobox
                      id="coach-country"
                      value={field.value}
                      onValueChange={field.onChange}
                      options={countries}
                      placeholder={t("profile.country.placeholder")}
                      searchLabel={t("profile.country.search")}
                      searchPlaceholder={t("profile.country.searchPlaceholder")}
                      emptyLabel={t("profile.country.empty")}
                      invalid={error("country_code") !== undefined}
                      aria-describedby={describedBy("coach-country")}
                    />
                  )}
                />
              </FormField>
              <FormField
                id="coach-city"
                label={t("profile.city.label")}
                help={t("profile.city.help")}
                error={error("city")}
              >
                <Input
                  id="coach-city"
                  fieldSize="lg"
                  autoComplete="address-level2"
                  placeholder={t("profile.city.placeholder")}
                  aria-invalid={invalid("city")}
                  aria-describedby={describedBy("coach-city")}
                  {...register("city")}
                />
              </FormField>
            </div>
            <FormField
              id="coach-bio"
              label={t("profile.bio.label")}
              help={t("profile.bio.help")}
              error={error("bio")}
            >
              <Counted
                position="bottom"
                count={t("profile.count", { count: lengthOf(values.bio ?? ""), max: LIMITS.bio })}
              >
                <Textarea
                  id="coach-bio"
                  rows={3}
                  placeholder={t("profile.bio.placeholder")}
                  className="min-h-24 border-input bg-background px-3.5 pt-3 pb-8 type-body font-semibold"
                  aria-invalid={invalid("bio")}
                  aria-describedby={describedBy("coach-bio")}
                  {...register("bio")}
                />
              </Counted>
            </FormField>
            <ChoiceField
              id="coach-languages"
              legend={t("profile.languages.label")}
              error={error("languages")}
            >
              <div data-field="languages" className="flex flex-wrap gap-2">
                {LANGUAGES.map((language) => {
                  const checked = values.languages?.includes(language) ?? false;
                  return (
                    <label key={language} lang={language} className={pillClass(checked)}>
                      <input
                        type="checkbox"
                        value={language}
                        className="sr-only"
                        {...register("languages")}
                      />
                      {checked && <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />}
                      {t(`profile.languages.options.${language}`)}
                    </label>
                  );
                })}
              </div>
              {error("languages") === undefined && (
                <p className="type-caption text-faint-foreground">{t("profile.languages.help")}</p>
              )}
            </ChoiceField>
          </div>
          <div className="mt-1 flex items-center gap-2.5 border-t border-border-subtle pt-2.5">
            <span className="flex-1" />
            <Button type="submit" size="lg" className="min-w-30" loading={busy}>
              {busy ? t("profile.saving") : t("profile.continue")}
            </Button>
          </div>
        </form>
      </div>
      <aside className="flex min-w-0 flex-col gap-3.5">
        <CoachPreview values={values} />
      </aside>
    </>
  );
}

/** A text field with its character count inside, at the right (name) or bottom right (bio). */
function Counted({
  count,
  position = "end",
  children,
}: {
  count: string;
  position?: "end" | "bottom";
  children: ReactNode;
}) {
  return (
    <div className="relative">
      {children}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-3.5 flex items-center type-micro font-mono text-faint-foreground",
          position === "end" ? "inset-y-0" : "bottom-2.5",
        )}
      >
        {count}
      </span>
    </div>
  );
}
