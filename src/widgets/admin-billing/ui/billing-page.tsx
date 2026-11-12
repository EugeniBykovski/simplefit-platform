"use client";

import { InfoIcon, RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import {
  isRefusal,
  useBillingOverview,
  useForgetBillingOnRefusal,
  type BillingMode,
  type BillingOverview,
} from "@/entities/admin-billing";
import { grants, useOperator } from "@/entities/operator";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";

import {
  Count,
  isKnown,
  Loading,
  ModeBadge,
  ModeSwitch,
  Restricted,
  Unreachable,
  useMoney,
  useWhen,
} from "./parts";
import { ReconciliationSection } from "./reconciliation-section";
import { SubscriptionsSection } from "./subscriptions-section";

const PROVIDER_STATUSES = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
] as const;
const INVOICE_STATUSES = ["draft", "open", "paid", "uncollectible", "void"] as const;
const REFUND_STATUSES = [
  "requested",
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
] as const;
const METRICS = [
  "mrr",
  "arr",
  "recognized_revenue",
  "net_revenue",
  "churn",
  "ltv",
  "forecast",
  "fx_total",
] as const;

/**
 * AD13, billing visibility (SF-127; Claude Design `AdminSubscriptions`, the MVP
 * "deferred" state, now connected): the four money flows AD13 names, kept apart, with
 * the only one that has a domain (gyms paying SimpleFit) read from the backend. Every
 * figure is of one Stripe mode, the one the backend says it read; switching the mode
 * re-reads, it never filters an answer. Counts and per-currency sums only; what has no
 * approved definition is listed as not reported. No refund, cancellation or price
 * action exists. With `billing.reconciliation.read`, the reconciliation section.
 */
