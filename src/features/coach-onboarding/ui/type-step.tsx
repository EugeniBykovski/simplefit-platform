"use client";

import { CheckIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import type { CoachProfile, CoachProfilePatch } from "@/entities/coach-profile";
import { changedOnly } from "@/shared/lib/forms";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { ChoiceField } from "@/shared/ui/form-field";

import { rejectionOf, type FieldMessage } from "../model/errors";
import {
  COACHING_FORMATS,
  COMPETITION_LEVELS,
  profileFrom,
  typeErrors,
  typeFrom,
  typePatch,
  type TypeValues,
} from "../model/form-values";
import { REQUIREMENT_STEP, type FormStep } from "../model/steps";
import { CoachTypePreview } from "./coach-preview";
import { pillClass } from "./pill";
import type { StepSaver } from "./profile-step";
import { StepNotice, type ProfileRequirement, type StepProblem } from "./step-notice";

const FIELDS = [
  "coaching_formats",
  "competition_levels",
] as const satisfies readonly (keyof TypeValues)[];

/**
 * WCR2 "How do you coach?": the coaching formats (at least one) and the
 * optional competition levels, in the SF-50 vocabulary. Back saves what
 * changed and returns to WCR1; Finish saves, then asks the API to complete
 * onboarding (`complete-onboarding`), and only its success moves on: missing
 * Coach profile details are listed with a way back, a missing account
 * registration links to it.
 */
export function TypeStep({
  profile,
  save,
  complete,
  onBack,
  onCompleted,
  accountHref,
  registerSaver,
}: {
  profile: CoachProfile;
  save: (patch: CoachProfilePatch) => Promise<CoachProfile>;
  complete: () => Promise<CoachProfile>;
  onBack: (step: FormStep) => void;
  onCompleted: () => void;
  /** Account registration (WA5), with the Coach continuation. */
  accountHref: string;
  registerSaver: (saver: StepSaver) => void;
}) {
  const t = useTranslations("coachOnboarding");
  const form = useForm<TypeValues>({ defaultValues: typeFrom(profile) });
  const { register, control, setError, clearErrors, getValues, reset, formState } = form;
  const values = useWatch({ control }) as TypeValues;
  const [busy, setBusy] = useState<"save" | "finish" | undefined>();
  const [problem, setProblem] = useState<StepProblem>();
  const retry = useRef<() => void>(undefined);

  // A newer backend profile updates every field not being edited here.
  useEffect(() => {
    reset(typeFrom(profile), { keepDirtyValues: true });
  }, [profile, reset]);
  const { dirtyFields } = formState;

  function showErrors(errors: Partial<Record<string, FieldMessage>>) {
    const invalid = FIELDS.filter((field) => errors[field] !== undefined);
    for (const field of invalid) {
      const key = errors[field];
      if (key !== undefined) setError(field, { type: "validate", message: t(`errors.${key}`) });
    }
    const first = invalid[0];
    if (first !== undefined)
      document.querySelector<HTMLElement>(`[data-field="${first}"] input`)?.focus();
    return invalid.length > 0;
  }

  /** Saves the changed values; `true` once the API accepted them (or nothing changed). */
  async function persist(requireComplete: boolean, action: "save" | "finish"): Promise<boolean> {
    clearErrors();
    setProblem(undefined);
    const current = getValues();
    if (requireComplete && showErrors(typeErrors(current))) {
      setProblem({ kind: "invalid" });
      return false;
    }
    // Only what changed here: another client's newer values are never overwritten.
    const changed = changedOnly(typePatch(current), dirtyFields);
    if (Object.keys(changed).length === 0) return true;
    try {
      reset(typeFrom(await save(changed)));
      return true;
    } catch (error) {
      const rejection = rejectionOf(error);
      if (rejection !== undefined) {
        showErrors(rejection.fields);
        setProblem({ kind: "invalid" });
      } else {
        setProblem({ kind: "failure", action });
      }
      return false;
    }
  }

  async function back() {
    if (busy) return;
    retry.current = () => void back();
    setBusy("save");
    try {
      if (await persist(false, "save")) onBack("profile");
    } finally {
      setBusy(undefined);
    }
  }

  async function finish() {
    if (busy) return;
    retry.current = () => void finish();
    setBusy("finish");
    try {
      if (!(await persist(true, "finish"))) return;
      try {
        await complete();
        onCompleted();
      } catch (error) {
        const rejection = rejectionOf(error);
        if (rejection === undefined) {
          setProblem({ kind: "failure", action: "finish" });
        } else if (rejection.accountRegistration) {
          setProblem({ kind: "account", href: accountHref });
        } else {
          const stepOf = (field: string) =>
            REQUIREMENT_STEP[field as keyof typeof REQUIREMENT_STEP] as FormStep | undefined;
          const own = rejection.missing.filter((field) => stepOf(field) === "type");
          const elsewhere = rejection.missing.filter(
            (field): field is ProfileRequirement => stepOf(field) === "profile",
          );
          showErrors(Object.fromEntries(own.map((field) => [field, rejection.fields[field]])));
          setProblem(
            elsewhere.length > 0 ? { kind: "rejected", profile: elsewhere } : { kind: "invalid" },
          );
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
  useEffect(() => registerSaver(() => latestPersist.current(false, "save")), [registerSaver]);

  const formatsError = formState.errors.coaching_formats?.message;
  const levelsError = formState.errors.competition_levels?.message;

  return (
    <>
      <div className="flex min-w-0 flex-col gap-5.5">
        <hgroup className="flex flex-col gap-2">
          <p className="type-label text-highlight">{t("type.eyebrow")}</p>
          <h1 tabIndex={-1} className="type-onboarding-title outline-none">
            {t("type.title")}
          </h1>
          <p className="type-body-lg text-pretty text-muted-foreground">{t("type.lead")}</p>
        </hgroup>
        <StepNotice
          problem={problem}
          draft="selected"
          onRetry={() => retry.current?.()}
          onGoProfile={() => void back()}
        />
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void finish();
          }}
          className="flex min-w-0 flex-col gap-5.5"
        >
          <div className="flex min-w-0 flex-col gap-5">
            <ChoiceField
              id="coach-formats"
              legend={t("type.formats.label")}
              hint={formatsError ?? t("type.formats.help")}
              hintInvalid={formatsError !== undefined}
            >
              <div data-field="coaching_formats" className="grid min-w-0 gap-3 sm:grid-cols-2">
                {COACHING_FORMATS.map((format) => {
                  const checked = values.coaching_formats?.includes(format) ?? false;
                  return (
                    <label
                      key={format}
                      className={cn(
                        "flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
                        checked
                          ? "border-[1.5px] border-highlight bg-accent text-accent-foreground"
                          : cn(
                              "bg-surface text-foreground",
                              formatsError !== undefined && "border-[1.5px] border-destructive",
                            ),
                      )}
                    >
                      <input
                        type="checkbox"
                        value={format}
                        className="sr-only"
                        {...register("coaching_formats")}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="type-body-lg font-extrabold">
                          {t(`type.formats.options.${format}.label`)}
                        </span>
                        <span
                          className={cn(
                            "type-caption",
                            checked ? "text-accent-muted-foreground" : "text-muted-foreground",
                          )}
                        >
                          {t(`type.formats.options.${format}.description`)}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-5.5 flex-none items-center justify-center rounded-xs",
                          checked
                            ? "bg-highlight text-highlight-foreground"
                            : "border-2 border-border-strong",
                        )}
                      >
                        {checked && <CheckIcon className="size-3.5" strokeWidth={3} />}
                      </span>
                    </label>
                  );
                })}
              </div>
            </ChoiceField>
            <ChoiceField
              id="coach-levels"
              legend={t("type.levels.label")}
              hint={levelsError ?? t("type.levels.help")}
              hintInvalid={levelsError !== undefined}
            >
              <div data-field="competition_levels" className="flex flex-wrap gap-2">
                {COMPETITION_LEVELS.map((level) => {
                  const checked = values.competition_levels?.includes(level) ?? false;
                  return (
                    <label key={level} className={pillClass(checked)}>
                      <input
                        type="checkbox"
                        value={level}
                        className="sr-only"
                        {...register("competition_levels")}
                      />
                      {checked && <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />}
                      {t(`type.levels.options.${level}`)}
                    </label>
                  );
                })}
              </div>
            </ChoiceField>
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
              {t("type.back")}
            </Button>
            <span className="flex-1" />
            <Button
              type="submit"
              size="lg"
              className="min-w-30"
              loading={busy === "finish"}
              disabled={busy !== undefined}
            >
              {busy === "finish" ? t("type.finishing") : t("type.finish")}
            </Button>
          </div>
        </form>
      </div>
      <aside className="flex min-w-0 flex-col gap-3.5">
        <CoachTypePreview profile={profileFrom(profile)} values={values} />
      </aside>
    </>
  );
}
