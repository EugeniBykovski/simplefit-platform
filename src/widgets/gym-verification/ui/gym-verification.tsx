"use client";

import { FileTextIcon, LockIcon, ShieldCheckIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import type { Gym } from "@/entities/gym";
import {
  canManageVerification,
  useGymVerification,
  type GymVerification as Verification,
  type GymVerificationDocument,
} from "@/entities/gym-verification";
import {
  VerificationProblemNotice,
  useAddDocument,
  useConfirmDocument,
  useRemoveDocument,
  useSaveVerification,
  useSubmitVerification,
  verificationProblem,
  verificationReadProblem,
  type VerificationProblem,
} from "@/features/gym-verification-manage";
import type {
  GymBusinessVerificationRequest,
  GymVerificationEvidenceRequestKind,
} from "@/shared/api/generated/model";
import { countryOptions } from "@/shared/lib/countries";
import { applyApiFieldErrors } from "@/shared/lib/forms";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Combobox } from "@/shared/ui/combobox";
import { describedBy, FormField } from "@/shared/ui/form-field";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";
import { PageBody } from "@/shared/ui/page";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";

/*
 * OG7 "Verify business" (`web.app.gyms._gym-id.settings.verification`;
 * Claude Design 1793198527-a0fc, WebSetupVerify, a FUTURE board built on the
 * SF-103 API with the adaptations in docs/gym-console-web.md):
 *
 * - The business details (legal name, registration country and number,
 *   registered address, website) are saved as a draft against the
 *   application's revision; a change made elsewhere is a conflict, never an
 *   overwrite.
 * - Documents go straight to private storage through a one-time presigned
 *   upload; the backend checks the stored file before attaching it. There
 *   is no download here: only SimpleFit's review team opens documents.
 * - Submitting sends the application to SimpleFit's operators. Every status
 *   (in review, changes requested, approved, rejected, revoked) and the
 *   reason code come from the backend; nothing here can approve.
 *
 * The design's "Owner identity ✓ VERIFIED (payments partner)", per-document
 * "ACCEPTED" badges, "under 24 h" and the Discover / payouts / AML claims
 * have no approved domain or policy and are not shown.
 */

const FIELDS = [
  "legal_name",
  "registration_country",
  "registration_number",
  "address_line",
  "postal_code",
  "city",
  "website",
] as const;
type Field = (typeof FIELDS)[number];
type Values = Record<Field, string>;

const CURRENT = ["draft", "submitted", "changes_requested", "approved"];

const valuesOf = (verification: Verification): Values => {
  const application = CURRENT.includes(verification.status) ? verification.application : null;
  return Object.fromEntries(
    FIELDS.map((field) => [field, (application?.[field] as string | null | undefined) ?? ""]),
  ) as Values;
};

/** The page for the console's gym: a new gym is a new page (no state carries over). */
export function GymVerification({
  gym,
  upload,
}: {
  gym: Gym;
  /** Storybook and tests replace the direct storage upload. */
  upload?: (url: string, headers: Record<string, string>, file: File) => Promise<Response>;
}) {
  return <VerificationPage key={gym.id} gym={gym} upload={upload} />;
}

function VerificationPage({
  gym,
  upload,
}: {
  gym: Gym;
  upload?: (url: string, headers: Record<string, string>, file: File) => Promise<Response>;
}) {
  const t = useTranslations("gymVerification");
  const allowed = canManageVerification(gym.viewer);
  const query = useGymVerification(gym.id, { enabled: allowed });

  if (!allowed) {
    return (
      <PageBody className="pt-5.5" data-gym-verification data-verification-restricted>
        <Notice tone="muted" icon={LockIcon}>
          <span className="flex flex-col gap-1">
            <strong className="type-body-sm font-semibold text-foreground">
              {t("restricted.title")}
            </strong>
            <span>{t("restricted.body")}</span>
          </span>
        </Notice>
      </PageBody>
    );
  }

  if (query.isError) {
    return (
      <PageBody className="flex flex-col gap-3 pt-5.5" data-gym-verification>
        <VerificationProblemNotice problem={verificationReadProblem(query.error)} />
        <div>
          <Button variant="quiet" size="sm" onClick={() => void query.refetch()}>
            {t("retry")}
          </Button>
        </div>
      </PageBody>
    );
  }

  if (query.data === undefined) {
    return (
      <PageBody
        className="grid gap-4 pt-5.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
        data-gym-verification
        aria-busy
      >
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-40 rounded-3xl" />
      </PageBody>
    );
  }

  return <VerificationContent gymId={gym.id} verification={query.data} upload={upload} />;
}