export function BillingPage() {
  const t = useTranslations("controlPlane.billing");
  const operator = useOperator().data;
  const [chosen, setChosen] = useState<BillingMode | undefined>(undefined);
  // Nothing is read until the backend's permission list is known.
  const known = operator !== undefined;
  const canRead = !!operator && grants(operator, "billing.read");
  const canReconcile = !!operator && grants(operator, "billing.reconciliation.read");
  const overview = useBillingOverview(chosen, canRead);
  useForgetBillingOnRefusal(overview.error);
  const refused = known && (!canRead || isRefusal(overview.error));
  const mode = chosen ?? overview.data?.mode;

  let body: ReactNode = null;
  if (!known) {
    body = <Loading label={t("loading")} tall />;
  } else if (refused) {
    body = canReconcile ? null : <Restricted />;
  } else if (overview.data === undefined && overview.isError) {
    body = <Unreachable onRetry={() => void overview.refetch()} />;
  } else if (overview.data === undefined) {
    body = <Loading label={t("loading")} tall />;
  } else {
    body = (
      <Overview
        overview={overview.data}
        stale={overview.isError}
        refreshing={overview.isFetching}
        onRefresh={() => void overview.refetch()}
      />
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader className="flex-wrap gap-y-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <nav aria-label="Breadcrumb">
            <p className="type-label text-faint-foreground">{t("breadcrumb")}</p>
          </nav>
          <h1 className="truncate type-h3 font-display">{t("title")}</h1>
        </div>
        {known && (!refused || canReconcile) && <ModeSwitch mode={mode} onChange={setChosen} />}
      </PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">
        <Flows />
        {body}
        {!refused && mode && overview.data && <SubscriptionsSection key={mode} mode={mode} />}
        {canReconcile && (refused || mode) && (
          // With billing access, wait for the mode the overview read; without it, the
          // reconciliation answers with the configured mode itself.
          <ReconciliationSection key={chosen ?? "configured"} mode={refused ? chosen : mode} />
        )}
        <p className="type-caption text-muted-foreground">{t("detail.noActions")}</p>
      </PageBody>
    </div>
  );
}

function Overview({
  overview,
  stale,
  refreshing,
  onRefresh,
}: {
  overview: BillingOverview;
  stale: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations("controlPlane.billing");
  const o = useTranslations("controlPlane.billing.overview");
  const statuses = useTranslations("controlPlane.billing.subscriptionStatus");
  const provider = useTranslations("controlPlane.billing.providerStatus");
  const invoices = useTranslations("controlPlane.billing.invoiceStatus");
  const issues = useTranslations("controlPlane.billing.issue");
  const refunds = useTranslations("controlPlane.billing.refundStatus");
  const metrics = useTranslations("controlPlane.billing.overview.metrics");
  const money = useMoney();
  const when = useWhen();
  const modeName = t(`mode.${overview.mode}`);
  const unrecorded = Object.values(overview.unrecorded_subscriptions).reduce((a, b) => a + b, 0);

  return (
    <section
      aria-labelledby="billing-overview"
      data-billing-state="ready"
      className="flex min-w-0 flex-col gap-5 rounded-3xl border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="billing-overview" className="type-title font-display">
          {o("title")}
        </h2>
        <ModeBadge mode={overview.mode} />
        <span className="flex-1" />
        <span className="type-caption text-faint-foreground">
          {t("observedAt", { time: when(overview.observed_at) })}
        </span>
        <Button variant="quiet" size="sm" onClick={onRefresh} disabled={refreshing}>
          <RefreshCwIcon aria-hidden className="size-4" />
          {t("refresh")}
        </Button>
      </div>
      {stale && (
        <p role="alert" className="type-body-sm text-muted-foreground">
          {t("stale", { time: when(overview.observed_at) })}
        </p>
      )}
      <div className="flex flex-col gap-1 type-body-sm text-muted-foreground">
        <p>
          {t("mode.note", { mode: modeName })}
          {overview.configured_mode !== overview.mode &&
            ` ${t("mode.configured", { mode: t(`mode.${overview.configured_mode}`) })}`}
        </p>
        <p data-billing-integration={overview.integration}>
          {t(`integration.${overview.integration}`)}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="type-label text-faint-foreground">{o("caption", { mode: modeName })}</h3>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {(
            [
              "active",
              "pending_activation",
              "cancellation_scheduled",
              "cancelled",
              "expired",
            ] as const
          ).map((status) => (
            <Count key={status} label={statuses(status)} value={overview.subscriptions[status]} />
          ))}
        </dl>
        <p className="type-caption text-muted-foreground">
          {o("unrecorded", { count: unrecorded })}
        </p>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="type-body font-extrabold">{o("issuesTitle")}</h3>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(["payment_failed", "action_required", "uncollectible"] as const).map((issue) => (
              <Count key={issue} label={issues(issue)} value={overview.payment_issues[issue]} />
            ))}
          </dl>
          <p className="type-caption text-muted-foreground">{o("issuesNote")}</p>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="type-body font-extrabold">{o("collectedTitle")}</h3>
          {overview.collected.currencies.length === 0 ? (
            <p className="type-body-sm text-muted-foreground" data-billing-collected="empty">
              {o("collectedEmpty")}
            </p>
          ) : (
            <ul
              className="flex flex-col divide-y rounded-2xl border"
              data-billing-collected="ready"
            >
              {overview.collected.currencies.map((row) => (
                <li
                  key={row.currency}
                  data-currency={row.currency}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3.5"
                >
                  <span className="min-w-0 type-h3 font-display tabular-nums">
                    {money(row.amount_paid, row.amount_paid_minor, row.currency)}
                  </span>
                  <span className="type-caption text-muted-foreground">
                    {o("invoiceCount", { count: row.invoice_count })} ·{" "}
                    {o("refunded", {
                      amount: money(row.amount_refunded, row.amount_refunded_minor, row.currency),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="type-caption text-muted-foreground">
            {o("collectedNote", {
              from: when(overview.collected.period_start),
              to: when(overview.collected.period_end),
            })}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-3">
        <Breakdown
          title={o("providerTitle")}
          note={o("providerCaption")}
          rows={PROVIDER_STATUSES.map((key) => [provider(key), overview.provider_statuses[key]])}
        />
        <Breakdown
          title={o("invoicesTitle")}
          note={o("invoicesCaption")}
          rows={INVOICE_STATUSES.map((key) => [invoices(key), overview.invoices[key]])}
        />
        <Breakdown
          title={o("refundsTitle")}
          rows={REFUND_STATUSES.map((key) => [refunds(key), overview.refunds[key]])}
        >
          <h4 className="type-label text-faint-foreground">{o("disputesTitle")}</h4>
          {overview.disputes.length === 0 ? (
            <p className="type-caption text-muted-foreground">{o("disputesEmpty")}</p>
          ) : (
            <dl className="flex flex-col gap-1">
              {overview.disputes.map((row) => (
                <div key={row.status} className="flex justify-between gap-3 type-body-sm">
                  <dt className="font-mono text-muted-foreground">{row.status}</dt>
                  <dd className="tabular-nums">{row.count}</dd>
                </div>
              ))}
            </dl>
          )}
        </Breakdown>
      </div>

      <p className="type-caption text-faint-foreground">
        {o("freshness", {
          synced: when(overview.last_synced_at),
          webhook: when(overview.last_webhook_at),
        })}
      </p>

      <div
        className="flex flex-col gap-2 rounded-2xl border border-dashed p-3.5"
        data-billing-unavailable
      >
        <h3 className="type-body font-extrabold">{o("unavailableTitle")}</h3>
        <ul className="flex flex-wrap gap-2">
          {overview.unavailable.map((item) => (
            <li key={item.metric}>
              <Badge variant="outline">
                {isKnown(METRICS, item.metric) ? metrics(item.metric) : item.metric}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="type-caption text-muted-foreground">{o("unavailableNote")}</p>
      </div>
    </section>
  );
}

function Breakdown({
  title,
  note,
  rows,
  children,
}: {
  title: string;
  note?: string;
  rows: [string, number][];
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border p-3.5">
      <h3 className="type-body font-extrabold">{title}</h3>
      <dl className="flex flex-col gap-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 type-body-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {children}
      {note && <p className="type-caption text-faint-foreground">{note}</p>}
    </div>
  );
}

/** AD13's four money flows, never added together; only gym subscriptions is connected. */
function Flows() {
  const t = useTranslations("controlPlane.billing.flows");
  const flows = [
    { key: "saas", state: "connected" },
    { key: "member", state: "notConnected" },
    { key: "sponsor", state: "notConnected" },
    { key: "revenue", state: "notReported" },
  ] as const;

  return (
    <section aria-labelledby="billing-flows" className="flex flex-col gap-3">
      <h2 id="billing-flows" className="sr-only">
        {t("title")}
      </h2>
      <div className="flex items-start gap-2.5 rounded-2xl border bg-surface-elevated p-3.5 type-body-sm">
        <InfoIcon aria-hidden className="mt-0.5 size-4 flex-none text-highlight" />
        <p className="min-w-0">{t("note")}</p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {flows.map((flow) => (
          <li
            key={flow.key}
            data-billing-flow={flow.key}
            className="flex min-w-0 flex-col gap-2 rounded-3xl border bg-surface p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="min-w-0 type-title font-display">{t(`${flow.key}.title`)}</h3>
              <Badge
                variant={flow.state === "connected" ? "success" : "outline"}
                className="uppercase"
              >
                {t(flow.state)}
              </Badge>
            </div>
            <p className="type-body-sm text-muted-foreground">{t(`${flow.key}.body`)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
