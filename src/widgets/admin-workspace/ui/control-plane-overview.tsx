"use client";

import { AlertTriangleIcon, InfoIcon, type LucideIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import {
  countOf,
  DEFAULT_OVERVIEW_PERIOD,
  metricOf,
  OVERVIEW_PERIODS,
  useOverview,
  type Overview,
  type OverviewCheck,
  type OverviewMetric,
  type OverviewPeriod,
} from "@/entities/admin-overview";
import { useOperatorKeys } from "@/entities/operator";
import { isApiError } from "@/shared/api/http/api-error";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";

/**
 * AD1, the Control Plane overview (SF-121; Claude Design `AdminOverview`, MVP): platform
 * counts, the review queues and system health, exactly as the backend answers them
 * (`GET /api/v1/admin/overview`). A section the operator can't see says so and is
 * never shown as zero; a number SimpleFit can't produce is "—"; there are no trends,
 * deltas or charts. The period only drives the "new in the last …" lines, each labelled
 * with the period the backend answered for.
 */
export function ControlPlaneOverview() {
  const [period, setPeriod] = useState<OverviewPeriod>(DEFAULT_OVERVIEW_PERIOD);
  const read = useOverview(period);
  const { reread } = useOperatorKeys();

  const forbidden = isApiError(read.error) && read.error.status === 403;
  // A 404 (no longer an operator) or a lapsed key check: the gate answers on its next read.
  if (
    isApiError(read.error) &&
    (read.error.status === 404 || read.error.code === "step_up_required")
  ) {
    void reread();
  }

  return (
    <OverviewView
      overview={read.data}
      period={period}
      onPeriod={setPeriod}
      updating={read.isPlaceholderData && read.isFetching}
      failed={read.isError && !forbidden && read.data === undefined}
      forbidden={forbidden}
      onRetry={() => void read.refetch()}
    />
  );
}

/** The overview for an answer (or its absence); presentational. */
export function OverviewView({
  overview,
  period,
  onPeriod,
  updating = false,
  failed = false,
  forbidden = false,
  onRetry,
}: {
  overview: Overview | undefined;
  period: OverviewPeriod;
  onPeriod: (period: OverviewPeriod) => void;
  updating?: boolean;
  failed?: boolean;
  forbidden?: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations("controlPlane.overview");

  let body: ReactNode;
  if (forbidden) {
    body = (
      <section
        data-overview-state="forbidden"
        className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5"
      >
        <h2 className="type-h3 font-display">{t("forbidden.title")}</h2>
        <p className="type-body-sm text-muted-foreground">{t("forbidden.body")}</p>
      </section>
    );
  } else if (failed) {
    body = (
      <section
        data-overview-state="error"
        className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5"
      >
        <Badge variant="destructive" className="gap-1.5 uppercase">
          <AlertTriangleIcon aria-hidden className="size-3.5" />
          {t("error.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{t("error.title")}</h2>
        <p className="type-body-sm text-muted-foreground">{t("error.body")}</p>
        <Button className="h-12" onClick={onRetry}>
          {t("error.retry")}
        </Button>
      </section>
    );
  } else if (overview === undefined) {
    body = (
      <div
        role="status"
        aria-busy="true"
        aria-label={t("loading")}
        data-overview-state="loading"
        className="grid gap-4 lg:grid-cols-2"
      >
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-56 rounded-lg" />
        <Skeleton className="h-56 rounded-lg" />
      </div>
    );
  } else {
    body = <Ready overview={overview} period={period} onPeriod={onPeriod} updating={updating} />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <nav aria-label="Breadcrumb">
            <p aria-current="page" className="type-label text-faint-foreground">
              {t("breadcrumb")}
            </p>
          </nav>
          <h1 className="truncate type-h3 font-display">{t("title")}</h1>
        </div>
      </PageHeader>
      <PageBody className="pt-5.5">{body}</PageBody>
    </div>
  );
}

function Ready({
  overview,
  period,
  onPeriod,
  updating,
}: {
  overview: Overview;
  period: OverviewPeriod;
  onPeriod: (period: OverviewPeriod) => void;
  updating: boolean;
}) {
  const t = useTranslations("controlPlane.overview");
  const population = overview.metrics.filter((metric) => metric.group === "population");
  const showPopulation = population.some((metric) => metric.state !== "restricted");
  const showHealth = overview.health.state === "available";
  const statuses = overview.health.checks.map((check) => check.status);
  const banner = statuses.includes("unavailable")
    ? "provider"
    : statuses.includes("degraded")
      ? "degraded"
      : undefined;

  return (
    <div data-overview-state="ready" className="flex flex-col gap-4">
      {banner !== undefined && (
        <Banner icon={AlertTriangleIcon} tone="warning" title={t(`banner.${banner}.title`)}>
          {t(`banner.${banner}.body`)}
        </Banner>
      )}
      <PeriodPicker period={period} onPeriod={onPeriod} updating={updating} />
      <div className="grid items-start gap-4 lg:grid-cols-5">
        {showPopulation && (
          <div className="lg:col-span-3">
            <Population overview={overview} metrics={population} updating={updating} />
          </div>
        )}
        <div
          className={cn("flex flex-col gap-4", showPopulation ? "lg:col-span-2" : "lg:col-span-3")}
        >
          <Reviews overview={overview} updating={updating} />
          {showHealth && <Health checks={overview.health.checks} />}
        </div>
      </div>
      {(!showPopulation || !showHealth) && (
        <Banner icon={InfoIcon} tone="neutral">
          {t("restricted")}
        </Banner>
      )}
    </div>
  );
}

function PeriodPicker({
  period,
  onPeriod,
  updating,
}: {
  period: OverviewPeriod;
  onPeriod: (period: OverviewPeriod) => void;
  updating: boolean;
}) {
  const t = useTranslations("controlPlane.overview.period");
  const overviewT = useTranslations("controlPlane.overview");
  return (
    <fieldset className="flex flex-wrap items-center gap-2" data-overview-period={period}>
      <legend className="sr-only">{t("label")}</legend>
      <span aria-hidden className="type-label text-faint-foreground">
        {t("label")}
      </span>
      <div className="flex gap-1 rounded-xl border bg-surface p-1">
        {OVERVIEW_PERIODS.map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={key === period ? "secondary" : "ghost"}
            aria-pressed={key === period}
            onClick={() => onPeriod(key)}
            className="h-10 min-w-16"
          >
            {t(`options.${key}`)}
          </Button>
        ))}
      </div>
      <span role="status" className="type-caption text-faint-foreground">
        {updating ? overviewT("updating") : ""}
      </span>
    </fieldset>
  );
}

function Card({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section
      aria-labelledby={`overview-${id}`}
      data-overview-card={id}
      className="flex flex-col gap-3 rounded-3xl border bg-surface p-5"
    >
      <h2 id={`overview-${id}`} className="type-title font-display">
        {title}
      </h2>
      {children}
    </section>
  );
}

const POPULATION_STATS = [
  "accounts",
  "fighter_profiles",
  "coach_profiles",
  "gyms",
  "sponsor_organizations",
  "operators",
] as const;

type PopulationId = (typeof POPULATION_STATS)[number];

function Population({
  overview,
  metrics,
  updating,
}: {
  overview: Overview;
  metrics: OverviewMetric[];
  updating: boolean;
}) {
  const t = useTranslations("controlPlane.overview");
  const format = useFormatter();
  return (
    <Card id="population" title={t("population.title")}>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {POPULATION_STATS.map((id) => {
          const metric = metrics.find((candidate) => candidate.id === id);
          return metric ? (
            <Stat key={id} id={id} metric={metric} overview={overview} updating={updating} />
          ) : null;
        })}
      </dl>
      <p className="type-caption text-faint-foreground">
        {t("population.asOf", { time: format.dateTime(new Date(overview.as_of), "dateTime") })}
      </p>
    </Card>
  );
}

function Stat({
  id,
  metric,
  overview,
  updating,
}: {
  id: PopulationId;
  metric: OverviewMetric;
  overview: Overview;
  updating: boolean;
}) {
  const t = useTranslations("controlPlane.overview");
  const format = useFormatter();
  const range = t(`period.inPeriod.${overview.period.key}`);

  const caption = (): string => {
    const b = metric.breakdown;
    switch (id) {
      case "accounts":
        return t("population.stats.accounts.caption", {
          notFinished: sum(b, ["in_progress", "not_started"]),
        });
      case "gyms":
        return t("population.stats.gyms.caption", { drafts: countOf(b, "draft") ?? 0 });
      case "sponsor_organizations":
        return t("population.stats.sponsor_organizations.caption", {
          suspended: countOf(b, "suspended") ?? 0,
        });
      default:
        return t(`population.stats.${id}.caption`);
    }
  };

  const periodLine = (): string | undefined => {
    const [first] = metric.period_counts;
    if (first === undefined || id === "operators") return undefined;
    return t(`population.stats.${id}.period`, { count: first.value, range });
  };

  return (
    <div
      data-overview-metric={id}
      data-state={metric.state}
      data-value={metric.value ?? undefined}
      className="flex flex-col gap-1"
    >
      <dt className="type-label text-faint-foreground uppercase">
        {t(`population.stats.${id}.label`)}
      </dt>
      <dd className="flex flex-col gap-0.5">
        {metric.state === "available" && metric.value !== null ? (
          <>
            <span className="type-h3 font-display">{format.number(metric.value, "integer")}</span>
            <span className="type-caption text-muted-foreground">{caption()}</span>
            {periodLine() !== undefined && (
              <span
                aria-busy={updating || undefined}
                className={cn("type-caption text-faint-foreground", updating && "opacity-60")}
              >
                {periodLine()}
              </span>
            )}
          </>
        ) : metric.state === "restricted" ? (
          <>
            <span className="type-h3 font-display text-faint-foreground">
              <span aria-hidden>{t("unavailable")}</span>
              <span className="sr-only">{t("population.restricted")}</span>
            </span>
            <span className="type-caption text-muted-foreground">
              {t("population.restrictedHint")}
            </span>
          </>
        ) : (
          <span className="type-h3 font-display text-faint-foreground">{t("unavailable")}</span>
        )}
      </dd>
    </div>
  );
}

function sum(list: readonly { key: string; value: number }[], keys: string[]): number {
  return keys.reduce((total, key) => total + (countOf(list, key) ?? 0), 0);
}

function Reviews({ overview, updating }: { overview: Overview; updating: boolean }) {
  const t = useTranslations("controlPlane.overview");
  const format = useFormatter();
  const applications = metricOf(overview, "sponsor_applications_waiting");
  const range = t(`period.inPeriod.${overview.period.key}`);
  const nothing = applications?.state === "available" && applications.value === 0;

  return (
    <Card id="reviews" title={t("reviews.title")}>
      <ul className="flex flex-col divide-y">
        {applications?.state === "available" && applications.value !== null ? (
          <li
            data-overview-metric="sponsor_applications_waiting"
            data-state="available"
            data-value={applications.value}
            className="flex flex-col gap-0.5 py-2.5"
          >
            <span className="flex items-baseline justify-between gap-3">
              <span className="type-body-sm font-bold">
                {t("reviews.sponsorApplications.label")}
              </span>
              <span className="type-title font-display">
                {format.number(applications.value, "integer")}
              </span>
            </span>
            <span className="type-caption text-muted-foreground">
              {t("reviews.sponsorApplications.caption")}
            </span>
            <span
              aria-busy={updating || undefined}
              className={cn("type-caption text-faint-foreground", updating && "opacity-60")}
            >
              {t("reviews.sponsorApplications.period", {
                range,
                submitted: countOf(applications.period_counts, "first_submitted") ?? 0,
                approved: countOf(applications.period_counts, "approved") ?? 0,
                rejected: countOf(applications.period_counts, "rejected") ?? 0,
              })}
            </span>
          </li>
        ) : (
          <li
            data-overview-metric="sponsor_applications_waiting"
            data-state={applications?.state ?? "unavailable"}
            className="flex items-baseline justify-between gap-3 py-2.5"
          >
            <span className="type-body-sm font-bold">{t("reviews.sponsorApplications.label")}</span>
            <span className="type-caption text-muted-foreground">
              {applications?.state === "restricted" ? t("population.restricted") : t("unavailable")}
            </span>
          </li>
        )}
        <li
          data-overview-metric="gym_verifications_waiting"
          data-state="unavailable"
          className="flex flex-col gap-0.5 py-2.5"
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className="type-body-sm font-bold">{t("reviews.gymVerifications.label")}</span>
            <span aria-hidden className="type-title font-display text-faint-foreground">
              {t("unavailable")}
            </span>
          </span>
          <span className="type-caption text-muted-foreground">
            {t("reviews.gymVerifications.unavailable")}
          </span>
        </li>
      </ul>
      <p className="type-caption text-faint-foreground">{t("reviews.moderation")}</p>
      {nothing && <p className="type-caption text-muted-foreground">{t("reviews.nothing")}</p>}
    </Card>
  );
}

const CHIP: Record<OverviewCheck["status"], "success" | "warning" | "destructive" | "neutral"> = {
  healthy: "success",
  degraded: "warning",
  unavailable: "destructive",
  unknown: "neutral",
  no_telemetry: "neutral",
};

function Health({ checks }: { checks: OverviewCheck[] }) {
  const t = useTranslations("controlPlane.overview.health");
  const format = useFormatter();

  const detail = (check: OverviewCheck): string | undefined => {
    if (check.id === "background_jobs") {
      return t("jobs", {
        waiting: format.number(countOf(check.counts, "waiting") ?? 0, "integer"),
        discarded: format.number(countOf(check.counts, "discarded_24h") ?? 0, "integer"),
      });
    }
    if (check.id === "payments_webhooks") {
      return check.last_event_at === null
        ? t("noWebhook")
        : t("lastWebhook", { time: format.dateTime(new Date(check.last_event_at), "dateTime") });
    }
    return undefined;
  };

  return (
    <Card id="health" title={t("title")}>
      <ul className="flex flex-col divide-y">
        {checks.map((check) => (
          <li
            key={check.id}
            data-overview-check={check.id}
            data-status={check.status}
            className="flex min-h-10 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
          >
            <span className="flex flex-col">
              <span className="type-body-sm">{t(`checks.${check.id}`)}</span>
              {detail(check) !== undefined && (
                <span className="type-caption text-faint-foreground">{detail(check)}</span>
              )}
            </span>
            <Badge variant={CHIP[check.status]} className="uppercase">
              {t(`status.${check.status}`)}
            </Badge>
          </li>
        ))}
      </ul>
      <p className="type-caption text-faint-foreground">{t("note")}</p>
    </Card>
  );
}

function Banner({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: LucideIcon;
  tone: "warning" | "neutral";
  title?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2.5 rounded-xl border px-4 py-3 type-body-sm",
        tone === "warning"
          ? "border-warning-subtle bg-warning-subtle text-warning-subtle-foreground"
          : "bg-surface text-muted-foreground",
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>
        {title ? <span className="font-bold">{title} </span> : null}
        {children}
      </p>
    </div>
  );
}