function VerificationContent({
  gymId,
  verification,
  upload,
}: {
  gymId: string;
  verification: Verification;
  upload?: (url: string, headers: Record<string, string>, file: File) => Promise<Response>;
}) {
  return (
    <PageBody
      className="grid items-start gap-4 pt-5.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
      data-gym-verification
      data-verification-status={verification.status}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <StatusCard verification={verification} />
        <DetailsCard gymId={gymId} verification={verification} />
        <DocumentsCard gymId={gymId} verification={verification} upload={upload} />
        <SubmitCard gymId={gymId} verification={verification} />
      </div>
      <aside className="flex min-w-0 flex-col gap-4">
        <AboutCard />
      </aside>
    </PageBody>
  );
}

const statusTone = {
  not_started: "neutral",
  draft: "neutral",
  submitted: "warning",
  changes_requested: "warning",
  approved: "success",
  rejected: "destructive",
  revoked: "destructive",
} as const;

function StatusCard({ verification }: { verification: Verification }) {
  const t = useTranslations("gymVerification.status");
  const format = useFormatter();
  const decision = verification.latest_decision;
  const status = verification.status;

  return (
    <section
      aria-labelledby="verification-status"
      className="flex flex-col gap-2 rounded-3xl border border-border bg-card px-6 py-5"
      data-verification-state={status}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="verification-status" className="type-label text-faint-foreground">
          {t("label")}
        </h2>
        <Badge variant={statusTone[status]} data-status-badge>
          {status === "approved" && <ShieldCheckIcon aria-hidden />}
          {t(`badge.${status}`)}
        </Badge>
      </div>
      <p className="type-body-sm text-muted-foreground">{t(`body.${status}`)}</p>
      {decision !== null && decision.reason_code !== null && status !== "approved" && (
        <p className="type-body-sm" data-decision-reason={decision.reason_code}>
          <span className="font-extrabold">{t("reason")}</span>{" "}
          {t(`reasons.${decision.reason_code}`)}
        </p>
      )}
      {decision !== null && (
        <p className="type-caption text-faint-foreground">
          {t("decidedAt", { date: format.dateTime(new Date(decision.decided_at), "date") })}
        </p>
      )}
    </section>
  );
}

