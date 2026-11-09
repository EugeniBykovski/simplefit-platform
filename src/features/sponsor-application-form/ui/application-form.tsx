"use client";

import { CheckIcon, InfoIcon, MailIcon, TriangleAlertIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FormProvider, useForm } from "react-hook-form";

import {
  AnswerSummary,
  useSponsorDeclaration,
  type SponsorAnswersPatch,
  type SponsorApplication,
  type SponsorApplicationPolicy,
  type SponsorSubmitInput,
} from "@/entities/sponsor-application";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { LegalText } from "@/shared/ui/legal-text";
import { Notice } from "@/shared/ui/notice";

import { outcomeOf, type FieldMessage, type Outcome } from "../model/outcome";
import {
  changeableFields,
  fieldsOf,
  isEditable,
  stepOfField,
  STEPS,
  type AnswerField,
  type StepKey,
} from "../model/steps";
import {
  formatIssues,
  hasAnswer,
  patchFor,
  valuesFrom,
  type ApplicationValues,
  type FormatIssue,
} from "../model/values";
import {
  AnswersAside,
  ApplicationGrid,
  StepProgress,
  StepRail,
  stepDone,
} from "./application-frame";
import { EvidencePanel, type EvidenceActions } from "./evidence-panel";
import {
  BudgetFields,
  CompanyFields,
  ContactFields,
  fieldId,
  GoalsFields,
  InterestsFields,
  MarketsFields,
  type FieldsProps,
} from "./step-fields";

/*
 * SPA1 · the sponsor application form (Claude Design SponsorApply, one
 * source for SP1–SP7 and review; option A: signed in before the first
 * draft, as SF-113 built it). One form holds every answer; each step saves
 * only the answers it changed, at the revision it was based on. The
 * backend's application is the only record: what is missing, what may be
 * edited and whether it can be submitted come from it, and only its answer
 * moves the flow on (a submission is shown only once the backend confirmed
 * it, directly or through a re-read).
 */

export type ApplicationActions = EvidenceActions & {
  save: (
    base: SponsorApplication | null,
    patch: SponsorAnswersPatch,
    clientRequestId: () => string,
  ) => Promise<SponsorApplication>;
  submit: (base: SponsorApplication, input: SponsorSubmitInput) => Promise<SponsorApplication>;
};

type Problem =
  | { kind: "invalid"; fields: AnswerField[] }
  | { kind: "missing"; fields: AnswerField[] }
  | { kind: "saveFailed"; retry: () => void }
  | { kind: "submitFailed"; retry: () => void }
  | { kind: "stale" }
  | { kind: "duplicate" }
  | { kind: "moved" }
  | { kind: "declaration" }
  | { kind: "account" }
  | { kind: "rateLimited" }
  | { kind: "conflict" };

type SaveState = "idle" | "saving" | "saved" | "failed";

