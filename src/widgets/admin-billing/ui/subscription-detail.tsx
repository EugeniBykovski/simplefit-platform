"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import {
  isRefusal,
  useBillingSubscription,
  useForgetBillingOnRefusal,
  type BillingSubscriptionDetail,
} from "@/entities/admin-billing";
import { isApiError } from "@/shared/api/http/api-error";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/shared/ui/sheet";

import {
  INVOICE_VARIANT,
  isKnown,
  LoadError,
  Loading,
  ModeBadge,
  PROVIDER_VARIANT,
  RECONCILIATION_VARIANT,
  StatusBadge,
  SUBSCRIPTION_VARIANT,
  useDiscrepancy,
  useMoney,
  useWhen,
} from "./parts";

const REFUND_STATUSES = [
  "requested",
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
] as const;

/**
 * One gym subscription (read and recorded by the backend as `billing.subscription_viewed`):
 * its lifecycle, the plan version and price it agreed to, paid periods from verified
 * evidence, its newest Stripe invoices with refunds and disputes, and checkout states.
 * Nothing here acts on it.
 */
export function SubscriptionDetail({
  id,
  onClose,
  onClosed,
}: {
  id: string | null;
  onClose: () => void;
  onClosed: () => void;
}) {
  const t = useTranslations("controlPlane.billing.detail");
  const b = useTranslations("controlPlane.billing");
  const query = useBillingSubscription(id);
  useForgetBillingOnRefusal(query.error);

  let body: ReactNode;
  if (isApiError(query.error) && query.error.status === 404) {
    body = <p className="type-body-sm text-muted-foreground">{t("notFound")}</p>;
  } else if (isRefusal(query.error)) {
    body = <p className="type-body-sm text-muted-foreground">{b("noAccess")}</p>;
  } else if (query.isPending) {
    body = <Loading label={t("loading")} />;
  } else if (query.isError) {
    body = <LoadError onRetry={() => void query.refetch()} />;
  } else {
    body = <Detail subscription={query.data} />;
  }

  return (
    <Sheet open={id !== null} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        closeLabel={t("close")}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosed();
        }}
        className="w-full overflow-y-auto p-5 sm:max-w-xl data-[side=right]:sm:max-w-xl"
      >
        <SheetHeader className="p-0">
          <SheetTitle className="type-h3 font-display">
            {query.data?.gym.name ?? t("title")}
          </SheetTitle>
          <SheetDescription>{t("title")}</SheetDescription>
        </SheetHeader>
        {body}
      </SheetContent>
    </Sheet>
  );
}