function DetailsCard({ gymId, verification }: { gymId: string; verification: Verification }) {
  const t = useTranslations("gymVerification.details");
  const locale = useLocale();
  const countries = useMemo(
    () => countryOptions(locale).map(({ code, name }) => ({ value: code, label: name })),
    [locale],
  );
  const save = useSaveVerification(gymId);
  const form = useForm<Values>({ defaultValues: valuesOf(verification) });
  const { register, control, handleSubmit, reset, setError, formState } = form;
  const [problem, setProblem] = useState<VerificationProblem>();
  const [saved, setSaved] = useState(false);
  const editable = verification.can_edit && verification.status !== "approved";
  const starting = ["not_started", "rejected", "revoked"].includes(verification.status);

  useEffect(() => {
    reset(valuesOf(verification), { keepDirtyValues: true });
  }, [verification, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setProblem(undefined);
    setSaved(false);
    const details = Object.fromEntries(
      FIELDS.map((field) => [field, values[field].trim() === "" ? null : values[field].trim()]),
    ) as Omit<GymBusinessVerificationRequest, "revision">;
    try {
      const answer = await save.mutateAsync({ verification, details });
      reset(valuesOf(answer.verification));
      setSaved(true);
    } catch (error) {
      if (!applyApiFieldErrors(error, setError, FIELDS)) setProblem(verificationProblem(error));
    }
  });

  const error = (field: Field) => formState.errors[field]?.message;
  const text = (field: Exclude<Field, "registration_country">, autoComplete?: string) => (
    <FormField id={`kyb-${field}`} label={t(`${field}.label`)} error={error(field)}>
      <Input
        id={`kyb-${field}`}
        disabled={!editable}
        autoComplete={autoComplete}
        aria-invalid={error(field) !== undefined || undefined}
        aria-describedby={describedBy(`kyb-${field}`)}
        {...register(field)}
      />
    </FormField>
  );

  return (
    <Card data-verification-details>
      <CardHeader>
        <CardTitle className="type-title font-display">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
          {problem !== undefined && <VerificationProblemNotice problem={problem} />}
          {formState.errors.root?.server?.message !== undefined && (
            <Notice tone="amber" role="alert">
              {formState.errors.root.server.message}
            </Notice>
          )}
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {text("legal_name", "organization")}
            <FormField
              id="kyb-registration_country"
              label={t("registration_country.label")}
              error={error("registration_country")}
            >
              <Controller
                control={control}
                name="registration_country"
                render={({ field }) => (
                  <Combobox
                    id="kyb-registration_country"
                    value={field.value === "" ? null : field.value}
                    onValueChange={(value) => field.onChange(value ?? "")}
                    options={countries}
                    disabled={!editable}
                    placeholder={t("registration_country.placeholder")}
                    searchLabel={t("registration_country.search")}
                    searchPlaceholder={t("registration_country.search")}
                    emptyLabel={t("registration_country.empty")}
                    invalid={error("registration_country") !== undefined}
                    aria-describedby={describedBy("kyb-registration_country")}
                  />
                )}
              />
            </FormField>
            {text("registration_number")}
            {text("website", "url")}
            {text("address_line", "street-address")}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-4">
              {text("postal_code", "postal-code")}
              {text("city", "address-level2")}
            </div>
          </div>
          {editable && (
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="secondary" disabled={save.isPending} data-save-details>
                {save.isPending && <Spinner />}
                {starting ? t("start") : t("save")}
              </Button>
              {saved && !formState.isDirty && (
                <span role="status" className="type-caption text-muted-foreground">
                  {t("saved")}
                </span>
              )}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

const KINDS: GymVerificationEvidenceRequestKind[] = [
  "registration_extract",
  "proof_of_address",
  "other",
];

function DocumentsCard({
  gymId,
  verification,
  upload,
}: {
  gymId: string;
  verification: Verification;
  upload?: (url: string, headers: Record<string, string>, file: File) => Promise<Response>;
}) {
  const t = useTranslations("gymVerification.documents");
  const format = useFormatter();
  const add = useAddDocument(gymId, upload);
  const remove = useRemoveDocument(gymId);
  const confirm = useConfirmDocument(gymId);
  const [kind, setKind] = useState<GymVerificationEvidenceRequestKind>("registration_extract");
  const [problem, setProblem] = useState<VerificationProblem>();
  const [refusal, setRefusal] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const kindId = useId();
  const fileId = useId();
  const editable = ["draft", "changes_requested"].includes(verification.status);
  const { requirements } = verification;
  const documents = verification.evidence;
  const full = documents.length >= requirements.max_evidence;
  const busy = add.isPending || remove.isPending || confirm.isPending;

  async function choose(file: File | undefined) {
    setProblem(undefined);
    setRefusal(undefined);
    if (file === undefined) return;
    if (!(requirements.content_types as string[]).includes(file.type)) {
      setRefusal(t("refusals.type"));
    } else if (file.size === 0 || file.size > requirements.max_bytes) {
      setRefusal(t("refusals.size", { megabytes: Math.floor(requirements.max_bytes / 1048576) }));
    } else {
      try {
        await add.mutateAsync({ verification, file, kind });
      } catch (error) {
        setProblem(verificationProblem(error));
      }
    }
    if (input.current) input.current.value = "";
  }

  async function act(run: () => Promise<unknown>) {
    setProblem(undefined);
    try {
      await run();
    } catch (error) {
      setProblem(verificationProblem(error));
    }
  }

  return (
    <Card data-verification-documents>
      <CardHeader>
        <CardTitle className="type-title font-display">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="type-body-sm text-muted-foreground">{t("lead")}</p>
        {problem !== undefined && <VerificationProblemNotice problem={problem} />}
        {refusal !== undefined && (
          <Notice tone="amber" role="alert" data-document-refusal>
            {refusal}
          </Notice>
        )}
        {documents.length === 0 ? (
          <p className="type-body-sm text-faint-foreground">{t("none")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
            {documents.map((document) => (
              <DocumentRow
                key={document.id}
                document={document}
                editable={editable}
                busy={busy}
                onRemove={() =>
                  void act(() => remove.mutateAsync({ verification, evidenceId: document.id }))
                }
                onCheck={() => void act(() => confirm.mutateAsync(document.id))}
                size={format.number(document.byte_size / 1024, { maximumFractionDigits: 0 })}
              />
            ))}
          </ul>
        )}
        {editable && !full && (
          <div className="flex flex-col gap-3 rounded-2xl border border-input bg-surface-elevated p-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={kindId} className="type-caption font-bold text-muted-foreground">
                  {t("kindLabel")}
                </label>
                <Select
                  value={kind}
                  onValueChange={(value) => setKind(value as GymVerificationEvidenceRequestKind)}
                  disabled={busy}
                >
                  <SelectTrigger id={kindId} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KINDS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`kinds.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => input.current?.click()}
                data-add-document
              >
                {add.isPending ? <Spinner /> : <UploadIcon aria-hidden />}
                {add.isPending ? t("uploading") : t("add")}
              </Button>
            </div>
            <label htmlFor={fileId} className="sr-only">
              {t("fileLabel")}
            </label>
            <input
              ref={input}
              id={fileId}
              type="file"
              className="sr-only"
              tabIndex={-1}
              accept={requirements.content_types.join(",")}
              onChange={(event) => void choose(event.target.files?.[0])}
              data-document-input
            />
            <p className="type-caption text-faint-foreground">
              {t("limits", {
                megabytes: Math.floor(requirements.max_bytes / 1048576),
                count: requirements.max_evidence,
              })}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocumentRow({
  document,
  editable,
  busy,
  size,
  onRemove,
  onCheck,
}: {
  document: GymVerificationDocument;
  editable: boolean;
  busy: boolean;
  size: string;
  onRemove: () => void;
  onCheck: () => void;
}) {
  const t = useTranslations("gymVerification.documents");
  const state = document.submitted ? "submitted" : document.status;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3" data-document={document.id}>
      <FileTextIcon aria-hidden className="size-4 flex-none text-faint-foreground" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate type-body-sm font-bold">{document.file_name}</span>
        <span className="type-caption text-muted-foreground">
          {t(`kinds.${document.kind}`)} · {t("size", { size })}
        </span>
      </span>
      <Badge
        variant={state === "pending_upload" ? "warning" : "neutral"}
        data-document-state={state}
      >
        {t(`states.${state}`)}
      </Badge>
      {editable && document.status === "pending_upload" && (
        <Button type="button" variant="quiet" size="sm" disabled={busy} onClick={onCheck}>
          {t("check")}
        </Button>
      )}
      {editable && !document.submitted && (
        <Button
          type="button"
          variant="quiet"
          size="sm"
          disabled={busy}
          onClick={onRemove}
          aria-label={t("remove", { name: document.file_name })}
        >
          <Trash2Icon aria-hidden />
        </Button>
      )}
    </li>
  );
}

function SubmitCard({ gymId, verification }: { gymId: string; verification: Verification }) {
  const t = useTranslations("gymVerification.submit");
  const fields = useTranslations("gymVerification.details");
  const submit = useSubmitVerification(gymId);
  const [problem, setProblem] = useState<VerificationProblem>();

  if (!["draft", "changes_requested"].includes(verification.status)) return null;

  const missing = verification.missing.map((item) =>
    item === "evidence" ? t("missingEvidence") : fields(`${item}.label`),
  );

  return (
    <section
      aria-labelledby="verification-submit"
      className="flex flex-col gap-3 rounded-3xl border border-border bg-card px-6 py-5"
      data-verification-submit
    >
      <h2 id="verification-submit" className="type-title font-display">
        {t("title")}
      </h2>
      <p className="type-body-sm text-muted-foreground">{t("body")}</p>
      {missing.length > 0 && (
        <p className="type-body-sm" data-missing={verification.missing.join(" ")}>
          <span className="font-extrabold">{t("missing")}</span> {missing.join(", ")}
        </p>
      )}
      {problem !== undefined && <VerificationProblemNotice problem={problem} />}
      <div>
        <Button
          type="button"
          disabled={!verification.can_submit || submit.isPending}
          onClick={() => {
            setProblem(undefined);
            submit.mutate(verification, {
              onError: (error) => setProblem(verificationProblem(error)),
            });
          }}
          data-submit-verification
        >
          {submit.isPending && <Spinner />}
          {verification.status === "changes_requested" ? t("resubmit") : t("action")}
        </Button>
      </div>
    </section>
  );
}

function AboutCard() {
  const t = useTranslations("gymVerification.about");
  return (
    <section
      aria-labelledby="verification-about"
      className="flex flex-col gap-2.5 rounded-3xl border border-border bg-card px-5 py-5"
    >
      <h2 id="verification-about" className="type-label text-faint-foreground">
        {t("title")}
      </h2>
      <p className="type-body-sm text-muted-foreground">{t("review")}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 type-body-sm text-muted-foreground">
        <li>{t("notPublish")}</li>
        <li>{t("notPayments")}</li>
        <li>{t("notPlan")}</li>
      </ul>
      <p className="type-body-sm text-muted-foreground">{t("privacy")}</p>
    </section>
  );
}
