"use client";

import { CheckIcon, ImageOffIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import type { GymSetup, GymSetupPatch } from "@/entities/gym-setup";
import { changedOnly } from "@/shared/lib/forms";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { ChoiceField, describedBy, FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";

import type { FieldMessage, Requirement } from "../model/errors";
import {
  ACCENT_COLORS,
  brandErrors,
  brandFrom,
  brandPatch,
  lengthOf,
  LIMITS,
  type AccentColor,
  type BrandValues,
} from "../model/form-values";
import { REQUIREMENT_STEP, type FormStep } from "../model/steps";
import { accentStyle, initialsOf, PhonePreview } from "./previews";
import { SaveStatus, StepBody, StepFooter, StepHeader } from "./setup-frame";
import { StepNotice } from "./step-notice";
import { Counted, type StepSaver } from "./type-step";
import { useStepFailure } from "./use-step-failure";

const FIELDS = ["tagline", "accent_color"] as const satisfies readonly (keyof BrandValues)[];

/** The swatch names, in contract order (`gymOnboarding.branding.accent.colors`). */
const COLOR_NAME = {
  "#aeb95a": "olive",
  "#e3a24f": "amber",
  "#e07a5f": "coral",
  "#7fa7c9": "sky",
  "#edefe7": "bone",
  "#8d9840": "moss",
} as const satisfies Record<AccentColor, string>;

/**
 * OG3 "Branding", all optional: a tagline and one of the six accent swatches.
 * Logo and cover photo uploads do not exist yet, so both say so instead of
 * offering a fake upload; there is no public address (approved SF-86
 * differences). "Create gym" saves what changed, then asks the API to
 * complete the setup (`completeGymSetup`); "Skip" completes without the
 * branding edits. Only the API's success moves on to OG6b: missing
 * requirements are listed with a way to their step.
 */
export function BrandingStep({
  setup,
  save,
  reload,
  complete,
  accountHref,
  onNavigate,
  onCompleted,
  onSaveExit,
  registerSaver,
  onRestart,
}: {
  setup: GymSetup;
  save: (setup: GymSetup, patch: GymSetupPatch) => Promise<GymSetup>;
  reload: () => Promise<GymSetup>;
  complete: (setup: GymSetup) => Promise<GymSetup>;
  accountHref: string;
  onNavigate: (step: FormStep) => void;
  onCompleted: () => void;
  onSaveExit: () => void;
  registerSaver: (saver: StepSaver) => void;
  /** The gym is gone (discarded elsewhere, or no longer the viewer's): look again. */
  onRestart?: () => void;
}) {
  const t = useTranslations("gymOnboarding");
  const form = useForm<BrandValues>({ defaultValues: brandFrom(setup) });
  const {
    register,
    control,
    setError,
    clearErrors,
    setFocus,
    setValue,
    getValues,
    reset,
    formState,
  } = form;
  const values = useWatch({ control }) as BrandValues;
  const [busy, setBusy] = useState<"save" | "finish" | "skip" | undefined>();
  // The action a Retry or Reapply repeats, run with this render's values.
  const retry = useRef<"finish" | "skip" | "back">("finish");

  useEffect(() => {
    reset(brandFrom(setup), { keepDirtyValues: true });
  }, [setup, reset]);
  const { dirtyFields, isDirty } = formState;

  const showErrors = useCallback(
    (errors: Partial<Record<string, FieldMessage>>) => {
      const invalid = FIELDS.filter((field) => errors[field] !== undefined);
      for (const field of invalid) {
        const key = errors[field];
        if (key !== undefined) setError(field, { type: "validate", message: t(`errors.${key}`) });
      }
      if (invalid[0] === "tagline") setFocus("tagline");
      else if (invalid[0] === "accent_color")
        document.querySelector<HTMLElement>('[data-field="accent_color"] input')?.focus();
      return invalid.length > 0;
    },
    [setError, setFocus, t],
  );
  const { problem, setProblem, fail } = useStepFailure({ reload, accountHref, showErrors });

  /** Saves what changed; `true` once the API accepted it (or nothing changed). */
  async function persist(): Promise<boolean> {
    clearErrors();
    setProblem(undefined);
    const current = getValues();
    if (showErrors(brandErrors(current))) {
      setProblem({ kind: "invalid" });
      return false;
    }
    const changed = changedOnly(brandPatch(current), dirtyFields);
    if (Object.keys(changed).length === 0) return true;
    try {
      reset(brandFrom(await save(setup, changed)));
      return true;
    } catch (error) {
      await fail(error, "save");
      return false;
    }
  }

  async function finish(withBranding: boolean) {
    if (busy) return;
    retry.current = withBranding ? "finish" : "skip";
    setBusy(withBranding ? "finish" : "skip");
    try {
      if (withBranding) {
        if (!(await persist())) return;
      } else {
        // Skip: the branding edits are left out, by the visitor's choice.
        clearErrors();
        setProblem(undefined);
        reset(brandFrom(setup));
      }
      try {
        await complete(setup);
        onCompleted();
      } catch (error) {
        await fail(error, "finish");
      }
    } finally {
      setBusy(undefined);
    }
  }

  const leave = async () => {
    if (busy) return false;
    setBusy("save");
    try {
      return await persist();
    } finally {
      setBusy(undefined);
    }
  };
  const back = async () => {
    retry.current = "back";
    if (await leave()) onNavigate("location");
  };

  const latestLeave = useRef(leave);
  useEffect(() => {
    latestLeave.current = leave;
  });
  useEffect(() => registerSaver(() => latestLeave.current()), [registerSaver]);

  const repeat = () =>
    void (retry.current === "back" ? back() : finish(retry.current === "finish"));
  const goTo = (requirement: Requirement) => onNavigate(REQUIREMENT_STEP[requirement]);
  const error = (field: keyof BrandValues) => formState.errors[field]?.message;
  const initials = initialsOf(setup.name);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void finish(true);
      }}
      className="flex flex-1 flex-col"
    >
      <StepHeader
        eyebrow={t("branding.eyebrow")}
        title={t("branding.title")}
        lead={t("branding.lead")}
        status={<SaveStatus state={isDirty ? "unsaved" : "saved"} />}
      />
      <StepBody
        aside={
          <PhonePreview
            name={setup.name}
            city={setup.primary_location?.city ?? null}
            gymType={setup.gym_type}
            tagline={values.tagline ?? ""}
            accent={values.accent_color ?? null}
          />
        }
      >
        <StepNotice
          problem={problem}
          onRetry={repeat}
          onReapply={repeat}
          onGoTo={goTo}
          onRestart={onRestart}
        />
        <div className="grid min-w-0 gap-6 md:grid-cols-[160px_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-2" data-unavailable="logo">
            <p className="type-caption font-bold text-muted-foreground">
              {t("branding.logo.label")}
            </p>
            <span
              aria-hidden
              style={accentStyle(values.accent_color ?? null)}
              className={cn(
                "flex size-35 items-center justify-center rounded-4xl type-h1 font-display",
                (values.accent_color ?? null) === null && "bg-primary text-primary-foreground",
              )}
            >
              {initials}
            </span>
            <p className="type-micro text-faint-foreground">{t("branding.logo.unavailable")}</p>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <ChoiceField
              id="gym-accent"
              legend={t("branding.accent.label")}
              error={error("accent_color")}
            >
              <div data-field="accent_color" className="flex flex-wrap items-center gap-2.5">
                {ACCENT_COLORS.map((color) => {
                  const checked = values.accent_color === color;
                  return (
                    <label
                      key={color}
                      title={t(`branding.accent.colors.${COLOR_NAME[color]}`)}
                      className={cn(
                        "flex size-8.5 cursor-pointer items-center justify-center rounded-sm has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-background",
                        checked && "ring-2 ring-highlight ring-offset-2 ring-offset-background",
                      )}
                      style={accentStyle(color)}
                    >
                      <input
                        type="radio"
                        value={color}
                        className="sr-only"
                        aria-label={t(`branding.accent.colors.${COLOR_NAME[color]}`)}
                        {...register("accent_color")}
                      />
                      {checked && <CheckIcon aria-hidden className="size-4" strokeWidth={3} />}
                    </label>
                  );
                })}
                {values.accent_color && (
                  <button
                    type="button"
                    onClick={() => setValue("accent_color", null, { shouldDirty: true })}
                    className="ml-1 rounded-xs type-caption font-extrabold text-muted-foreground underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t("branding.accent.clear")}
                  </button>
                )}
              </div>
              <p className="type-caption text-primary-muted">{t("branding.accent.help")}</p>
            </ChoiceField>
            <FormField
              id="gym-tagline"
              label={t("branding.tagline.label")}
              help={t("branding.tagline.help")}
              error={error("tagline")}
            >
              <Counted
                count={t("type.count", {
                  count: lengthOf(values.tagline ?? ""),
                  max: LIMITS.tagline,
                })}
              >
                <Input
                  id="gym-tagline"
                  fieldSize="lg"
                  autoComplete="off"
                  placeholder={t("branding.tagline.placeholder")}
                  className="pr-16"
                  aria-invalid={error("tagline") !== undefined || undefined}
                  aria-describedby={describedBy("gym-tagline")}
                  {...register("tagline")}
                />
              </Counted>
            </FormField>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2" data-unavailable="cover">
          <p className="type-caption font-bold text-muted-foreground">
            {t("branding.cover.label")}
          </p>
          <div className="flex min-h-27.5 items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-border-strong px-4 py-3 text-center type-body-sm font-bold text-faint-foreground">
            <ImageOffIcon aria-hidden className="size-4.5 flex-none" />
            {t("branding.cover.unavailable")}
          </div>
        </div>
      </StepBody>
      <StepFooter
        back={
          <Button
            type="button"
            variant="quiet"
            size="lg"
            onClick={() => void back()}
            disabled={busy !== undefined}
          >
            {t("back")}
          </Button>
        }
        note={t("branding.note")}
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="text-muted-foreground"
              onClick={onSaveExit}
              disabled={busy !== undefined}
            >
              {t("frame.saveExit")}
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="lg"
              onClick={() => void finish(false)}
              loading={busy === "skip"}
              disabled={busy !== undefined && busy !== "skip"}
            >
              {busy === "skip" ? t("branding.creating") : t("branding.skip")}
            </Button>
            <Button
              type="submit"
              size="lg"
              className="min-w-30"
              loading={busy === "finish"}
              disabled={busy !== undefined && busy !== "finish"}
            >
              {busy === "finish" ? t("branding.creating") : t("branding.create")}
            </Button>
          </>
        }
      />
    </form>
  );
}
