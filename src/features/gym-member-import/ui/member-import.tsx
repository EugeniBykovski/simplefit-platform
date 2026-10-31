"use client";

import { FileTextIcon, LockIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";

import type { GymMemberImportPreviewResponsePreviewRowsItem as PreviewRow } from "@/shared/api/generated/model";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Spinner } from "@/shared/ui/spinner";

import { CSV_ACCEPT, CSV_LIMITS } from "../model/csv-file";
import {
  useImportPreview,
  type ColumnMapping,
  type ImportPreview,
  type PreviewProblem,
} from "../model/use-import-preview";

/*
 * OG12 "Import members" reconciled with SF-95 and D-G27 (SF-96): choose a
 * CSV, map its columns, run the backend's validation and review the result.
 * It stops there. The backend stores nothing from a preview and offers no
 * commit (`commit.available: false`, `blocked_by: legal_basis_pending`):
 * nobody is invited, added or emailed, no account is created or matched, and
 * the page never says otherwise. OG12's plan, start date and phone fields,
 * "Send invite emails" and "Duplicates merged" are not built.
 */

const AUTO = "__auto";
const NONE = "__none";
const PAGE = 100;

const OUTCOMES = [
  "ready",
  "already_member",
  "request_pending",
  "already_invited",
  "duplicate",
  "missing_email",
  "invalid_email",
] as const;
type Outcome = (typeof OUTCOMES)[number];
const ATTENTION: readonly Outcome[] = ["duplicate", "missing_email", "invalid_email"];

export function MemberImport({ gymId }: { gymId: string }) {
  const t = useTranslations("gymConsole.members.import");
  const { state, choose, setMapping, validate, clear } = useImportPreview(gymId);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const chosen = state.file !== null && state.fileProblem === null && !state.reading;

  return (
    <div
      className="grid content-start gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]"
      data-member-import
    >
      <div className="flex min-w-0 flex-col gap-4">
        <section
          aria-labelledby="import-file-heading"
          className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface px-5 py-4.5"
        >
          <h2 id="import-file-heading" className="type-label text-faint-foreground">
            {t("file.heading")}
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <span
              aria-hidden
              className="flex size-11 flex-none items-center justify-center rounded-xl bg-accent text-highlight"
            >
              <FileTextIcon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              {state.file ? (
                <>
                  <span className="truncate type-body-sm font-extrabold" data-import-file>
                    {state.file.name}
                  </span>
                  <span className="type-caption text-muted-foreground">
                    {state.reading
                      ? t("file.reading")
                      : t("file.size", { size: Math.max(1, Math.ceil(state.file.size / 1024)) })}
                  </span>
                </>
              ) : (
                <span className="type-body-sm text-muted-foreground">{t("file.none")}</span>
              )}
            </div>
            <input
              ref={input}
              id={inputId}
              type="file"
              accept={CSV_ACCEPT}
              hidden
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                // The input is emptied at once: the browser keeps no reference to the file.
                event.target.value = "";
                if (file) void choose(file);
              }}
              data-import-input
            />
            <Button
              variant="quiet"
              size="sm"
              aria-describedby={`${inputId}-limits`}
              disabled={state.reading || state.running}
              onClick={() => input.current?.click()}
              data-import-choose
            >
              {state.file ? t("file.replace") : t("file.choose")}
            </Button>
            {state.file && (
              <Button variant="ghost" size="sm" onClick={clear} data-import-clear>
                {t("file.clear")}
              </Button>
            )}
          </div>
          <p id={`${inputId}-limits`} className="type-caption text-faint-foreground">
            {t("file.limits", {
              rows: CSV_LIMITS.maxRows,
              columns: CSV_LIMITS.maxColumns,
              field: CSV_LIMITS.maxField,
            })}
          </p>
          {state.fileProblem && (
            <Notice tone="coral" role="alert" data-import-file-problem={state.fileProblem}>
              {t(`fileProblems.${state.fileProblem}`, { columns: CSV_LIMITS.maxColumns })}
            </Notice>
          )}
        </section>

        {chosen && (
          <Mapping
            header={state.header}
            mapping={state.mapping}
            disabled={state.running}
            onChange={setMapping}
          />
        )}

        {chosen && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              aria-busy={state.running}
              disabled={state.running}
              onClick={() => void validate()}
              data-import-validate
            >
              {state.running && <Spinner />}
              {state.running ? t("validating") : t("validate")}
            </Button>
            <span className="type-caption text-faint-foreground">{t("validateNote")}</span>
          </div>
        )}

        {state.problem && <ProblemNotice problem={state.problem} />}
        {state.preview && <Results preview={state.preview} />}
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <section
          aria-labelledby="import-about-heading"
          className="flex flex-col gap-2.5 rounded-3xl border bg-surface px-5 py-4.5"
        >
          <h2 id="import-about-heading" className="type-label text-faint-foreground">
            {t("about.heading")}
          </h2>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 type-body-sm text-muted-foreground">
            <li>{t("about.steps.choose")}</li>
            <li>{t("about.steps.map")}</li>
            <li>{t("about.steps.validate")}</li>
            <li>{t("about.steps.review")}</li>
          </ol>
          <Notice tone="amber" data-import-commit-unavailable>
            {t("about.unavailable")}
          </Notice>
        </section>
        <p className="flex items-start gap-2.5 rounded-2xl border bg-muted px-3.5 py-3 type-caption text-muted-foreground">
          <LockIcon aria-hidden className="mt-0.5 size-4 flex-none text-faint-foreground" />
          {t("about.privacy")}
        </p>
      </div>
    </div>
  );
}

