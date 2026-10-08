"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

import type { FighterProfile, FighterProfilePatch } from "@/entities/fighter-profile";
import { changedOnly } from "@/shared/lib/forms";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

import { rejectionOf, type FieldMessage } from "../model/errors";
import {
  basicsFrom,
  EXPERIENCE_LEVELS,
  GOALS,
  profileFrom,
  profilePatch,
  STANCES,
  WEIGHT_CLASSES,
  type ProfileValues,
} from "../model/form-values";
import { REQUIREMENT_STEP, type FormStep } from "../model/steps";
import type { StepSaver } from "./basics-step";
import { ChoiceField, describedBy, FormField } from "./form-field";
import { ProfileSummary } from "./profile-preview";
import { StepNotice, type StepProblem } from "./step-notice";

const FIELDS = [
  "experience_level",
  "stance",
  "amateur_bout_count",
  "goals",
  "weight_class",
  "current_weight_kg",
  "height_cm",
  "next_fight_on",
  "next_fight_name",
] as const satisfies readonly (keyof ProfileValues)[];

/** A segment of the Experience / Stance groups: a native radio drawn as the artboard's pill. */
const segmentClass =
  "relative flex h-9 cursor-pointer items-center justify-center rounded-xl px-1.5 text-center type-caption font-bold text-muted-foreground transition-colors has-checked:bg-secondary has-checked:font-extrabold has-checked:text-secondary-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring";

/**
 * WF1 "Your boxing profile": experience, stance, amateur bouts, goals, weight
 * class, current weight, height and the next fight, every value in the SF-25
 * vocabulary. Back saves what changed and returns to WF0; Finish saves, then
 * asks the API to complete onboarding (`complete-onboarding`), and only its
 * success moves on: missing requirements stay on screen with their fields
 * marked, Profile basics ones listed with a way back.
 */
