"use client";

import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import {
  JOB_STATES,
  JOB_WORKERS,
  useJob,
  useJobs,
  useOperationsHealth,
  type JobFilters,
  type OperationsCheck,
  type OperationsHealth,
  type OperationsJob,
} from "@/entities/admin-operations";
import { grants, useOperator } from "@/entities/operator";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";

const STATUS_VARIANT = {
  healthy: "success",
  degraded: "warning",
  unavailable: "destructive",
  unknown: "neutral",
  no_telemetry: "outline",
} as const;

const ANY = "any";
const QUEUE_STATES = [
  "available",
  "scheduled",
  "executing",
  "retryable",
  "completed",
  "discarded",
  "cancelled",
] as const;

/**
 * AD17, system health (SF-126; Claude Design `AdminIntegrations`, MVP reduced): what the
 * backend measured, check by check, with when; unknown and "no telemetry" are never
 * shown as healthy and nothing is an uptime figure. Queue counts, applied migrations and
 * the configured release. With `system.jobs.read`, the background job list: metadata
 * only, never arguments or error messages, and no retry (none is approved). Health is
 * re-read every minute while visible; a failed refresh keeps the last answer, marked as
 * such, never as current.
 */
export function OperationsPage() {
  const t = useTranslations("controlPlane.operations");
  const common = useTranslations("controlPlane.users");
  const format = useFormatter();
  const operator = useOperator().data;
  const health = useOperationsHealth();
  const canHealth = operator ? grants(operator, "system.health.read") : true;
  const canJobs = operator ? grants(operator, "system.jobs.read") : false;
  const forbidden = !canHealth || (isApiError(health.error) && health.error.status === 403);

  let body: ReactNode;
  if (forbidden && !canJobs) {
    body = <Restricted />;
  } else if (forbidden) {
    body = <p className="type-body-sm text-muted-foreground">{t("noHealthAccess")}</p>;
  } else if (health.data === undefined && health.isError) {
    body = (
      <section
        data-operations-state="unreachable"
        className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5"
      >
        <Badge variant="destructive" className="gap-1.5 uppercase">
          <AlertTriangleIcon aria-hidden className="size-3.5" />
          {common("error.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{t("unreachable.title")}</h2>
        <p role="alert" className="type-body-sm text-muted-foreground">
          {t("unreachable.body")}
        </p>
        <Button onClick={() => void health.refetch()}>{common("error.retry")}</Button>
      </section>
    );
  } else if (health.data === undefined) {
    body = (
      <div role="status" aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-2">
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  } else {
    body = (
      <Health
        health={health.data}
        stale={health.isError}
        refreshing={health.isFetching}
        onRefresh={() => void health.refetch()}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <nav aria-label="Breadcrumb">
            <p className="type-label text-faint-foreground">{t("breadcrumb")}</p>
          </nav>
          <h1 className="truncate type-h3 font-display">{t("title")}</h1>
        </div>
        {health.data && (
          <span className="type-caption text-faint-foreground">
            {t("checkedAt", {
              time: format.dateTime(new Date(health.data.observed_at), "dateTime"),
            })}
          </span>
        )}
      </PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">
        {body}
        {canJobs && <Jobs queues={health.data?.queues ?? null} />}
        {!canJobs && !forbidden && (
          <p className="type-caption text-faint-foreground">{t("jobs.noAccess")}</p>
        )}
      </PageBody>
    </div>
  );
}

function Health({
  health,
  stale,
  refreshing,
  onRefresh,
}: {
  health: OperationsHealth;
  stale: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations("controlPlane.operations");
  const format = useFormatter();
  const time = (value: string | null) =>
    value === null ? "—" : format.dateTime(new Date(value), "dateTime");
  const count = (check: OperationsCheck, key: string) =>
    format.number(check.counts.find((entry) => entry.key === key)?.value ?? 0, "integer");

  const source = (check: OperationsCheck): string => {
    switch (check.id) {
      case "database":
        return t("sources.database", { ms: count(check, "query_ms") });
      case "background_jobs":
        return t("sources.background_jobs", {
          waiting: count(check, "waiting"),
          executing: count(check, "executing"),
          failed: count(check, "failed_24h"),
        });
      case "email":
        return t("sources.email", {
          accepted: count(check, "accepted_24h"),
          failed: count(check, "failed_24h"),
          pending: count(check, "pending"),
        });
      case "payments_webhooks":
        return check.last_event_at === null
          ? t("sources.webhooksNone")
          : t("sources.payments_webhooks", {
              time: time(check.last_event_at),
              received: count(check, "received_24h"),
              failed: count(check, "failed_24h"),
            });
      default:
        return t(`sources.${check.id}`);
    }
  };

  return (
    <div className="flex flex-col gap-4" data-operations-state={stale ? "stale" : "ready"}>
      {stale && (
        <p
          role="status"
          className="rounded-xl border border-warning-subtle bg-warning-subtle px-4 py-3 type-body-sm text-warning-subtle-foreground"
        >
          {t("stale", { time: time(health.observed_at) })}
        </p>
      )}

      <section aria-labelledby="operations-services" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="operations-services" className="type-title font-display">
            {t("services.title")}
          </h2>
          <Button variant="quiet" size="sm" loading={refreshing} onClick={onRefresh}>
            <RefreshCwIcon aria-hidden />
            {t("refresh")}
          </Button>
        </div>
        <ul aria-label={t("legend.label")} className="flex flex-wrap gap-2">
          {(Object.keys(STATUS_VARIANT) as (keyof typeof STATUS_VARIANT)[]).map((status) => (
            <li key={status}>
              <Badge variant={STATUS_VARIANT[status]} className="uppercase">
                {t(`status.${status}`)}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="type-caption text-muted-foreground">{t("legend.note")}</p>
        <div className="overflow-x-auto rounded-3xl border bg-surface">
          <table className="w-full min-w-160 text-left">
            <caption className="sr-only">{t("services.caption")}</caption>
            <thead>
              <tr className="border-b type-label text-faint-foreground">
                <th scope="col" className="p-4">
                  {t("services.service")}
                </th>
                <th scope="col" className="p-4">
                  {t("services.source")}
                </th>
                <th scope="col" className="p-4">
                  {t("services.status")}
                </th>
                <th scope="col" className="p-4">
                  {t("services.checked")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {health.checks.map((check) => (
                <tr key={check.id} data-check={check.id} data-status={check.status}>
                  <th scope="row" className="p-4 type-body-sm font-bold">
                    {t(`checks.${check.id}`)}
                  </th>
                  <td className="p-4 type-body-sm text-muted-foreground">{source(check)}</td>
                  <td className="p-4">
                    <Badge variant={STATUS_VARIANT[check.status]} className="uppercase">
                      {t(`status.${check.status}`)}
                    </Badge>
                  </td>
                  <td className="p-4 type-body-sm text-muted-foreground">
                    {time(check.observed_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <section
          aria-labelledby="operations-queues"
          className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-5 lg:col-span-2"
        >
          <h2 id="operations-queues" className="type-title font-display">
            {t("queues.title")}
          </h2>
          {health.queues === null ? (
            <p className="type-body-sm text-muted-foreground">{t("queues.unavailable")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left" data-queues>
                <caption className="sr-only">{t("queues.caption")}</caption>
                <thead>
                  <tr className="border-b type-label text-faint-foreground">
                    <th scope="col" className="py-2 pe-3">
                      {t("queues.queue")}
                    </th>
                    <th scope="col" className="py-2 pe-3">
                      {t("queues.limit")}
                    </th>
                    {QUEUE_STATES.map((state) => (
                      <th key={state} scope="col" className="py-2 pe-3">
                        {t(`states.${state}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {health.queues.map((queue) => (
                    <tr key={queue.name} data-queue={queue.name}>
                      <th scope="row" className="py-2 pe-3 type-body-sm font-bold">
                        {queue.name}
                      </th>
                      <td className="py-2 pe-3 type-body-sm tabular-nums">{queue.limit}</td>
                      {QUEUE_STATES.map((state) => (
                        <td key={state} className="py-2 pe-3 type-body-sm tabular-nums">
                          {format.number(queue.counts[state], "integer")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="type-caption text-faint-foreground">{t("queues.note")}</p>
        </section>

        <section
          aria-labelledby="operations-release"
          className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-5"
        >
          <h2 id="operations-release" className="type-title font-display">
            {t("release.title")}
          </h2>
          <dl className="flex flex-col divide-y">
            <Fact label={t("release.release")}>
              {health.release.release}{" "}
              <span className="type-caption text-muted-foreground">
                {t(`release.source.${health.release.source}`)}
              </span>
            </Fact>
            <Fact label={t("release.environment")}>{health.release.environment}</Fact>
            <Fact label={t("release.migrations")}>
              {health.migrations === null
                ? t("release.unavailable")
                : t("release.applied", {
                    count: health.migrations.applied,
                    latest: health.migrations.latest_version ?? "—",
                  })}
            </Fact>
          </dl>
          <p className="type-caption text-faint-foreground">{t("release.note")}</p>
        </section>
      </div>
    </div>
  );
}

function Jobs({ queues }: { queues: OperationsHealth["queues"] }) {
  const t = useTranslations("controlPlane.operations.jobs");
  const ops = useTranslations("controlPlane.operations");
  const common = useTranslations("controlPlane.users");
  const format = useFormatter();
  const [filters, setFilters] = useState<JobFilters>({ state: "discarded" });
  const [cursors, setCursors] = useState<string[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const page = useJobs(filters, cursors.at(-1), true);

  const update = (next: JobFilters) => {
    setFilters(next);
    setCursors([]);
    setOpen(null);
  };
  const short = (worker: string) => worker.replace(/^SimpleFit\./, "");
  const latest = (job: OperationsJob) =>
    job.discarded_at ?? job.cancelled_at ?? job.completed_at ?? job.attempted_at ?? job.inserted_at;

  let body: ReactNode;
  if (isApiError(page.error) && page.error.status === 403) {
    body = <p className="type-body-sm text-muted-foreground">{t("noAccess")}</p>;
  } else if (page.isPending || (page.isFetching && page.isError)) {
    body = (
      <div role="status" aria-busy="true" aria-label={t("loading")}>
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    );
  } else if (page.isError) {
    body = (
      <div className="flex flex-col items-start gap-2">
        <p role="alert" className="type-body-sm text-muted-foreground">
          {common("error.body")}
        </p>
        <Button variant="quiet" onClick={() => void page.refetch()}>
          {common("error.retry")}
        </Button>
      </div>
    );
  } else if (page.data.jobs.length === 0) {
    body = (
      <p role="status" data-jobs-state="empty" className="type-body-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  } else {
    const next = page.data.next_cursor;
    body = (
      <div className="flex flex-col gap-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-180 text-left" data-jobs-state="ready">
            <caption className="sr-only">{t("caption")}</caption>
            <thead>
              <tr className="border-b type-label text-faint-foreground">
                <th scope="col" className="py-2 pe-3">
                  {t("columns.job")}
                </th>
                <th scope="col" className="py-2 pe-3">
                  {t("columns.worker")}
                </th>
                <th scope="col" className="py-2 pe-3">
                  {t("columns.state")}
                </th>
                <th scope="col" className="py-2 pe-3">
                  {t("columns.attempts")}
                </th>
                <th scope="col" className="py-2 pe-3">
                  {t("columns.failure")}
                </th>
                <th scope="col" className="py-2 pe-3">
                  {t("columns.when")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {page.data.jobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  open={open === job.id}
                  onToggle={() => setOpen(open === job.id ? null : job.id)}
                  label={short(job.worker)}
                  when={format.dateTime(new Date(latest(job)), "dateTime")}
                />
              ))}
            </tbody>
          </table>
        </div>
        <nav aria-label={t("pages.label")} className="flex items-center justify-between gap-3">
          <Button
            variant="quiet"
            disabled={cursors.length === 0}
            onClick={() => setCursors((stack) => stack.slice(0, -1))}
          >
            {t("pages.previous")}
          </Button>
          <span className="type-caption text-faint-foreground">
            {t("pages.page", { page: cursors.length + 1 })}
          </span>
          <Button
            variant="quiet"
            disabled={!next}
            onClick={() => next && setCursors((stack) => [...stack, next])}
          >
            {t("pages.next")}
          </Button>
        </nav>
      </div>
    );
  }

  return (
    <section
      aria-labelledby="operations-jobs"
      className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-5"
    >
      <h2 id="operations-jobs" className="type-title font-display">
        {t("title")}
      </h2>
      <form
        role="search"
        aria-label={t("filters.label")}
        onSubmit={(event) => event.preventDefault()}
        className="grid gap-3 sm:grid-cols-3"
      >
        <Filter
          id="jobs-filter-state"
          label={t("filters.state")}
          any={t("filters.any")}
          value={filters.state}
          options={JOB_STATES.map((state) => [state, ops(`states.${state}`)])}
          onChange={(value) => update({ ...filters, state: value as JobFilters["state"] })}
        />
        <Filter
          id="jobs-filter-queue"
          label={t("filters.queue")}
          any={t("filters.any")}
          value={filters.queue}
          options={(queues ?? []).map((queue) => [queue.name, queue.name])}
          onChange={(value) => update({ ...filters, queue: value })}
        />
        <Filter
          id="jobs-filter-worker"
          label={t("filters.worker")}
          any={t("filters.any")}
          value={filters.worker}
          options={JOB_WORKERS.map((worker) => [worker, short(worker)])}
          onChange={(value) => update({ ...filters, worker: value as JobFilters["worker"] })}
        />
      </form>
      {body}
      <p className="type-caption text-faint-foreground">{t("note")}</p>
    </section>
  );
}

function JobRow({
  job,
  open,
  onToggle,
  label,
  when,
}: {
  job: OperationsJob;
  open: boolean;
  onToggle: () => void;
  label: string;
  when: string;
}) {
  const t = useTranslations("controlPlane.operations.jobs");
  const ops = useTranslations("controlPlane.operations");
  return (
    <>
      <tr data-job={job.id} data-job-state={job.state}>
        <th scope="row" className="py-2 pe-3 type-body-sm">
          <Button
            variant="link"
            size="sm"
            aria-expanded={open}
            aria-controls={`job-detail-${job.id}`}
            onClick={onToggle}
          >
            #{job.id}
          </Button>
        </th>
        <td className="py-2 pe-3 type-body-sm">
          {label}
          <span className="block type-caption text-faint-foreground">{job.queue}</span>
        </td>
        <td className="py-2 pe-3 type-body-sm">{ops(`states.${job.state}`)}</td>
        <td className="py-2 pe-3 type-body-sm tabular-nums">
          {t("attempts", { attempt: job.attempt, max: job.max_attempts })}
        </td>
        <td className="py-2 pe-3 type-body-sm">{job.failure ?? "—"}</td>
        <td className="py-2 pe-3 type-body-sm text-muted-foreground">{when}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} id={`job-detail-${job.id}`} className="py-2">
            <JobDetail id={job.id} />
          </td>
        </tr>
      )}
    </>
  );
}

function JobDetail({ id }: { id: number }) {
  const t = useTranslations("controlPlane.operations.jobs");
  const ops = useTranslations("controlPlane.operations");
  const format = useFormatter();
  const read = useJob(id);
  const time = (value: string | null) =>
    value === null ? "—" : format.dateTime(new Date(value), "dateTime");

  if (read.isError)
    return (
      <p role="alert" className="type-body-sm text-muted-foreground">
        {t("detail.gone")}
      </p>
    );
  if (read.data === undefined)
    return (
      <div role="status" aria-busy="true" aria-label={t("loading")}>
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  const job = read.data;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border p-4" data-job-detail={job.id}>
      <p className="type-body-sm">{t("detail.now", { state: ops(`states.${job.state}`) })}</p>
      <dl className="grid gap-x-6 gap-y-1 type-body-sm sm:grid-cols-2">
        {(
          [
            ["inserted", job.inserted_at],
            ["scheduled", job.scheduled_at],
            ["attempted", job.attempted_at],
            ["completed", job.completed_at],
            ["discarded", job.discarded_at],
            ["cancelled", job.cancelled_at],
          ] as const
        ).map(([key, value]) => (
          <div key={key} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{t(`detail.${key}`)}</dt>
            <dd>{time(value)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("detail.errors")}</dt>
          <dd>{job.errors}</dd>
        </div>
      </dl>
      <p className="type-caption text-muted-foreground">{t("detail.retry")}</p>
    </div>
  );
}

function Filter({
  id,
  label,
  any,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  any: string;
  value: string | undefined;
  options: [string, string][];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? ANY}
        onValueChange={(next) => onChange(next === ANY ? undefined : next)}
      >
        <SelectTrigger id={id} className="h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{any}</SelectItem>
          {options.map(([option, name]) => (
            <SelectItem key={option} value={option}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 type-body-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-bold break-words">{children}</dd>
    </div>
  );
}

function Restricted() {
  const t = useTranslations("controlPlane.users.restricted");
  return (
    <section
      data-operations-state="restricted"
      className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5"
    >
      <h2 className="type-h3 font-display">{t("title")}</h2>
      <p className="type-body-sm text-muted-foreground">{t("body")}</p>
      <Button asChild variant="quiet">
        <Link href={routeHref("web.admin")}>{t("back")}</Link>
      </Button>
    </section>
  );
}