function Mapping({
  header,
  mapping,
  disabled,
  onChange,
}: {
  header: string[];
  mapping: ColumnMapping;
  disabled: boolean;
  onChange: (mapping: ColumnMapping) => void;
}) {
  const t = useTranslations("gymConsole.members.import.mapping");
  const emailId = useId();
  const nameId = useId();

  return (
    <section
      aria-labelledby="import-mapping-heading"
      className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface px-5 py-4.5"
      data-import-mapping
    >
      <div className="flex flex-col gap-1">
        <h2 id="import-mapping-heading" className="type-title font-display">
          {t("heading")}
        </h2>
        <p className="type-caption text-muted-foreground">{t("lead")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={emailId} label={t("email")} required={t("required")}>
          <Select
            value={mapping.email ?? AUTO}
            disabled={disabled}
            onValueChange={(value) =>
              onChange({ ...mapping, email: value === AUTO ? null : value })
            }
          >
            <SelectTrigger id={emailId} className="h-11 w-full" data-import-map="email">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO}>{t("suggest")}</SelectItem>
              {header.map((column) => (
                <SelectItem key={column} value={column} disabled={column === mapping.name}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id={nameId} label={t("name")} required={t("optional")}>
          <Select
            value={mapping.name ?? NONE}
            disabled={disabled}
            onValueChange={(value) => onChange({ ...mapping, name: value === NONE ? null : value })}
          >
            <SelectTrigger id={nameId} className="h-11 w-full" data-import-map="name">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("none")}</SelectItem>
              {header.map((column) => (
                <SelectItem key={column} value={column} disabled={column === mapping.email}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <p className="type-caption text-faint-foreground">{t("others")}</p>
      {mapping.email !== null || mapping.name !== null ? (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={disabled}
          onClick={() => onChange({ email: null, name: null })}
        >
          {t("reset")}
        </Button>
      ) : null}
    </section>
  );
}

function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="type-caption font-bold text-muted-foreground">
        {label} <span className="text-faint-foreground">· {required}</span>
      </label>
      {children}
    </div>
  );
}

function ProblemNotice({ problem }: { problem: PreviewProblem }) {
  const t = useTranslations("gymConsole.members.import.problems");
  const text =
    problem.kind === "limited"
      ? problem.minutes === null
        ? t("limitedLater")
        : t("limited", { minutes: problem.minutes })
      : t(problem.kind);
  return (
    <Notice
      tone={problem.kind === "unknown" ? "coral" : "amber"}
      role="alert"
      data-import-problem={problem.kind}
    >
      {text}
    </Notice>
  );
}

function Results({ preview }: { preview: ImportPreview }) {
  const t = useTranslations("gymConsole.members.import.results");
  const format = useFormatter();
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const summary = preview.summary;
  const rows = onlyAttention
    ? preview.rows.filter((row) => ATTENTION.includes(row.outcome))
    : preview.rows;
  const ignored = preview.columns.filter((column) => column.status === "not_imported");

  return (
    <section
      aria-labelledby="import-results-heading"
      className="flex min-w-0 flex-col gap-4 rounded-3xl border bg-surface px-5 py-4.5"
      data-import-results
    >
      <div className="flex flex-col gap-1">
        <h2 id="import-results-heading" className="type-title font-display">
          {t("heading")}
        </h2>
        <p role="status" className="type-body-sm text-muted-foreground">
          {t("status", { total: summary.total })}
        </p>
      </div>
      <Notice tone="amber" data-import-commit={preview.commit.blocked_by}>
        {t("unavailable")}
      </Notice>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-import-summary>
        <Count label={t("total")} value={summary.total} />
        {OUTCOMES.map((outcome) => (
          <Count key={outcome} label={t(`outcomes.${outcome}`)} value={summary[outcome]} />
        ))}
      </dl>
      {ignored.length > 0 && (
        <p className="type-caption text-muted-foreground" data-import-ignored>
          {t("ignored", {
            columns: format.list(
              ignored.map((column) => column.header),
              { type: "conjunction" },
            ),
          })}
        </p>
      )}
      {preview.rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("filter")}>
          <Button
            size="sm"
            variant={onlyAttention ? "ghost" : "secondary"}
            className="rounded-full"
            aria-pressed={!onlyAttention}
            onClick={() => {
              setOnlyAttention(false);
              setShown(PAGE);
            }}
          >
            {t("all")}
          </Button>
          <Button
            size="sm"
            variant={onlyAttention ? "secondary" : "ghost"}
            className="rounded-full"
            aria-pressed={onlyAttention}
            onClick={() => {
              setOnlyAttention(true);
              setShown(PAGE);
            }}
          >
            {t("attention")}
          </Button>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="type-body-sm text-muted-foreground">
          {onlyAttention ? t("noneAttention") : t("noRows")}
        </p>
      ) : (
        <RowsTable rows={rows.slice(0, shown)} />
      )}
      {rows.length > shown && (
        <Button
          variant="quiet"
          size="sm"
          className="self-center"
          onClick={() => setShown((count) => count + PAGE)}
        >
          {t("more", { count: Math.min(PAGE, rows.length - shown) })}
        </Button>
      )}
      <p className="type-caption text-faint-foreground">{t("nothingStored")}</p>
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border px-3 py-2.5">
      <dt className="type-caption text-muted-foreground">{label}</dt>
      <dd className="type-body-lg font-display font-bold">{value}</dd>
    </div>
  );
}

const TONE: Record<Outcome, "accent" | "neutral" | "warning"> = {
  ready: "accent",
  already_member: "neutral",
  request_pending: "neutral",
  already_invited: "neutral",
  duplicate: "warning",
  missing_email: "warning",
  invalid_email: "warning",
};

function RowsTable({ rows }: { rows: PreviewRow[] }) {
  const t = useTranslations("gymConsole.members.import.results");
  const grid = "md:grid-cols-[minmax(0,0.5fr)_minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,1.4fr)]";

  return (
    <div role="table" aria-label={t("tableLabel")} className="flex flex-col" data-import-rows>
      <div role="rowgroup" className="hidden md:block">
        <div
          role="row"
          className={cn("grid gap-3 px-3 pb-2 type-label text-faint-foreground", grid)}
        >
          <span role="columnheader">{t("columns.line")}</span>
          <span role="columnheader">{t("columns.email")}</span>
          <span role="columnheader">{t("columns.name")}</span>
          <span role="columnheader">{t("columns.result")}</span>
        </div>
      </div>
      <div role="rowgroup">
        {rows.map((row) => (
          <div
            key={row.line}
            role="row"
            data-import-row={row.line}
            data-import-outcome={row.outcome}
            className={cn(
              "grid min-h-12 items-center gap-x-3 gap-y-1 border-t px-3 py-2 type-body-sm",
              grid,
            )}
          >
            <span role="cell" className="font-mono text-muted-foreground">
              <Hidden label={t("columns.line")} />
              {row.line}
            </span>
            <span role="cell" className="min-w-0 truncate font-bold">
              <Hidden label={t("columns.email")} />
              {row.email ?? <span className="text-faint-foreground">{t("noEmail")}</span>}
            </span>
            <span role="cell" className="text-muted-foreground">
              <Hidden label={t("columns.name")} />
              {row.name_present ? t("namePresent") : t("nameMissing")}
            </span>
            <span role="cell" className="flex flex-wrap items-center gap-2">
              <Hidden label={t("columns.result")} />
              <Badge variant={TONE[row.outcome]}>{t(`outcomes.${row.outcome}`)}</Badge>
              {row.outcome === "duplicate" && row.duplicate_of_line !== null && (
                <span className="type-caption text-muted-foreground">
                  {t("duplicateOf", { line: row.duplicate_of_line })}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A column name for stacked rows (below md the header row is hidden). */
function Hidden({ label }: { label: string }) {
  return <span className="sr-only md:hidden">{`${label} `}</span>;
}
