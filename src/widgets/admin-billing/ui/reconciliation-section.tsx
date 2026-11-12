"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import {
  isRefusal,
  useBillingReconciliation,
  useForgetBillingOnRefusal,
  type BillingMode,
  type BillingReconciliation,
} from "@/entities/admin-billing";

import {
  Count,
  LoadError,
  Loading,
  ModeBadge,
  Pager,
  PROVIDER_VARIANT,
  StatusBadge,
  SUBSCRIPTION_VARIANT,
  useDiscrepancy,
  useWhen,
} from "./parts";

/**
 * Reconciliation of one Stripe mode (`billing.reconciliation.read`, recorded by the
 * backend): links by state from each one's last Stripe read, the webhook inbox, failed
 * events (type and outcome only) and discrepancies in keyset pages. There is no run and
 * nothing here syncs, replays or forces anything; "no discrepancy" is only ever said of
 * links that were read.
 */
export function ReconciliationSection({ mode }: { mode: BillingMode | undefined }) {
  const t = useTranslations("controlPlane.billing.reconciliation");
  const [cursors, setCursors] = useState<string[]>([]);
  const query = useBillingReconciliation(mode, cursors.at(-1), true);
  useForgetBillingOnRefusal(query.error);
  const answered = query.data?.mode;

  let body: ReactNode;
  if (isRefusal(query.error)) {
    body = <p className="type-body-sm text-muted-foreground">{t("noAccess")}</p>;
  } else if (query.isPending) {
    body = <Loading label={t("loading")} />;
  } else if (query.isError) {
    body = <LoadError onRetry={() => void query.refetch()} />;
  } else {
    body = (
      <Reconciliation
        reconciliation={query.data}
        page={cursors.length + 1}
        onPrevious={() => setCursors((stack) => stack.slice(0, -1))}
        onNext={(cursor) => setCursors((stack) => [...stack, cursor])}
      />
    );
  }

  return (
    <section
      aria-labelledby="billing-reconciliation"
      className="flex min-w-0 flex-col gap-4 rounded-3xl border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="billing-reconciliation" className="type-title font-display">
          {t("title")}
        </h2>
        {answered && <ModeBadge mode={answered} />}
      </div>
      <p className="type-body-sm text-muted-foreground">{t("note")}</p>
      {body}
    </section>
  );
}

function Reconciliation({
  reconciliation: r,
  page,
  onPrevious,
  onNext,
}: {
  reconciliation: BillingReconciliation;
  page: number;
  onPrevious: () => void;
  onNext: (cursor: string) => void;
}) {
  const t = useTranslations("controlPlane.billing.reconciliation");
  const b = useTranslations("controlPlane.billing");
  const when = useWhen();
  const discrepancy = useDiscrepancy();

  return (
    <div className="flex flex-col gap-5" data-reconciliation-state="ready">
      <div className="flex flex-col gap-2">
        <h3 className="type-label text-faint-foreground">
          {t("caption", { mode: b(`mode.${r.mode}`) })}
        </h3>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {(["linked", "in_sync", "stale", "mismatch", "not_linked"] as const).map((key) => (
            <Count key={key} label={b(`reconciliationCount.${key}`)} value={r.summary[key]} />
          ))}
        </dl>
        <p className="type-caption text-muted-foreground">
          {t("lastRead", {
            time: when(r.summary.last_synced_at),
            oldest: when(r.summary.oldest_synced_at),
          })}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="type-body font-extrabold">{t("webhooks")}</h3>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["received", "processed", "ignored", "failed"] as const).map((key) => (
            <Count key={key} label={b(`webhookStatus.${key}`)} value={r.webhooks.counts[key]} />
          ))}
        </dl>
        <p className="type-caption text-muted-foreground">
          {t("webhooksCaption", { time: when(r.webhooks.window_start) })} ·{" "}
          {t("backlog", { count: r.webhooks.backlog })} ·{" "}
          {t("lastWebhook", { time: when(r.webhooks.last_received_at) })}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="type-body font-extrabold">{t("failedTitle")}</h3>
        {r.webhooks.failed.length === 0 ? (
          <p className="type-body-sm text-muted-foreground">{t("failedEmpty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-140 text-left">
              <caption className="sr-only">{t("failedTitle")}</caption>
              <thead>
                <tr className="border-b type-label text-faint-foreground">
                  {(["type", "outcome", "attempts", "received"] as const).map((column) => (
                    <th key={column} scope="col" className="py-2 pe-3">
                      {t(`eventColumns.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {r.webhooks.failed.map((event) => (
                  <tr key={`${event.received_at}-${event.event_type}`} className="type-body-sm">
                    <td className="py-2 pe-3 font-mono">{event.event_type}</td>
                    <td className="py-2 pe-3 font-mono">{event.outcome ?? "—"}</td>
                    <td className="py-2 pe-3 tabular-nums">{event.attempts}</td>
                    <td className="py-2 pe-3 text-muted-foreground">{when(event.received_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="type-caption text-faint-foreground">{t("failedNote")}</p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="type-body font-extrabold">{t("discrepancies")}</h3>
        {r.discrepancies.length === 0 ? (
          <p className="type-body-sm text-muted-foreground" data-discrepancies="empty">
            {t("discrepanciesEmpty")}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left" data-discrepancies="ready">
                <caption className="sr-only">{t("discrepanciesCaption")}</caption>
                <thead>
                  <tr className="border-b type-label text-faint-foreground">
                    {(["gym", "discrepancy", "status", "stripe", "read"] as const).map((column) => (
                      <th key={column} scope="col" className="py-2 pe-3">
                        {t(`columns.${column}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {r.discrepancies.map((row) => (
                    <tr key={row.subscription_id} className="type-body-sm">
                      <td className="py-2 pe-3 font-extrabold">{row.gym.name ?? row.gym.id}</td>
                      <td className="py-2 pe-3">{discrepancy(row.discrepancy)}</td>
                      <td className="py-2 pe-3">
                        <StatusBadge
                          variant={SUBSCRIPTION_VARIANT[row.subscription_status] ?? "neutral"}
                        >
                          {b(`subscriptionStatus.${row.subscription_status}`)}
                        </StatusBadge>
                      </td>
                      <td className="py-2 pe-3">
                        <StatusBadge variant={PROVIDER_VARIANT[row.provider_status] ?? "neutral"}>
                          {b(`providerStatus.${row.provider_status}`)}
                        </StatusBadge>
                      </td>
                      <td className="py-2 pe-3 text-muted-foreground">{when(row.synced_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              label={t("discrepancies")}
              page={page}
              next={r.next_cursor}
              onPrevious={onPrevious}
              onNext={onNext}
            />
          </div>
        )}
      </div>
    </div>
  );
}