function Detail({ subscription: s }: { subscription: BillingSubscriptionDetail }) {
  const t = useTranslations("controlPlane.billing.detail");
  const b = useTranslations("controlPlane.billing");
  const money = useMoney();
  const when = useWhen();
  const discrepancy = useDiscrepancy();

  const rows: [string, ReactNode][] = [
    [t("requested"), when(s.requested_at)],
    [t("activated"), when(s.activated_at)],
    [
      t("period"),
      s.current_period_start
        ? `${when(s.current_period_start)} – ${when(s.current_period_end)}`
        : when(null),
    ],
  ];
  if (s.cancellation_effective_at)
    rows.push([t("cancellationEffective"), when(s.cancellation_effective_at)]);
  if (s.ended_at) rows.push([t("ended"), when(s.ended_at)]);
  if (s.cancel_reason) rows.push([t("cancelReason"), b(`cancelReason.${s.cancel_reason}`)]);

  return (
    <div className="flex flex-col gap-5" data-billing-detail={s.id}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge variant={SUBSCRIPTION_VARIANT[s.status] ?? "neutral"}>
          {b(`subscriptionStatus.${s.status}`)}
        </StatusBadge>
        {s.environment === "none" ? (
          <StatusBadge variant="outline">{b("environment.none")}</StatusBadge>
        ) : (
          <ModeBadge mode={s.environment} />
        )}
        <StatusBadge variant={RECONCILIATION_VARIANT[s.reconciliation.state] ?? "neutral"}>
          {b(`reconciliationState.${s.reconciliation.state}`)}
        </StatusBadge>
      </div>
      {s.reconciliation.discrepancy && (
        <p className="type-body-sm" role="note">
          {discrepancy(s.reconciliation.discrepancy)}
        </p>
      )}

      <Block title={t("lifecycle")}>
        <Rows rows={rows} />
      </Block>

      <Block title={t("atStripe")}>
        {s.provider_status ? (
          <Rows
            rows={[
              [
                t("atStripe"),
                <StatusBadge key="p" variant={PROVIDER_VARIANT[s.provider_status] ?? "neutral"}>
                  {b(`providerStatus.${s.provider_status}`)}
                </StatusBadge>,
              ],
              [
                t("stripePeriod"),
                s.provider_period_start
                  ? `${when(s.provider_period_start)} – ${when(s.provider_period_end)}`
                  : when(null),
              ],
              ...(s.cancel_at_period_end
                ? [[t("cancelAtPeriodEnd"), "✓"] as [string, ReactNode]]
                : []),
            ]}
          />
        ) : (
          <p className="type-body-sm text-muted-foreground">{b("environment.none")}</p>
        )}
      </Block>

      <Block title={t("agreed")}>
        <Rows
          rows={[
            [
              s.plan.key,
              `${s.plan.name} · v${s.plan.version} · ${b(`versionStatus.${s.plan.version_status}`)}`,
            ],
            [
              b(`interval.${s.price.interval}`),
              money(s.price.amount, s.price.amount_minor, s.price.currency),
            ],
          ]}
        />
        <p className="type-caption text-faint-foreground">{t("agreedNote")}</p>
      </Block>

      <Block title={t("periods")}>
        {s.periods.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">{t("periodsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {s.periods.map((p) => (
              <li key={p.period_start} className="type-body-sm">
                {b(`periodSource.${p.source}`)}: {when(p.period_start)} – {when(p.period_end)}
              </li>
            ))}
          </ul>
        )}
        <p className="type-caption text-faint-foreground">{t("periodsNote")}</p>
      </Block>

      <Block title={t("invoices")}>
        {s.invoices.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">{t("invoicesEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-2xl border">
            {s.invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-col gap-1.5 p-3.5"
                data-invoice-status={invoice.status}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold">
                    {invoice.number
                      ? t("invoiceNumber", { number: invoice.number })
                      : t("invoiceDraft")}
                  </span>
                  <StatusBadge variant={INVOICE_VARIANT[invoice.status] ?? "neutral"}>
                    {b(`invoiceStatus.${invoice.status}`)}
                  </StatusBadge>
                  {invoice.issue && (
                    <StatusBadge
                      variant={invoice.issue === "uncollectible" ? "destructive" : "warning"}
                    >
                      {b(`issue.${invoice.issue}`)}
                    </StatusBadge>
                  )}
                  {invoice.disputed && <StatusBadge variant="warning">{t("disputed")}</StatusBadge>}
                </div>
                <p className="type-body-sm tabular-nums">
                  {money(invoice.total, invoice.total_minor, invoice.currency)}
                  {invoice.amount_refunded_minor > 0 &&
                    ` · ${b("overview.refunded", {
                      amount: money(
                        invoice.amount_refunded,
                        invoice.amount_refunded_minor,
                        invoice.currency,
                      ),
                    })}`}
                </p>
                <p className="type-caption text-faint-foreground">
                  {invoice.paid_at
                    ? t("paidAt", { time: when(invoice.paid_at) })
                    : t("issuedAt", { time: when(invoice.issued_at) })}
                  {" · "}
                  {t("attempts", { count: invoice.attempt_count })}
                  {invoice.next_payment_attempt_at &&
                    ` · ${t("nextAttempt", { time: when(invoice.next_payment_attempt_at) })}`}
                </p>
                {invoice.refunds.length > 0 && (
                  <ul className="flex flex-col gap-0.5 type-caption">
                    {invoice.refunds.map((r) => (
                      <li key={`${r.created_at}-${r.amount_minor}`}>
                        {t("refunds")}: {money(r.amount, r.amount_minor, r.currency)} ·{" "}
                        {isKnown(REFUND_STATUSES, r.status)
                          ? b(`refundStatus.${r.status}`)
                          : r.status}{" "}
                        · {b(`refundOrigin.${r.origin}`)}
                      </li>
                    ))}
                  </ul>
                )}
                {invoice.disputes.length > 0 && (
                  <ul className="flex flex-col gap-0.5 type-caption">
                    {invoice.disputes.map((d) => (
                      <li key={`${d.created_at}-${d.amount_minor}`}>
                        {t("disputes")}: {money(d.amount, d.amount_minor, d.currency)} ·{" "}
                        <span className="font-mono">{d.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title={t("checkouts")}>
        {s.checkouts.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">{t("checkoutsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {s.checkouts.map((c) => (
              <li key={c.created_at} className="type-body-sm">
                {t("checkoutLine", {
                  mode: b(`environment.${c.mode}`),
                  status: b(`checkoutStatus.${c.status}`),
                  time: when(c.created_at),
                })}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <p className="type-caption text-muted-foreground">{t("noActions")}</p>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-body font-extrabold">{title}</h3>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="flex flex-col gap-1.5">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 type-body-sm">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 text-end">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
