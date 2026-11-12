"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, type ReactNode } from "react";

import {
  SUBSCRIPTION_STATUSES,
  isRefusal,
  useBillingSubscriptions,
  useForgetBillingOnRefusal,
  type BillingEnvironment,
  type BillingMode,
  type SubscriptionFilters,
} from "@/entities/admin-billing";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

import {
  LoadError,
  Loading,
  Pager,
  PROVIDER_VARIANT,
  RECONCILIATION_VARIANT,
  StatusBadge,
  SUBSCRIPTION_VARIANT,
  useMoney,
  useWhen,
} from "./parts";
import { SubscriptionDetail } from "./subscription-detail";

const ANY = "any";
const PLAN_KEY = /^[a-z][a-z0-9_]{1,39}$/;

/**
 * Gym subscriptions of the page's mode (or, apart, those with no provider record),
 * newest request first, in backend keyset pages. Filters are the backend's; a plan key
 * is only sent once it is a valid key. A row opens the subscription's detail.
 */
export function SubscriptionsSection({ mode }: { mode: BillingMode }) {
  const t = useTranslations("controlPlane.billing.subscriptions");
  const b = useTranslations("controlPlane.billing");
  const [unrecorded, setUnrecorded] = useState(false);
  const [filters, setFilters] = useState<SubscriptionFilters>({});
  const [planDraft, setPlanDraft] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  // The row button that opened the detail gets focus back when it closes.
  const opener = useRef<HTMLButtonElement | null>(null);
  const environment: BillingEnvironment = unrecorded ? "none" : mode;
  const page = useBillingSubscriptions(environment, filters, cursors.at(-1));
  useForgetBillingOnRefusal(page.error);
  const money = useMoney();
  const when = useWhen();

  const reset = (next: SubscriptionFilters) => {
    setFilters(next);
    setCursors([]);
  };

  let body: ReactNode;
  if (isRefusal(page.error)) {
    body = <p className="type-body-sm text-muted-foreground">{b("noAccess")}</p>;
  } else if (page.isPending) {
    body = <Loading label={t("loading")} />;
  } else if (page.isError) {
    body = <LoadError onRetry={() => void page.refetch()} />;
  } else if (page.data.subscriptions.length === 0) {
    body = (
      <p
        role="status"
        data-subscriptions-state="empty"
        className="type-body-sm text-muted-foreground"
      >
        {t("empty")}
      </p>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-200 text-left" data-subscriptions-state="ready">
            <caption className="sr-only">{t("caption")}</caption>
            <thead>
              <tr className="border-b type-label text-faint-foreground">
                {(
                  [
                    "gym",
                    "plan",
                    "price",
                    "status",
                    "stripe",
                    "reconciliation",
                    "requested",
                  ] as const
                ).map((column) => (
                  <th key={column} scope="col" className="py-2 pe-3">
                    {t(`columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {page.data.subscriptions.map((s) => (
                <tr key={s.id} className="type-body-sm">
                  <td className="py-2.5 pe-3">
                    <button
                      type="button"
                      className="text-start font-extrabold text-highlight underline-offset-4 hover:underline focus-visible:underline"
                      aria-label={t("open", { gym: s.gym.name ?? s.gym.id })}
                      onClick={(event) => {
                        opener.current = event.currentTarget;
                        setOpen(s.id);
                      }}
                    >
                      {s.gym.name ?? s.gym.id}
                    </button>
                  </td>
                  <td className="py-2.5 pe-3">
                    {t("planVersion", { name: s.plan.name, version: s.plan.version })}
                    <span className="block type-caption text-faint-foreground">{s.plan.key}</span>
                  </td>
                  <td className="py-2.5 pe-3 tabular-nums">
                    {money(s.price.amount, s.price.amount_minor, s.price.currency)}{" "}
                    <span className="type-caption text-faint-foreground">
                      {b(`interval.${s.price.interval}`)}
                    </span>
                  </td>
                  <td className="py-2.5 pe-3">
                    <StatusBadge variant={SUBSCRIPTION_VARIANT[s.status] ?? "neutral"}>
                      {b(`subscriptionStatus.${s.status}`)}
                    </StatusBadge>
                  </td>
                  <td className="py-2.5 pe-3">
                    {s.provider_status ? (
                      <StatusBadge variant={PROVIDER_VARIANT[s.provider_status] ?? "neutral"}>
                        {b(`providerStatus.${s.provider_status}`)}
                      </StatusBadge>
                    ) : (
                      <span aria-label={b("environment.none")}>{t("noStripe")}</span>
                    )}
                  </td>
                  <td className="py-2.5 pe-3">
                    <StatusBadge
                      variant={RECONCILIATION_VARIANT[s.reconciliation.state] ?? "neutral"}
                    >
                      {b(`reconciliationState.${s.reconciliation.state}`)}
                    </StatusBadge>
                  </td>
                  <td className="py-2.5 pe-3 text-muted-foreground">{when(s.requested_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager
          label={t("pages.label")}
          page={cursors.length + 1}
          next={page.data.next_cursor}
          onPrevious={() => setCursors((stack) => stack.slice(0, -1))}
          onNext={(cursor) => setCursors((stack) => [...stack, cursor])}
        />
      </div>
    );
  }

  return (
    <section
      aria-labelledby="billing-subscriptions"
      className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-5"
    >
      <h2 id="billing-subscriptions" className="type-title font-display">
        {t("title")}
      </h2>
      <form
        role="search"
        aria-label={t("filters.label")}
        onSubmit={(event) => {
          event.preventDefault();
          const key = planDraft.trim();
          reset({ ...filters, plan_key: PLAN_KEY.test(key) ? key : undefined });
        }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="billing-filter-environment">{t("filters.environment")}</Label>
          <Select
            value={unrecorded ? "none" : "mode"}
            onValueChange={(value) => {
              setUnrecorded(value === "none");
              setCursors([]);
            }}
          >
            <SelectTrigger id="billing-filter-environment" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mode">{b(`environment.${mode}`)}</SelectItem>
              <SelectItem value="none">{b("environment.none")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="billing-filter-status">{t("filters.status")}</Label>
          <Select
            value={filters.status ?? ANY}
            onValueChange={(value) =>
              reset({
                ...filters,
                status: value === ANY ? undefined : (value as SubscriptionFilters["status"]),
              })
            }
          >
            <SelectTrigger id="billing-filter-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("filters.any")}</SelectItem>
              {SUBSCRIPTION_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {b(`subscriptionStatus.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="billing-filter-plan">{t("filters.plan")}</Label>
          <Input
            id="billing-filter-plan"
            value={planDraft}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setPlanDraft(event.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="quiet">
            {t("filters.apply")}
          </Button>
        </div>
      </form>
      {body}
      <SubscriptionDetail
        id={open}
        onClose={() => setOpen(null)}
        onClosed={() => opener.current?.focus()}
      />
    </section>
  );
}
