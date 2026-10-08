"use client";

import { CircleAlertIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";

import type { AccountProfile, AccountProfilePatch } from "@/entities/account-profile";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";
import { Skeleton } from "@/shared/ui/skeleton";

import {
  clientErrors,
  patchFrom,
  rejectionOf,
  todayIso,
  valuesFrom,
  type AccountValues,
  type FieldMessage,
} from "../model/form";

const EMPTY: AccountValues = {
  full_name: "",
  date_of_birth: "",
  accept_terms: false,
  accept_privacy: false,
  product_news: false,
};

const FIELDS = [
  "full_name",
  "date_of_birth",
  "accept_terms",
  "accept_privacy",
  "product_news",
] as const satisfies readonly (keyof AccountValues)[];

const describedBy = (id: string) => `${id}-note`;

/**
 * WA5 "Before you start" (Account basics & consent, SF-46): full name, date
 * of birth, the Terms and Privacy acceptances and optional product news, on
 * the SF-44 account registration.
 *
 * Continue saves what changed and is valid (a partial save never completes
 * anything), then, when every requirement is met, asks the API to complete
 * registration. Only the API's success moves on: completion drops the cached
 * entry resolution, and the onboarding gate sends the visitor to the
 * resolver's destination with their continuation. A required consent is only
 * ever sent as the visitor's own tick, recorded by the server at the version
 * in force; one already accepted at that version is shown checked and
 * locked (the contract has no withdrawal).
 *
 * Without a `profile` (still loading) the step keeps its heading, aside and
 * Continue (disabled) and outlines the form (WA5 "loading").
 */
export function AccountBasicsStep({
  profile,
  save,
  complete,
}: {
  profile: AccountProfile | undefined;
  save: (patch: AccountProfilePatch) => Promise<AccountProfile>;
  complete: () => Promise<AccountProfile>;
}) {
  const t = useTranslations("accountRegistration");
  const form = useForm<AccountValues>({
    defaultValues: profile === undefined ? EMPTY : valuesFrom(profile),
  });
  const { register, control, setError, clearErrors, setFocus, setValue, reset, formState } = form;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"failure" | "invalid">();
  const busyRef = useRef(false);
  // The first invalid field, focused once the form has rendered (a save resets
  // the form, which re-registers its fields).
  const [focusTarget, setFocusTarget] = useState<{ field: keyof AccountValues }>();
  useEffect(() => {
    if (focusTarget !== undefined) setFocus(focusTarget.field);
  }, [focusTarget, setFocus]);

  // A newer backend state (another tab, another client) updates every field not
  // being edited here; the fields being edited keep the visitor's input, and
  // the messages on screen stay.
  useEffect(() => {
    if (profile !== undefined)
      reset(valuesFrom(profile), { keepDirtyValues: true, keepErrors: true });
  }, [profile, reset]);
  const { dirtyFields } = formState;

  /**
   * After a save the backend's answer is the new baseline: a field it saved is
   * no longer an edit (so it is never sent again over a newer value from
   * elsewhere). A field not saved, or changed while the request ran, stays the
   * visitor's edit.
   */
  function settleSaved(saved: AccountProfile, sent: AccountValues, patch: AccountProfilePatch) {
    const current = form.getValues();
    const edits = FIELDS.filter(
      (field) =>
        form.getFieldState(field).isDirty && (!(field in patch) || current[field] !== sent[field]),
    );
    reset(valuesFrom(saved));
    for (const field of edits) setValue(field, current[field], { shouldDirty: true });
  }

  const termsLocked = profile?.consents.terms.current ?? false;
  const privacyLocked = profile?.consents.privacy.current ?? false;

  function showErrors(errors: Partial<Record<keyof AccountValues, FieldMessage>>) {
    const invalid = FIELDS.filter((field) => errors[field] !== undefined);
    for (const field of invalid) {
      const key = errors[field];
      if (key !== undefined) setError(field, { type: "validate", message: t(`errors.${key}`) });
    }
    const first = invalid[0];
    if (first !== undefined) setFocusTarget({ field: first });
    return invalid.length > 0;
  }

  async function submit() {
    if (busyRef.current || profile === undefined) return;
    busyRef.current = true;
    setBusy(true);
    clearErrors();
    setProblem(undefined);
    const values = form.getValues();
    const errors = clientErrors(values, todayIso());
    let completed = false;
    try {
      // Progress first: every valid change is saved, even when a requirement is
      // still missing. A save never completes anything.
      const patch = patchFrom(values, dirtyFields, errors);
      if (Object.keys(patch).length > 0) settleSaved(await save(patch), values, patch);
      if (showErrors(errors)) {
        setProblem("invalid");
        return;
      }
      // Completion: the server checks every requirement and records it. The gate
      // then leaves for the resolver's destination; the button stays busy.
      await complete();
      completed = true;
    } catch (error) {
      const rejection = rejectionOf(error);
      if (rejection !== undefined) {
        showErrors(rejection);
        setProblem("invalid");
      } else {
        setProblem("failure");
      }
    } finally {
      // After completion the button stays busy until the gate navigates.
      if (!completed) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }

  const error = (field: keyof AccountValues) => formState.errors[field]?.message;
  const outdated = (kind: "terms" | "privacy") =>
    profile !== undefined && profile.consents[kind].accepted && !profile.consents[kind].current;

  return (
    <>
      <div className="flex min-w-0 flex-col gap-5.5">
        <hgroup className="flex flex-col gap-2">
          <p className="type-label text-highlight">{t("eyebrow")}</p>
          <h1 tabIndex={-1} className="type-onboarding-title outline-none">
            {t("title")}
          </h1>
          <p className="type-body-lg text-pretty text-muted-foreground">{t("lead")}</p>
        </hgroup>
        {/* Empty, the live region stays out of the flow (no gap); a notice shows in place. */}
        <div
          role="status"
          aria-live="polite"
          data-step-notice={problem ?? undefined}
          className={problem === undefined ? "sr-only" : undefined}
        >
          {problem === "failure" && (
            <Notice
              tone="amber"
              action={
                <button
                  type="button"
                  onClick={() => void submit()}
                  className="rounded-xs type-caption font-extrabold underline outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t("notices.failure.retry")}
                </button>
              }
            >
              <span className="flex flex-col gap-0.5">
                <b>{t("notices.failure.title")}</b>
                <span>{t("notices.failure.body")}</span>
              </span>
            </Notice>
          )}
          {problem === "invalid" && (
            <Notice tone="coral">
              <span className="flex flex-col gap-0.5">
                <b>{t("notices.invalid.title")}</b>
                <span>{t("notices.invalid.body")}</span>
              </span>
            </Notice>
          )}
        </div>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex min-w-0 flex-col gap-5.5"
        >
          {profile === undefined ? (
            <FormLoading label={t("loading")} />
          ) : (
            <>
              <div className="grid min-w-0 gap-3.5 sm:grid-cols-2">
                <Field
                  id="account-full-name"
                  label={t("fullName.label")}
                  help={t("fullName.help")}
                  error={error("full_name")}
                >
                  <Input
                    id="account-full-name"
                    fieldSize="lg"
                    autoComplete="name"
                    placeholder={t("fullName.placeholder")}
                    aria-invalid={error("full_name") !== undefined || undefined}
                    aria-describedby={describedBy("account-full-name")}
                    aria-required
                    {...register("full_name")}
                  />
                </Field>
                <Field
                  id="account-date-of-birth"
                  label={t("dateOfBirth.label")}
                  help={t("dateOfBirth.help")}
                  error={error("date_of_birth")}
                >
                  <Input
                    id="account-date-of-birth"
                    type="date"
                    fieldSize="lg"
                    autoComplete="bday"
                    max={todayIso()}
                    aria-invalid={error("date_of_birth") !== undefined || undefined}
                    aria-describedby={describedBy("account-date-of-birth")}
                    aria-required
                    {...register("date_of_birth")}
                  />
                </Field>
              </div>
              <div
                role="group"
                aria-labelledby="account-agreements"
                data-agreements
                className="flex min-w-0 flex-col gap-3 rounded-2xl border bg-surface p-4.5"
              >
                <p id="account-agreements" className="type-caption font-bold text-muted-foreground">
                  {t("agreements.label")}
                </p>
                <Agreement
                  id="account-terms"
                  control={control}
                  name="accept_terms"
                  locked={termsLocked}
                  error={error("accept_terms")}
                  note={outdated("terms") ? t("agreements.newVersion") : undefined}
                >
                  {t("agreements.terms")}
                  <span className="font-semibold text-faint-foreground">
                    {" "}
                    {t("agreements.required")}
                  </span>
                  {termsLocked && <span className="sr-only"> ({t("agreements.accepted")})</span>}
                </Agreement>
                <Agreement
                  id="account-privacy"
                  control={control}
                  name="accept_privacy"
                  locked={privacyLocked}
                  error={error("accept_privacy")}
                  note={outdated("privacy") ? t("agreements.newVersion") : undefined}
                >
                  {t("agreements.privacy")}
                  <span className="font-semibold text-faint-foreground">
                    {" "}
                    {t("agreements.required")}
                  </span>
                  {privacyLocked && <span className="sr-only"> ({t("agreements.accepted")})</span>}
                </Agreement>
                <span aria-hidden className="my-0.5 h-px bg-border" />
                <Agreement id="account-news" control={control} name="product_news" locked={false}>
                  {t("agreements.news")}
                  <span className="font-semibold text-faint-foreground">
                    {" "}
                    {t("agreements.newsNote")}
                  </span>
                </Agreement>
                <p className="type-caption text-faint-foreground">{t("agreements.newsFootnote")}</p>
              </div>
            </>
          )}
          <div className="mt-1 flex items-center gap-2.5 border-t border-border-subtle pt-2.5">
            <span className="flex-1" />
            <Button
              type="submit"
              size="lg"
              className="min-w-30"
              loading={busy}
              disabled={profile === undefined}
            >
              {busy ? t("saving") : t("continue")}
            </Button>
          </div>
        </form>
      </div>
      <aside className="flex min-w-0 flex-col gap-3.5">
        <section
          aria-labelledby="account-why"
          className="flex min-w-0 flex-col gap-3.5 rounded-3xl border bg-surface p-4.5"
        >
          <h2 id="account-why" className="type-label text-faint-foreground">
            {t("why.title")}
          </h2>
          {(["fullName", "dateOfBirth", "consents"] as const).map((key) => (
            <div key={key} className="flex flex-col gap-0.5">
              <p className="type-body-sm font-bold">{t(`why.${key}.title`)}</p>
              <p className="type-caption text-muted-foreground">{t(`why.${key}.body`)}</p>
            </div>
          ))}
        </section>
        <section
          aria-labelledby="account-next"
          className="flex min-w-0 flex-col gap-2 rounded-3xl border bg-surface p-4.5"
        >
          <h2 id="account-next" className="type-label text-faint-foreground">
            {t("next.title")}
          </h2>
          <p className="type-body-sm">{t("next.body")}</p>
        </section>
        <Notice tone="olive" icon={CircleAlertIcon}>
          {t("next.note")}
        </Notice>
      </aside>
    </>
  );
}

/** WA5 "loading": the fields and agreements outlined while the registration loads. */
function FormLoading({ label }: { label: string }) {
  return (
    <div aria-busy="true" data-account-loading className="flex min-w-0 flex-col gap-4.5">
      <p role="status" className="type-caption text-faint-foreground">
        {label}
      </p>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <Skeleton className="h-11 w-full rounded-md" />
        <Skeleton className="h-11 w-full rounded-md" />
      </div>
      <Skeleton className="h-5.5 w-[70%] rounded-md" />
      <Skeleton className="h-5.5 w-[64%] rounded-md" />
      <Skeleton className="h-5.5 w-[52%] rounded-md" />
    </div>
  );
}

function Field({
  id,
  label,
  help,
  error,
  children,
}: {
  id: string;
  label: string;
  help: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="type-caption font-bold text-muted-foreground">
        {label}
      </label>
      {children}
      <p
        id={describedBy(id)}
        className={cn(
          "type-caption",
          error === undefined ? "text-faint-foreground" : "text-destructive-subtle-foreground",
        )}
      >
        {error ?? help}
      </p>
    </div>
  );
}

/** One agreement row: the 22 px box and its label; the error or a note below, indented. */
function Agreement({
  id,
  control,
  name,
  locked,
  error,
  note,
  children,
}: {
  id: string;
  control: ReturnType<typeof useForm<AccountValues>>["control"];
  name: "accept_terms" | "accept_privacy" | "product_news";
  locked: boolean;
  error?: string;
  note?: string;
  children: ReactNode;
}) {
  const below = error ?? note;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <Checkbox
              id={id}
              ref={field.ref}
              checked={field.value}
              disabled={locked}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              aria-invalid={error !== undefined || undefined}
              aria-describedby={below === undefined ? undefined : describedBy(id)}
              className="size-5.5 rounded-xs border-2 border-border-strong disabled:cursor-default disabled:opacity-100 aria-invalid:border-destructive data-checked:border-highlight data-checked:bg-highlight data-checked:text-highlight-foreground"
            />
          )}
        />
        <label htmlFor={id} className="type-body font-semibold">
          {children}
        </label>
      </div>
      {below !== undefined && (
        <p
          id={describedBy(id)}
          className={cn(
            // Under the label: the 22 px box and its 12 px gap (34 drawn; 32 is the step).
            "pl-8 type-caption",
            error === undefined ? "text-faint-foreground" : "text-destructive-subtle-foreground",
          )}
        >
          {below}
        </p>
      )}
    </div>
  );
}