export function SponsorApplicationForm({
  application,
  policy,
  step,
  actions,
  onStep,
  onSubmitted,
  onExit,
  onSessionEnded,
  accountHref,
  statusHref,
  renderLink,
}: {
  application: SponsorApplication | null;
  policy: SponsorApplicationPolicy;
  step: StepKey;
  actions: ApplicationActions;
  onStep: (step: StepKey) => void;
  /** The backend confirmed a submission. */
  onSubmitted: (application: SponsorApplication) => void;
  onExit: () => void;
  onSessionEnded: () => void;
  accountHref: string;
  statusHref: string;
  /** A localized link (the app's `Link`), so the feature does not pick a router. */
  renderLink: (href: string, children: ReactNode, className?: string) => ReactNode;
}) {
  const t = useTranslations("sponsorApplication");
  const locale = useLocale();
  const form = useForm<ApplicationValues>({ defaultValues: valuesFrom(application?.answers) });
  const { getValues, setError, clearErrors, reset, formState } = form;
  const [problem, setProblem] = useState<Problem>();
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [declarationError, setDeclarationError] = useState(false);
  const createKey = useRef<string | undefined>(undefined);
  const submitKey = useRef<string | undefined>(undefined);
  const summaryRef = useRef<HTMLDivElement>(null);
  const declarationId = useId();

  // The backend's answers replace the form's defaults whenever they change;
  // answers the visitor edited and hasn't saved are kept (a stale save
  // re-reads the application without losing them).
  const revision = application?.revision ?? 0;
  useEffect(() => {
    reset(valuesFrom(application?.answers), { keepDirtyValues: true, keepErrors: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the revision names the answers
  }, [revision, reset]);

  // Leaving with unsaved answers asks first (the browser's own prompt).
  const dirty = formState.isDirty;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const changeable = changeableFields(application);
  const editable = isEditable(application);
  const locked = useCallback(
    (field: AnswerField) => !editable || (changeable !== null && !changeable.has(field)),
    [editable, changeable],
  );

  const errorText = (field: AnswerField): string | undefined => {
    const message = formState.errors[field]?.message;
    if (message === undefined || message === "") return undefined;
    if (message === "required") {
      return t.has(`errors.required.${field}`)
        ? t(`errors.required.${field}` as "errors.required.goals")
        : t("errors.requiredGeneric");
    }
    return t(`errors.${message as Exclude<FieldMessage, "required"> | FormatIssue}`);
  };

  const showFields = (
    fields: Partial<Record<AnswerField, string>>,
    kind: "invalid" | "missing",
  ) => {
    const names = Object.keys(fields) as AnswerField[];
    for (const field of names) setError(field, { type: "server", message: fields[field] });
    setProblem({ kind, fields: names });
  };

  // A new error summary takes focus, so it is read out and its links are next.
  useEffect(() => {
    if (problem?.kind === "invalid" || problem?.kind === "missing") summaryRef.current?.focus();
  }, [problem]);

  /** A failed write, as the notice it calls for. `retry` repeats it when that is safe. */
  const failed = async (error: unknown, action: "save" | "submit", retry: () => void) => {
    const outcome: Outcome = outcomeOf(error);
    switch (outcome.kind) {
      case "invalid": {
        const answers = Object.fromEntries(
          Object.entries(outcome.fields).filter(
            ([field]) => stepOfField(field, policy) !== "review",
          ),
        ) as Partial<Record<AnswerField, FieldMessage>>;
        if (Object.keys(answers).length > 0) {
          const missingOnly = Object.values(answers).every((code) => code === "required");
          showFields(answers, action === "submit" && missingOnly ? "missing" : "invalid");
        } else if (
          "declaration_language" in outcome.fields ||
          "declaration_version" in outcome.fields
        ) {
          setProblem({ kind: "declaration" });
        } else {
          setProblem({ kind: "conflict" });
        }
        return;
      }
      case "stale":
        await actions.reload().catch(() => undefined);
        setProblem({ kind: "stale" });
        return;
      case "moved":
        await actions.reload().catch(() => undefined);
        setProblem({ kind: "moved" });
        return;
      case "declaration":
        setAccepted(false);
        await actions.reload().catch(() => undefined);
        setProblem({ kind: "declaration" });
        return;
      case "reused":
        // That key answered another request: a new attempt gets a new key.
        if (action === "submit") submitKey.current = undefined;
        else createKey.current = undefined;
        setProblem(
          action === "submit" ? { kind: "submitFailed", retry } : { kind: "saveFailed", retry },
        );
        return;
      case "account":
        setProblem({ kind: "account" });
        return;
      case "session":
        onSessionEnded();
        return;
      case "rateLimited":
        setProblem({ kind: "rateLimited" });
        return;
      case "gone":
        await actions.reload().catch(() => undefined);
        setProblem({ kind: "moved" });
        return;
      case "unconfirmed":
      case "unavailable":
        setProblem(
          action === "submit" ? { kind: "submitFailed", retry } : { kind: "saveFailed", retry },
        );
        return;
      default:
        setProblem({ kind: "conflict" });
    }
  };

  /**
   * Saves the changed answers among `fields`. Resolves with the application
   * the backend now has (`null`: none yet and nothing to save), or `false`
   * when nothing could be saved (the notice says why).
   */
  const save = async (
    fields: readonly AnswerField[],
    again: () => void,
  ): Promise<SponsorApplication | null | false> => {
    const values = getValues();
    clearErrors();
    const issues = formatIssues(values, fields);
    if (Object.keys(issues).length > 0) {
      showFields(issues, "invalid");
      return false;
    }
    const changed = fields.filter(
      (field) => formState.dirtyFields[field] !== undefined && !locked(field),
    );
    const patch = patchFor(values, changed);
    if (changed.length === 0 || (application === null && !hasAnswer(patch))) return application;
    setSaveState("saving");
    setProblem(undefined);
    try {
      const saved = await actions.save(
        application,
        patch,
        () => (createKey.current ??= crypto.randomUUID()),
      );
      setSaveState("saved");
      return saved;
    } catch (error) {
      setSaveState("failed");
      await failed(error, "save", again);
      return false;
    }
  };

  const fields = fieldsOf(step, policy);
  const allFields = STEPS.flatMap((key) => fieldsOf(key, policy));
  const index = STEPS.indexOf(step);

  /** Save and continue: the step's answers, then the backend's view of what it still needs. */
  const next = async () => {
    const saved = await save(fields, () => void next());
    if (saved === false) return;
    const missing = (
      saved === null
        ? fields.filter((field) => policy.required.includes(field))
        : saved.missing_fields.filter((field) => fields.includes(field))
    ).filter((field) => !locked(field));
    if (missing.length > 0) {
      showFields(Object.fromEntries(missing.map((field) => [field, "required"])), "missing");
      return;
    }
    setProblem(undefined);
    onStep(STEPS[Math.min(index + 1, STEPS.length - 1)] ?? "review");
  };

  /** Back, the rail and Save and exit save what is valid and leave without requiring anything. */
  const leave = async (to: StepKey | "exit") => {
    if ((await save(fields, () => void leave(to))) === false) return;
    setProblem(undefined);
    if (to === "exit") onExit();
    else onStep(to);
  };

  // The declaration in the reader's language when counsel published one in it.
  const declaration = application?.declaration ?? policy.declaration;
  const language = declaration.languages.includes(locale)
    ? locale
    : declaration.languages.includes("en")
      ? "en"
      : declaration.languages[0];
  const declarationText = useSponsorDeclaration(
    declaration.available ? declaration : undefined,
    language,
  );

  /** Submit: unsaved answers first, then one submission per attempt key. */
  const submit = async () => {
    if (submitting) return;
    if (!accepted) {
      setDeclarationError(true);
      document.getElementById(declarationId)?.focus();
      return;
    }
    setSubmitting(true);
    setProblem(undefined);
    try {
      const saved = await save(allFields, () => void submit());
      if (saved === false || saved === null) return;
      if (declaration.version === null || language === undefined) {
        setProblem({ kind: "declaration" });
        return;
      }
      const before = saved.submissions.length;
      const key = (submitKey.current ??= crypto.randomUUID());
      try {
        const submitted = await actions.submit(saved, {
          client_request_id: key,
          declaration_accepted: true,
          declaration_version: declaration.version,
          declaration_language: language,
        });
        submitKey.current = undefined;
        onSubmitted(submitted);
      } catch (error) {
        const outcome = outcomeOf(error);
        if (outcome.kind === "unconfirmed" || outcome.kind === "moved") {
          // The answer was lost or the status moved: ask the backend what happened.
          const current = await actions.reload().catch(() => undefined);
          if (current != null && current.submissions.length > before && !isEditableDraft(current)) {
            submitKey.current = undefined;
            if (outcome.kind === "unconfirmed") onSubmitted(current);
            else setProblem({ kind: "duplicate" });
            return;
          }
        }
        await failed(error, "submit", () => void submit());
      }
    } finally {
      setSubmitting(false);
    }
  };

  const props: FieldsProps = { error: errorText, locked, policy };
  const logo =
    policy.uploads.available && policy.uploads.kinds.includes("logo") ? (
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="type-caption font-bold text-muted-foreground">
          {t("fields.logo")} · {t("fields.optional")}
        </span>
        <EvidencePanel
          application={application}
          uploads={policy.uploads}
          actions={actions}
          kinds={["logo"]}
          editable={editable && (changeable === null || changeable.size === 0)}
          onSessionEnded={onSessionEnded}
        />
      </div>
    ) : undefined;

  const body: Record<StepKey, ReactNode> = {
    company: <CompanyFields props={props} logo={logo} />,
    contact: <ContactFields props={props} />,
    interests: <InterestsFields props={props} />,
    markets: <MarketsFields props={props} />,
    budget: <BudgetFields props={props} />,
    goals: <GoalsFields props={props} />,
    uploads: (
      <EvidencePanel
        application={application}
        uploads={policy.uploads}
        actions={actions}
        kinds={policy.uploads.kinds.filter((kind) => kind !== "logo")}
        editable={editable && changeable === null}
        onSessionEnded={onSessionEnded}
      />
    ),
    review: (
      <Review
        application={application}
        policy={policy}
        onGo={(target) => void leave(target)}
        declaration={{
          id: declarationId,
          available: declaration.available,
          text: declarationText.data,
          loading: declarationText.isPending && declaration.available,
          failed: declarationText.isError,
          retry: () => void declarationText.refetch(),
          accepted,
          invalid: declarationError,
          onChange: (value) => {
            setAccepted(value);
            if (value) setDeclarationError(false);
          },
        }}
      />
    ),
  };

  const resubmit = application?.status === "changes_requested";
  const saveLine = saveLineOf(saveState, dirty, application !== null);

  return (
    <FormProvider {...form}>
      <ApplicationGrid
        rail={
          <StepRail
            current={step}
            done={(key) => stepDone(key, application, policy)}
            note={t("rail.note")}
            disabled={saveState === "saving" || submitting}
            onSelect={(target) => {
              if (target !== step) void leave(target);
            }}
          />
        }
        aside={<AnswersAside application={application} policy={policy} />}
      >
        <StepProgress current={step} />
        <form
          noValidate
          aria-labelledby="sa-step-title"
          onSubmit={(event) => {
            event.preventDefault();
            void (step === "review" ? submit() : next());
          }}
          className="flex min-w-0 flex-col gap-5.5"
        >
          <StepHeader step={step} />
          {resubmit && application?.change_request ? (
            <Notice tone="amber" icon={MailIcon} role="status">
              <b>{t("changes.title")}</b> {application.change_request.message} {t("changes.rest")}
            </Notice>
          ) : null}
          <ProblemNotice
            problem={problem}
            summaryRef={summaryRef}
            policy={policy}
            errorText={errorText}
            accountHref={accountHref}
            statusHref={statusHref}
            renderLink={renderLink}
            onReload={() => {
              setProblem(undefined);
              void actions.reload();
            }}
            onGo={(target) => void leave(target)}
          />
          {body[step]}
          <div className="flex flex-col gap-2.5 border-t border-border-subtle pt-3 sm:flex-row sm:flex-wrap sm:items-center">
            <Button
              type="button"
              variant="quiet"
              size="lg"
              disabled={index === 0 || saveState === "saving" || submitting}
              onClick={() => void leave(STEPS[Math.max(index - 1, 0)] ?? "company")}
            >
              {t("actions.back")}
            </Button>
            <span className="hidden flex-1 sm:block" />
            <span
              role="status"
              className={cn(
                "inline-flex items-center justify-center gap-1.5 type-caption",
                saveState === "saved"
                  ? "text-highlight"
                  : saveState === "failed"
                    ? "text-destructive-subtle-foreground"
                    : "text-muted-foreground",
              )}
            >
              {saveState === "saved" && !dirty ? (
                <CheckIcon aria-hidden className="size-3.5" />
              ) : null}
              {saveLine === undefined ? null : t(`save.${saveLine}`)}
            </span>
            {step === "review" ? (
              <Button
                type="submit"
                size="lg"
                loading={submitting}
                disabled={!editable || !declaration.available}
              >
                {submitting
                  ? t("actions.submitting")
                  : resubmit
                    ? t("actions.resubmit")
                    : t("actions.submit")}
              </Button>
            ) : (
              <Button type="submit" size="lg" loading={saveState === "saving"} disabled={!editable}>
                {t("actions.next")}
              </Button>
            )}
          </div>
        </form>
      </ApplicationGrid>
    </FormProvider>
  );
}

function StepHeader({ step }: { step: StepKey }) {
  const t = useTranslations("sponsorApplication");
  const n = STEPS.indexOf(step) + 1;
  return (
    <div className="flex flex-col gap-2">
      <p className="hidden type-label text-warning lg:block">
        {t("progress.step", { step: n, total: STEPS.length })}
      </p>
      <h1
        id="sa-step-title"
        tabIndex={-1}
        className="type-site-section outline-none md:type-onboarding-title"
      >
        {t(`steps.${step}.title`)}
      </h1>
      <p className="type-body-lg text-muted-foreground">{t(`steps.${step}.lead`)}</p>
    </div>
  );
}

const isEditableDraft = (application: SponsorApplication) =>
  application.status === "draft" || application.status === "changes_requested";

function saveLineOf(
  state: SaveState,
  dirty: boolean,
  exists: boolean,
): "saving" | "saved" | "failed" | "unsaved" | undefined {
  if (state === "saving") return "saving";
  if (state === "failed") return "failed";
  if (dirty) return "unsaved";
  return exists ? "saved" : undefined;
}

function ProblemNotice({
  problem,
  summaryRef,
  policy,
  errorText,
  accountHref,
  statusHref,
  renderLink,
  onReload,
  onGo,
}: {
  problem: Problem | undefined;
  summaryRef: React.RefObject<HTMLDivElement | null>;
  policy: SponsorApplicationPolicy;
  errorText: (field: AnswerField) => string | undefined;
  accountHref: string;
  statusHref: string;
  renderLink: (href: string, children: ReactNode, className?: string) => ReactNode;
  onReload: () => void;
  onGo: (step: StepKey) => void;
}) {
  const t = useTranslations("sponsorApplication.problems");
  if (problem === undefined) return null;
  const linkClass = "font-extrabold underline";

  if (problem.kind === "invalid" || problem.kind === "missing") {
    return (
      <div
        ref={summaryRef}
        role="alert"
        tabIndex={-1}
        className="flex flex-col gap-1.5 rounded-lg border border-destructive-border bg-destructive-subtle px-3.5 py-3 type-body-sm text-destructive-subtle-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <b>{t("check", { count: problem.fields.length })}</b>
        <ul className="flex flex-col gap-1">
          {problem.fields.map((field) => {
            const step = stepOfField(field, policy);
            return (
              <li key={field}>
                <a
                  href={`#${fieldId(field)}`}
                  className="underline"
                  onClick={(event) => {
                    const target = document.getElementById(fieldId(field));
                    if (target === null) {
                      event.preventDefault();
                      onGo(step);
                      return;
                    }
                    event.preventDefault();
                    target.focus();
                  }}
                >
                  {errorText(field) ?? field}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const retry =
    problem.kind === "saveFailed" || problem.kind === "submitFailed" ? problem.retry : undefined;
  const tone =
    problem.kind === "duplicate"
      ? "muted"
      : problem.kind === "stale" || problem.kind === "moved"
        ? "amber"
        : "coral";
  const action =
    retry !== undefined ? (
      <Button type="button" variant="quiet" size="sm" onClick={retry}>
        {t("retry")}
      </Button>
    ) : problem.kind === "stale" ? (
      <Button type="button" variant="quiet" size="sm" onClick={onReload}>
        {t("reload")}
      </Button>
    ) : problem.kind === "duplicate" || problem.kind === "moved" ? (
      renderLink(statusHref, t("viewApplication"), linkClass)
    ) : problem.kind === "account" ? (
      renderLink(accountHref, t("finishAccount"), linkClass)
    ) : undefined;

  return (
    <Notice
      tone={tone}
      icon={problem.kind === "duplicate" ? InfoIcon : TriangleAlertIcon}
      role={problem.kind === "duplicate" ? "status" : "alert"}
      action={action}
    >
      <b>{t(`${problem.kind}.title`)}</b> {t(`${problem.kind}.body`)}
    </Notice>
  );
}

function Review({
  application,
  policy,
  onGo,
  declaration,
}: {
  application: SponsorApplication | null;
  policy: SponsorApplicationPolicy;
  onGo: (step: StepKey) => void;
  declaration: {
    id: string;
    available: boolean;
    text: { checkbox: string | null; full: string | null } | undefined;
    loading: boolean;
    failed: boolean;
    retry: () => void;
    accepted: boolean;
    invalid: boolean;
    onChange: (value: boolean) => void;
  };
}) {
  const t = useTranslations("sponsorApplication.review");
  const kinds = useTranslations("sponsorApplication.uploads.kinds");
  const format = useFormatter();
  const missing = application?.missing_fields ?? [];
  const firstMissing = missing[0];
  const uploaded = application?.evidence.filter((item) => item.status === "uploaded") ?? [];

  if (application === null) {
    return (
      <Notice tone="amber" icon={TriangleAlertIcon} role="alert">
        {t("nothingSaved")}{" "}
        <button type="button" className="font-extrabold underline" onClick={() => onGo("company")}>
          {t("goTo", { step: t("stepNames.company") })}
        </button>
      </Notice>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-3xl border border-border bg-surface px-4.5 py-2">
        <AnswerSummary answers={application.answers} policy={policy} />
        <dl>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5 type-body-sm">
            <dt className="text-muted-foreground">{t("documents")}</dt>
            <dd className="min-w-0 font-bold break-words">
              {uploaded.length === 0
                ? t("noDocuments")
                : format.list(
                    uploaded.map(
                      (item) =>
                        `${item.file_name} (${kinds.has(item.kind) ? kinds(item.kind as "other") : item.kind})`,
                    ),
                  )}
            </dd>
          </div>
        </dl>
      </div>

      {firstMissing !== undefined ? (
        <Notice tone="coral" icon={TriangleAlertIcon} role="alert">
          {t("missing")}{" "}
          <button
            type="button"
            className="font-extrabold underline"
            onClick={() => onGo(stepOfField(firstMissing, policy))}
          >
            {t("goTo", {
              step: t(`stepNames.${stepOfField(firstMissing, policy)}` as "stepNames.company"),
            })}
          </button>
        </Notice>
      ) : null}

      {declaration.available ? (
        <div className="flex flex-col gap-2">
          {declaration.loading ? (
            <p className="type-caption text-muted-foreground">{t("declarationLoading")}</p>
          ) : declaration.failed || declaration.text?.checkbox == null ? (
            <Notice
              tone="coral"
              icon={TriangleAlertIcon}
              role="alert"
              action={
                <Button type="button" variant="quiet" size="sm" onClick={declaration.retry}>
                  {t("retry")}
                </Button>
              }
            >
              {t("declarationFailed")}
            </Notice>
          ) : (
            <>
              <label className="flex cursor-pointer items-start gap-3 py-1 type-body-sm">
                <input
                  id={declaration.id}
                  type="checkbox"
                  checked={declaration.accepted}
                  aria-invalid={declaration.invalid}
                  aria-describedby={declaration.invalid ? `${declaration.id}-error` : undefined}
                  onChange={(event) => declaration.onChange(event.target.checked)}
                  className="mt-0.5 size-5.5 flex-none accent-primary"
                />
                <span>{declaration.text.checkbox}</span>
              </label>
              {declaration.invalid ? (
                <p
                  id={`${declaration.id}-error`}
                  className="type-caption text-destructive-subtle-foreground"
                >
                  {t("declarationRequired")}
                </p>
              ) : null}
              {declaration.text.full !== null ? (
                <details className="type-body-sm">
                  <summary className="cursor-pointer font-bold text-highlight">
                    {t("declarationRead")}
                  </summary>
                  <LegalText text={declaration.text.full} headingLevel={3} className="pt-3" />
                </details>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <Notice tone="amber" icon={InfoIcon} role="status">
          <b>{t("closedTitle")}</b> {t("closedBody")}
        </Notice>
      )}

      <Notice tone="muted" icon={InfoIcon}>
        <b>{t("whatSubmitTitle")}</b> {t("whatSubmitBody")}
      </Notice>
    </div>
  );
}