export function ProfileStep({
  profile,
  save,
  complete,
  onBack,
  onCompleted,
  accountHref,
  registerSaver,
}: {
  profile: FighterProfile;
  save: (patch: FighterProfilePatch) => Promise<FighterProfile>;
  complete: () => Promise<FighterProfile>;
  onBack: (step: FormStep) => void;
  onCompleted: () => void;
  /** Account registration (WA5), with the Fighter continuation. */
  accountHref: string;
  registerSaver: (saver: StepSaver) => void;
}) {
  const t = useTranslations("fighterOnboarding");
  const form = useForm<ProfileValues>({ defaultValues: profileFrom(profile) });
  const { register, control, setError, clearErrors, setFocus, reset, formState } = form;
  const values = useWatch({ control }) as ProfileValues;
  const [busy, setBusy] = useState<"save" | "finish" | undefined>();
  const [problem, setProblem] = useState<StepProblem>();
  const retry = useRef<() => void>(undefined);

  // A newer backend profile updates every field not being edited here.
  useEffect(() => {
    reset(profileFrom(profile), { keepDirtyValues: true });
  }, [profile, reset]);
  const { dirtyFields } = formState;

  const basicsLabels: Record<string, string> = {
    display_name: t("basics.name.label"),
    username: t("basics.username.label"),
    country_code: t("basics.country.label"),
    city: t("basics.city.label"),
  };
  const profileLabels: Record<string, string> = {
    experience_level: t("profile.experience.label"),
    stance: t("profile.stance.label"),
  };

  function showErrors(errors: Partial<Record<string, FieldMessage>>) {
    const invalid = FIELDS.filter((field) => errors[field] !== undefined);
    for (const field of invalid) {
      const key = errors[field];
      if (key !== undefined) setError(field, { type: "validate", message: t(`errors.${key}`) });
    }
    const first = invalid.find((field) => field !== "goals");
    if (first !== undefined) {
      if (first === "experience_level" || first === "stance" || first === "weight_class") {
        document
          .querySelector<HTMLElement>(
            `[data-field="${first}"] input, [data-field="${first}"] button`,
          )
          ?.focus();
      } else {
        setFocus(first);
      }
    }
    return invalid.length > 0;
  }

  /** Saves the changed values; `true` once the API accepted them (or nothing changed). */
  async function persist(): Promise<boolean> {
    clearErrors();
    setProblem(undefined);
    const parsed = profilePatch(form.getValues());
    if (showErrors(parsed.errors)) {
      setProblem("invalid");
      return false;
    }
    // Only what changed here: another client's newer values are never overwritten.
    const changed = changedOnly(parsed.patch, dirtyFields);
    if (Object.keys(changed).length === 0) return true;
    try {
      reset(profileFrom(await save(changed)));
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
    }
  }

  async function back() {
    if (busy) return;
    retry.current = () => void back();
    setBusy("save");
    try {
      if (await persist()) onBack("basics");
    } finally {
      setBusy(undefined);
    }
  }

  async function finish() {
    if (busy) return;
    retry.current = () => void finish();
    setBusy("finish");
    try {
      if (!(await persist())) return;
      try {
        await complete();
        onCompleted();
      } catch (error) {
        const rejection = rejectionOf(error);
        if (rejection === undefined) {
          setProblem("failure");
        } else if (rejection.accountRegistration) {
          setProblem({ kind: "account", href: accountHref });
        } else {
          const ownMissing = rejection.missing.filter(
            (field) => REQUIREMENT_STEP[field as keyof typeof REQUIREMENT_STEP] === "profile",
          );
          const basicsMissing = rejection.missing.filter(
            (field) => REQUIREMENT_STEP[field as keyof typeof REQUIREMENT_STEP] === "basics",
          );
          showErrors(
            Object.fromEntries(ownMissing.map((field) => [field, rejection.fields[field]])),
          );
          setProblem({
            kind: "rejected",
            basics: basicsMissing.map((field) => basicsLabels[field] ?? field),
            profile: ownMissing.map((field) => profileLabels[field] ?? field),
          });
        }
      }
    } finally {
      setBusy(undefined);
    }
  }

  const latestPersist = useRef(persist);
  useEffect(() => {
    latestPersist.current = persist;
  });
  useEffect(() => registerSaver(() => latestPersist.current()), [registerSaver]);

  const error = (field: keyof ProfileValues) => formState.errors[field]?.message;

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
        <StepNotice
          problem={problem}
          draft="selected"
          onRetry={() => retry.current?.()}
          onGoBasics={() => void back()}
        />
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void finish();
          }}
          className="flex min-w-0 flex-col gap-5.5"
        >
          <div className="flex min-w-0 flex-col gap-4.5">
            <ChoiceField
              id="fighter-experience"
              legend={t("profile.experience.label")}
              error={error("experience_level")}
            >
              <div
                data-field="experience_level"
                className={cn(
                  "grid grid-cols-2 gap-1 rounded-3xl border bg-surface p-1 sm:grid-cols-5",
                  error("experience_level") && "border-destructive",
                )}
              >
                {EXPERIENCE_LEVELS.map((level) => (
                  <label key={level} className={segmentClass}>
                    <input
                      type="radio"
                      value={level}
                      className="sr-only"
                      {...register("experience_level")}
                    />
                    {t(`profile.experience.options.${level}`)}
                  </label>
                ))}
              </div>
            </ChoiceField>
            <div className="grid min-w-0 gap-3.5 sm:grid-cols-2">
              <ChoiceField
                id="fighter-stance"
                legend={t("profile.stance.label")}
                error={error("stance")}
              >
                <div
                  data-field="stance"
                  className={cn(
                    "grid grid-cols-3 gap-1 rounded-3xl border bg-surface p-1",
                    error("stance") && "border-destructive",
                  )}
                >
                  {STANCES.map((stance) => (
                    <label key={stance} className={segmentClass}>
                      <input
                        type="radio"
                        value={stance}
                        className="sr-only"
                        {...register("stance")}
                      />
                      {t(`profile.stance.options.${stance}`)}
                    </label>
                  ))}
                </div>
              </ChoiceField>
              <FormField
                id="fighter-bouts"
                label={t("profile.bouts.label")}
                help={t("profile.bouts.help")}
                error={error("amateur_bout_count")}
              >
                <Input
                  id="fighter-bouts"
                  fieldSize="lg"
                  inputMode="numeric"
                  placeholder={t("profile.bouts.placeholder")}
                  aria-invalid={error("amateur_bout_count") !== undefined || undefined}
                  aria-describedby={describedBy("fighter-bouts")}
                  {...register("amateur_bout_count")}
                />
              </FormField>
            </div>
            <ChoiceField
              id="fighter-goals"
              legend={t("profile.goals.label")}
              error={error("goals")}
            >
              <div data-field="goals" className="flex flex-wrap gap-2">
                {GOALS.map((goal) => {
                  const checked = values.goals?.includes(goal) ?? false;
                  return (
                    <label
                      key={goal}
                      className={cn(
                        "flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 type-body-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                        checked
                          ? "border-[1.5px] border-primary-muted bg-accent font-extrabold text-accent-foreground"
                          : "border-input font-bold text-muted-foreground",
                      )}
                    >
                      <input
                        type="checkbox"
                        value={goal}
                        className="sr-only"
                        {...register("goals")}
                      />
                      {checked && <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />}
                      {t(`profile.goals.options.${goal}`)}
                    </label>
                  );
                })}
              </div>
            </ChoiceField>
            <div className="grid min-w-0 gap-3.5 sm:grid-cols-3">
              <FormField
                id="fighter-weight-class"
                label={t("profile.weightClass.label")}
                error={error("weight_class")}
              >
                <Controller
                  control={control}
                  name="weight_class"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? ""}
                      onValueChange={(value) => field.onChange(value)}
                    >
                      <SelectTrigger
                        id="fighter-weight-class"
                        data-field="weight_class"
                        aria-invalid={error("weight_class") !== undefined || undefined}
                        className="h-11 w-full border-input bg-background px-3.5 type-body font-semibold data-[size=default]:h-11"
                      >
                        <SelectValue placeholder={t("profile.weightClass.placeholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {WEIGHT_CLASSES.map((weightClass) => (
                          <SelectItem key={weightClass} value={weightClass}>
                            {t(`profile.weightClass.options.${weightClass}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </FormField>
              <FormField
                id="fighter-weight"
                label={t("profile.weight.label")}
                help={t("profile.weight.help")}
                error={error("current_weight_kg")}
              >
                <UnitInput unit={t("profile.weight.unit")}>
                  <Input
                    id="fighter-weight"
                    fieldSize="lg"
                    inputMode="decimal"
                    placeholder={t("profile.weight.placeholder")}
                    className="pr-10"
                    aria-invalid={error("current_weight_kg") !== undefined || undefined}
                    aria-describedby={describedBy("fighter-weight")}
                    {...register("current_weight_kg")}
                  />
                </UnitInput>
              </FormField>
              <FormField
                id="fighter-height"
                label={t("profile.height.label")}
                error={error("height_cm")}
              >
                <UnitInput unit={t("profile.height.unit")}>
                  <Input
                    id="fighter-height"
                    fieldSize="lg"
                    inputMode="numeric"
                    placeholder={t("profile.height.placeholder")}
                    className="pr-10"
                    aria-invalid={error("height_cm") !== undefined || undefined}
                    aria-describedby={describedBy("fighter-height")}
                    {...register("height_cm")}
                  />
                </UnitInput>
              </FormField>
            </div>
            <div className="grid min-w-0 gap-3.5 sm:grid-cols-2">
              <FormField
                id="fighter-fight-date"
                label={t("profile.fightDate.label")}
                error={error("next_fight_on")}
              >
                <Input
                  id="fighter-fight-date"
                  type="date"
                  fieldSize="lg"
                  aria-invalid={error("next_fight_on") !== undefined || undefined}
                  aria-describedby={describedBy("fighter-fight-date")}
                  {...register("next_fight_on")}
                />
              </FormField>
              <FormField
                id="fighter-fight-event"
                label={t("profile.fightEvent.label")}
                error={error("next_fight_name")}
              >
                <Input
                  id="fighter-fight-event"
                  fieldSize="lg"
                  placeholder={t("profile.fightEvent.placeholder")}
                  aria-invalid={error("next_fight_name") !== undefined || undefined}
                  aria-describedby={describedBy("fighter-fight-event")}
                  {...register("next_fight_name")}
                />
              </FormField>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2.5 border-t border-border-subtle pt-2.5">
            <Button
              type="button"
              variant="quiet"
              size="lg"
              loading={busy === "save"}
              disabled={busy !== undefined}
              onClick={() => void back()}
            >
              {t("profile.back")}
            </Button>
            <span className="flex-1" />
            <Button
              type="submit"
              size="lg"
              className="min-w-30"
              loading={busy === "finish"}
              disabled={busy !== undefined}
            >
              {busy === "finish" ? t("profile.finishing") : t("profile.finish")}
            </Button>
          </div>
        </form>
      </div>
      <aside className="flex min-w-0 flex-col gap-3.5">
        <ProfileSummary basics={basicsFrom(profile)} values={values} />
      </aside>
    </>
  );
}

/** A number field with its unit at the right (kg, cm), as WF1 draws it. */
function UnitInput({ unit, children }: { unit: string; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center type-caption text-faint-foreground"
      >
        {unit}
      </span>
    </div>
  );
}
