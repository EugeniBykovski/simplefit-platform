"use client";

import { ArrowLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import {
  isRefusal,
  useBillingPlan,
  useBillingPlans,
  useForgetBillingOnRefusal,
  type BillingPlan,
} from "@/entities/admin-billing";
import { grants, useOperator } from "@/entities/operator";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";

import { LoadError, Loading, Restricted, StatusBadge, useMoney, useWhen } from "./parts";

const VERSION_VARIANT = {
  draft: "outline",
  archived: "outline",
  published: "success",
  superseded: "neutral",
  retired: "outline",
} as const;

/**
 * AR4 adapted (SF-127; Claude Design `AdminPricing`, FUTURE, built read-only on the
 * SF-101 catalog): every SaaS plan with every version as recorded, its prices per
 * currency and interval and where each is mapped to a Stripe price. No new plan, price
 * edit, publish, promo or pending change: publication stays under an approval outside
 * the Control Plane.
 */
export function PlansPage() {
  const t = useTranslations("controlPlane.billing.plans");
  const operator = useOperator().data;
  const known = operator !== undefined;
  const canRead = !!operator && grants(operator, "billing.read");
  const plans = useBillingPlans(canRead);
  useForgetBillingOnRefusal(plans.error);

  let body: ReactNode;
  if (!known) {
    body = <Loading label={t("loading")} tall />;
  } else if (!canRead || isRefusal(plans.error)) {
    body = <Restricted />;
  } else if (plans.isPending) {
    body = <Loading label={t("loading")} tall />;
  } else if (plans.isError) {
    body = <LoadError onRetry={() => void plans.refetch()} />;
  } else if (plans.data.length === 0) {
    body = (
      <p role="status" className="type-body-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-4" data-plans-state="ready">
        {plans.data.map((plan) => (
          <li key={plan.key}>
            <PlanCard plan={plan} />
          </li>
        ))}
      </ul>
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
      </PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">
        <p className="type-body-sm text-muted-foreground">{t("intro")}</p>
        {body}
      </PageBody>
    </div>
  );
}

function PlanCard({ plan }: { plan: BillingPlan }) {
  const t = useTranslations("controlPlane.billing.plans");
  const current = plan.versions.find((v) => v.id === plan.current_version_id);

  return (
    <section
      aria-labelledby={`plan-${plan.key}`}
      className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={`plan-${plan.key}`} className="type-title font-display">
            {current?.name ?? plan.versions[0]?.name ?? plan.key}
          </h2>
          <p className="type-caption font-mono text-faint-foreground">{plan.key}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="type-body-sm text-muted-foreground">
            {current ? t("current", { version: current.version }) : t("noCurrent")} ·{" "}
            {t("versions", { count: plan.versions.length })}
          </span>
          <Button asChild variant="quiet" size="sm">
            <Link href={routeHref("web.admin.pricing._plan-id", { planId: plan.key })}>
              {t("history")}
            </Link>
          </Button>
        </div>
      </div>
      <Versions plan={plan} />
    </section>
  );
}

function Versions({ plan, entitlements = false }: { plan: BillingPlan; entitlements?: boolean }) {
  const t = useTranslations("controlPlane.billing.plans");
  const b = useTranslations("controlPlane.billing");
  const money = useMoney();
  const when = useWhen();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-180 text-left">
        <caption className="sr-only">{t("caption")}</caption>
        <thead>
          <tr className="border-b type-label text-faint-foreground">
            {(["version", "status", "prices", "source", "published"] as const).map((column) => (
              <th key={column} scope="col" className="py-2 pe-3">
                {t(`columns.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {plan.versions.map((version) => (
            <tr
              key={version.id}
              className="align-top type-body-sm"
              data-version-status={version.status}
            >
              <td className="py-2.5 pe-3">
                <span className="font-extrabold">v{version.version}</span>
                <span className="block text-muted-foreground">{version.name}</span>
              </td>
              <td className="py-2.5 pe-3">
                <StatusBadge variant={VERSION_VARIANT[version.status] ?? "neutral"}>
                  {b(`versionStatus.${version.status}`)}
                </StatusBadge>
              </td>
              <td className="py-2.5 pe-3">
                <ul className="flex flex-col gap-1">
                  {version.prices.map((price) => (
                    <li key={price.price_version_id}>
                      <span className="tabular-nums">
                        {price.pricing === "quote_required"
                          ? b("quote")
                          : money(price.amount, price.amount_minor, price.currency)}
                      </span>{" "}
                      <span className="text-muted-foreground">
                        {b(`interval.${price.interval}`)}
                      </span>
                      <span className="block type-caption text-faint-foreground">
                        {price.stripe_mapped_modes.length > 0
                          ? t("mapped", {
                              modes: price.stripe_mapped_modes
                                .map((mode) => b(`mode.${mode}`))
                                .join(", "),
                            })
                          : t("notMapped")}
                      </span>
                    </li>
                  ))}
                </ul>
                {version.proposed_trial_days !== null && (
                  <p className="type-caption text-faint-foreground">
                    {t("trial", { days: version.proposed_trial_days })}
                  </p>
                )}
                {entitlements && (
                  <div className="mt-2 flex flex-col gap-1">
                    <p className="type-label text-faint-foreground">{t("entitlements")}</p>
                    {(version.entitlements ?? []).length === 0 ? (
                      <p className="type-caption text-muted-foreground">{t("entitlementsEmpty")}</p>
                    ) : (
                      <ul className="flex flex-col gap-0.5">
                        {(version.entitlements ?? []).map((e) => (
                          <li key={e.feature_key} className="type-caption font-mono">
                            {e.feature_key}
                            {e.quantity_limit !== null &&
                              ` · ${t("limit", { limit: e.quantity_limit })}`}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </td>
              <td className="py-2.5 pe-3">{b(`priceSource.${version.price_source}`)}</td>
              <td className="py-2.5 pe-3 text-muted-foreground">
                {when(version.published_at)}
                {version.approval_reference && (
                  <span className="block type-caption">
                    {t("approval", { reference: version.approval_reference })}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * AR5 adapted (SF-127; Claude Design `AdminPlanEditor`, FUTURE): one plan's version
 * history with prices and entitlements, read only. Nothing is editable.
 */
export function PlanPage({ planKey }: { planKey: string }) {
  const t = useTranslations("controlPlane.billing.plans");
  const operator = useOperator().data;
  const known = operator !== undefined;
  const canRead = !!operator && grants(operator, "billing.read");
  const plan = useBillingPlan(planKey, canRead);
  useForgetBillingOnRefusal(plan.error);

  let body: ReactNode;
  if (!known) {
    body = <Loading label={t("loading")} tall />;
  } else if (isApiError(plan.error) && plan.error.status === 404 && canRead) {
    body = <p className="type-body-sm text-muted-foreground">{t("notFound")}</p>;
  } else if (!canRead || isRefusal(plan.error)) {
    body = <Restricted />;
  } else if (plan.isPending) {
    body = <Loading label={t("loading")} tall />;
  } else if (plan.isError) {
    body = <LoadError onRetry={() => void plan.refetch()} />;
  } else {
    body = (
      <section className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-5">
        <Versions plan={plan.data} entitlements />
      </section>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <nav aria-label="Breadcrumb">
            <p className="type-label text-faint-foreground">{t("breadcrumb")}</p>
          </nav>
          <h1 className="truncate type-h3 font-display">
            {t("history")} · <span className="font-mono">{planKey}</span>
          </h1>
        </div>
        <Button asChild variant="quiet" size="sm">
          <Link href={routeHref("web.admin.pricing")}>
            <ArrowLeftIcon aria-hidden className="size-4" />
            {t("back")}
          </Link>
        </Button>
      </PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">
        <p className="type-body-sm text-muted-foreground">{t("intro")}</p>
        {body}
      </PageBody>
    </div>
  );
}
