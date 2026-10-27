"use client";

import { CheckIcon, InfoIcon, UserRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";

import type { GymCreateInput, GymSetup, GymSetupPatch } from "@/entities/gym-setup";
import { Link } from "@/shared/i18n/navigation";
import { changedOnly } from "@/shared/lib/forms";
import { Button } from "@/shared/ui/button";
import { ChoiceField, describedBy, FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";

import type { FieldMessage } from "../model/errors";
import {
  GYM_TYPES,
  gymErrors,
  gymFrom,
  gymPatch,
  LIMITS,
  type GymValues,
} from "../model/form-values";
import type { FormStep } from "../model/steps";
import { pillClass } from "./pill";
import { GymCardPreview } from "./previews";
import { SaveStatus, StepBody, StepFooter, StepHeader } from "./setup-frame";
import { noticeActionClass, StepNotice } from "./step-notice";
import { useStepFailure } from "./use-step-failure";

const FIELDS = [
  "name",
  "gym_type",
  "phone",
  "website",
] as const satisfies readonly (keyof GymValues)[];

export type StepSaver = () => Promise<boolean>;

/** The create key of one creation attempt: repeated on every retry, renewed only when spent. */
export type CreateKey = { current: () => string; renew: () => void };

/**
 * OG1 "Gym name & type": the gym name, one of the six gym types, and the
 * optional phone and website. Without a draft, Continue creates it
 * (`createGym` with the attempt's idempotency key, then the optional fields
 * as a first save); with one, it saves what changed against the setup's
 * revision. It moves to OG2 only once the API accepted everything. A
 * rejected value stays in its field with the API's reason; an unconfirmed
 * request keeps everything typed and offers a safe Retry.
 */
export function TypeStep({
  setup,
  create,
  save,
  reload,
  createKey,
  existingGyms = 0,
  gymHref,
  accountHref,
  onDone,
  onSaveExit,
  registerSaver,
  onRestart,
}: {
  /** The draft's setup, or `null` before it exists. */
  setup: GymSetup | null;
  create: (input: GymCreateInput) => Promise<GymSetup>;
  save: (setup: GymSetup, patch: GymSetupPatch) => Promise<GymSetup>;
  reload?: () => Promise<GymSetup>;
  createKey: CreateKey;
  /** Completed gyms the viewer already staffs: a new gym is then another one. */
  existingGyms?: number;
  /** Where the viewer's existing gym opens (the entry, asked for the Gym journey). */
  gymHref?: string;
  accountHref: string;
  onDone: (next: FormStep) => void;
  onSaveExit: () => void;
  registerSaver: (saver: StepSaver) => void;
  /** The gym is gone (discarded elsewhere, or no longer the viewer's): look again. */
  onRestart?: () => void;
}) {
  const t = useTranslations("gymOnboarding");
  const form = useForm<GymValues>({ defaultValues: gymFrom(setup) });
  const { register, control, setError, clearErrors, setFocus, getValues, reset, formState } = form;
  const values = useWatch({ control }) as GymValues;
  const [busy, setBusy] = useState(false);

  // A newer backend setup (another tab or device) updates every field not
  // being edited here; the fields being edited keep the visitor's input.
  useEffect(() => {
    if (setup !== null) reset(gymFrom(setup), { keepDirtyValues: true });
  }, [setup, reset]);
  const { dirtyFields, isDirty } = formState;

  const showErrors = useCallback(
    (errors: Partial<Record<string, FieldMessage>>) => {
      const invalid = FIELDS.filter((field) => errors[field] !== undefined);
      for (const field of invalid) {
        const key = errors[field];
        if (key !== undefined) setError(field, { type: "validate", message: t(`errors.${key}`) });
      }
      const first = invalid[0];
      if (first === "gym_type") {
        document.querySelector<HTMLElement>('[data-field="gym_type"] input')?.focus();
      } else if (first !== undefined) {
        setFocus(first);
      }
      return invalid.length > 0;
    },
    [setError, setFocus, t],
  );
  const { problem, setProblem, fail } = useStepFailure({ reload, accountHref, showErrors });

  /** Creates or saves the gym; `true` once the API accepted it (or nothing needed saving). */
  async function persist(leaving: boolean): Promise<boolean> {
    if (busy) return false;
    clearErrors();
    setProblem(undefined);
    const current = getValues();

    if (setup === null) {
      // Leaving an untouched OG1 creates nothing.
      if (leaving && !isDirty) return true;
      if (showErrors(gymErrors(current))) {
        setProblem({ kind: "invalid" });
        return false;
      }
      setBusy(true);
      try {
        const patch = gymPatch(current);
        let created: GymSetup;
        try {
          created = await create({
            client_request_id: createKey.current(),
            name: patch.name as string,
            gym_type: current.gym_type as NonNullable<GymValues["gym_type"]>,
          });
        } catch (error) {
          await fail(error, "create");
          return false;
        }
        // The API resumed the open draft this account already had: its saved
        // values load, the visitor's input stays in the fields, and nothing
        // more is written without another Continue.
        if (created.name !== patch.name || created.gym_type !== current.gym_type) {
          reset(gymFrom(created), { keepDirtyValues: true });
          setProblem({ kind: "resumed" });
          return false;
        }
        const extra: GymSetupPatch = {
          ...(patch.phone !== null ? { phone: patch.phone } : {}),
          ...(patch.website !== null ? { website: patch.website } : {}),
        };
        if (Object.keys(extra).length === 0) {
          reset(gymFrom(created));
          return true;
        }
        // The gym exists now; a failed first save keeps phone and website
        // edited, and Retry saves them against the new draft.
        reset(gymFrom(created), { keepDirtyValues: true });
        try {
          reset(gymFrom(await save(created, extra)));
          return true;
        } catch (error) {
          await fail(error, "save");
          return false;
        }
      } finally {
        setBusy(false);
      }
    }

    const errors = gymErrors(current);
    if (showErrors(errors)) {
      setProblem({ kind: "invalid" });
      return false;
    }
    // Only what changed here: another device's newer values are never overwritten.
    const changed = changedOnly(gymPatch(current), dirtyFields);
    if (Object.keys(changed).length === 0) return true;
    setBusy(true);
    try {
      reset(gymFrom(await save(setup, changed)));
      return true;
    } catch (error) {
      await fail(error, "save");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // A spent create key (its gym discarded or no longer the visitor's) is
  // renewed once the notice says so; any other failure keeps it for Retry.
  useEffect(() => {
    if (problem?.kind === "discarded" || problem?.kind === "reused") createKey.renew();
  }, [problem, createKey]);

  const advance = async () => {
    if (await persist(false)) onDone("location");
  };

  const latestPersist = useRef(persist);
  useEffect(() => {
    latestPersist.current = persist;
  });
  useEffect(() => registerSaver(() => latestPersist.current(true)), [registerSaver]);

  const error = (field: keyof GymValues) => formState.errors[field]?.message;
  const invalid = (field: keyof GymValues) => error(field) !== undefined || undefined;

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
        eyebrow={t("type.eyebrow")}
        title={t("type.title")}
        lead={t("type.lead")}
        status={<SaveStatus state={setup === null ? "none" : isDirty ? "unsaved" : "saved"} />}
      />
      <StepBody
        aside={
          <GymCardPreview
            name={values.name ?? ""}
            gymType={values.gym_type ?? null}
            city={setup?.primary_location?.city ?? null}
            accent={setup?.accent_color ?? null}
          />
        }
      >
        <StepNotice
          problem={problem}
          onRestart={onRestart}
          onRetry={() => void advance()}
          onReapply={() => void advance()}
        />
        {setup === null && existingGyms > 0 && (
          <Notice
            tone="muted"
            icon={InfoIcon}
            data-another-gym
            action={
              gymHref && (
                <Link href={gymHref} className={noticeActionClass}>
                  {t("type.another.action")}
                </Link>
              )
            }
          >
            <span className="flex flex-col gap-0.5">
              <b className="text-foreground">{t("type.another.title")}</b>
              <span>{t("type.another.body")}</span>
            </span>
          </Notice>
        )}
        <FormField
          id="gym-name"
          label={t("type.name.label")}
          help={t("type.name.help")}
          error={error("name")}
        >
          <Counted
            count={t("type.count", {
              count: Array.from((values.name ?? "").trim()).length,
              max: LIMITS.name,
            })}
          >
            <Input
              id="gym-name"
              fieldSize="lg"
              autoComplete="organization"
              placeholder={t("type.name.placeholder")}
              className="pr-16"
              aria-invalid={invalid("name")}
              aria-describedby={describedBy("gym-name")}
              {...register("name")}
            />
          </Counted>
        </FormField>
        <ChoiceField id="gym-type" legend={t("type.gymType.label")} error={error("gym_type")}>
          <div data-field="gym_type" className="flex flex-wrap gap-2">
            {GYM_TYPES.map((type) => {
              const checked = values.gym_type === type;
              return (
                <label key={type} className={pillClass(checked)}>
                  <input type="radio" value={type} className="sr-only" {...register("gym_type")} />
                  {checked && <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />}
                  {t(`gymTypes.${type}`)}
                </label>
              );
            })}
          </div>
        </ChoiceField>
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <FormField
            id="gym-phone"
            label={t("type.phone.label")}
            help={t("type.phone.help")}
            error={error("phone")}
          >
            <Input
              id="gym-phone"
              type="tel"
              fieldSize="lg"
              autoComplete="tel"
              inputMode="tel"
              placeholder={t("type.phone.placeholder")}
              aria-invalid={invalid("phone")}
              aria-describedby={describedBy("gym-phone")}
              {...register("phone")}
            />
          </FormField>
          <FormField
            id="gym-website"
            label={t("type.website.label")}
            help={t("type.website.help")}
            error={error("website")}
          >
            <Input
              id="gym-website"
              type="url"
              fieldSize="lg"
              autoComplete="url"
              inputMode="url"
              placeholder={t("type.website.placeholder")}
              aria-invalid={invalid("website")}
              aria-describedby={describedBy("gym-website")}
              {...register("website")}
            />
          </FormField>
        </div>
        <Notice tone="muted" icon={UserRoundIcon}>
          {t("type.account")}
        </Notice>
      </StepBody>
      <StepFooter
        note={t("type.note")}
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
              {busy ? (setup === null ? t("type.creating") : t("saving")) : t("continue")}
            </Button>
          </>
        }
      />
    </form>
  );
}

/** A text field with its character count inside, at the right. */
export function Counted({ count, children }: { count: string; children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center type-micro font-mono text-faint-foreground"
      >
        {count}
      </span>
    </div>
  );
}
