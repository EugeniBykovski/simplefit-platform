"use client";

import {
  CreditCardIcon,
  ExternalLinkIcon,
  FlaskConicalIcon,
  LockIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, type ReactNode } from "react";

import type { Gym } from "@/entities/gym";
import {
  canManageBilling,
  payablePrices,
  useGymBillingInvoices,
  useGymBillingSummary,
  useSaasPlans,
  type GymBillingInvoice,
  type GymBillingSummary,
  type GymSaasSubscription,
  type SaasPlan,
  type SaasPrice,
} from "@/entities/gym-billing";
import {
  BillingProblemNotice,
  CancelPlanDialog,
  billingProblem,
  readProblem,
  useOpenPortal,
  useReconcile,
  useStartCheckout,
  type Navigate,
} from "@/features/gym-billing-manage";
import { usePathname, useRouter } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Notice } from "@/shared/ui/notice";
import { PageBody } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { Spinner } from "@/shared/ui/spinner";

/*
 * The gym's SimpleFit plan (`web.app.gyms._gym-id.settings.plan`, WG25;
 * Claude Design 1793198527-a0fc, a FUTURE board built on SF-101/SF-102 with
 * adaptations recorded in docs/gym-console-web.md):
 *
 * - Current plan: the backend's latest subscription, its price as the
 *   backend sent it (decimal string and currency), its paid period and the
 *   next payment date only when the backend confirms a renewing
 *   subscription. "Test mode" when Stripe runs in test mode.
 * - Payment state: what the backend reconciled from Stripe (pending,
 *   authentication required, failed, past due, scheduled to end), never
 *   inferred from a browser redirect. Returning from Checkout asks the
 *   backend to read Stripe (`reconcileGymSaasSubscription`) once.
 * - Plans: the published SimpleFit plans; choosing one records the intent
 *   and leaves for Stripe-hosted Checkout. No card field exists here.
 * - Invoices: Stripe's, as reconciled; links open Stripe's hosted invoice
 *   page or PDF. Billing management opens the Stripe Customer Portal.
 *
 * Only the owner (`manage_billing`) sees any of it; other staff see the
 * role-restricted state and nothing is read for them. The design's usage
 * meters, card on file and plan comparison have no domain and are not shown.
 */

type PaymentState = GymBillingSummary["payment"]["state"];

/** The page for the console's gym: a new gym is a new page (no state carries over). */
export function GymBilling({ gym, navigate }: { gym: Gym; navigate?: Navigate }) {
  return <BillingPage key={gym.id} gym={gym} navigate={navigate} />;
}

function BillingPage({ gym, navigate }: { gym: Gym; navigate?: Navigate }) {
  const t = useTranslations("gymBilling");
  const allowed = canManageBilling(gym.viewer);
  const summary = useGymBillingSummary(gym.id, { enabled: allowed });

  if (!allowed) {
    return (
      <PageBody className="pt-5.5" data-gym-billing data-billing-restricted>
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

  if (summary.isError) {
    const problem = readProblem(summary.error);
    return (
      <PageBody className="flex flex-col gap-3 pt-5.5" data-gym-billing>
        <BillingProblemNotice problem={problem} />
        <div>
          <Button variant="quiet" size="sm" onClick={() => void summary.refetch()}>
            {t("retry")}
          </Button>
        </div>
      </PageBody>
    );
  }

  if (summary.data === undefined) {
    return (
      <PageBody
        className="grid gap-4 pt-5.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
        data-gym-billing
        aria-busy
      >
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-40 rounded-3xl" />
      </PageBody>
    );
  }

  return <BillingContent gym={gym} summary={summary.data} navigate={navigate} />;
}

function BillingContent({
  gym,
  summary,
  navigate,
}: {
  gym: Gym;
  summary: GymBillingSummary;
  navigate?: Navigate;
}) {
  const ready = summary.provider.status === "ready";
  const subscription = summary.subscription;
  const current =
    subscription !== null &&
    ["pending_activation", "active", "cancellation_scheduled"].includes(subscription.status)
      ? subscription
      : null;
  const returned = useCheckoutReturn(gym.id, current);

  return (
    <PageBody
      className="grid items-start gap-4 pt-5.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"
      data-gym-billing
      data-payment-state={summary.payment.state}
    >
      <div className="flex min-w-0 flex-col gap-4">
        <ProviderNotice summary={summary} />
        <CurrentPlanCard summary={summary} />
        {returned}
        <PaymentNotice gymId={gym.id} summary={summary} navigate={navigate} />
        <PlansCard gymId={gym.id} current={current} ready={ready} navigate={navigate} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <InvoicesCard gymId={gym.id} />
        <ManageCard gymId={gym.id} summary={summary} current={current} navigate={navigate} />
      </div>
    </PageBody>
  );
}

/**
 * Back from Stripe Checkout (`?checkout=returned|cancelled`): the backend
 * reads Stripe once; the query is then removed so a reload does not repeat it.
 */
function useCheckoutReturn(gymId: string, current: GymSaasSubscription | null): ReactNode {
  const t = useTranslations("gymBilling.payment");
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const reconcile = useReconcile(gymId);
  const outcome = params.get("checkout");
  const asked = useRef(false);

  useEffect(() => {
    if (outcome === null || asked.current) return;
    asked.current = true;
    if (outcome === "returned" && current !== null) reconcile.mutate(current.subscription_id);
    router.replace(pathname);
  }, [outcome, current, reconcile, router, pathname]);

  if (outcome === "cancelled") return <Notice tone="muted">{t("returnCancelled")}</Notice>;
  if (reconcile.isPending)
    return (
      <Notice tone="muted" role="status" data-billing-confirming>
        <span className="flex items-center gap-2">
          <Spinner />
          {t("confirming")}
        </span>
      </Notice>
    );
  if (reconcile.isError) return <BillingProblemNotice problem={billingProblem(reconcile.error)} />;
  return null;
}

function ProviderNotice({ summary }: { summary: GymBillingSummary }) {
  const t = useTranslations("gymBilling.provider");
  if (summary.provider.status === "disabled")
    return (
      <Notice tone="muted" data-provider-state="disabled">
        {t("disabled")}
      </Notice>
    );
  if (summary.provider.status === "unavailable")
    return (
      <Notice tone="amber" data-provider-state="unavailable">
        {t("unavailable")}
      </Notice>
    );
  return null;
}

function useMoney() {
  const format = useFormatter();
  return (price: Pick<SaasPrice, "amount" | "currency">) =>
    price.amount === null
      ? null
      : format.number(Number(price.amount), { style: "currency", currency: price.currency });
}

function CurrentPlanCard({ summary }: { summary: GymBillingSummary }) {
  const t = useTranslations("gymBilling.current");
  const format = useFormatter();
  const money = useMoney();
  const s = summary.subscription;
  const date = (value: string | null) => (value ? format.dateTime(new Date(value), "date") : "");
  const live = s !== null && s.status !== "cancelled" && s.status !== "expired";

  return (
    <section
      aria-labelledby="billing-current"
      className="flex flex-col gap-2.5 rounded-3xl bg-primary px-6 py-5.5 text-primary-foreground"
      data-billing-current={s?.status ?? "none"}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="billing-current" className="type-label opacity-80">
          {t("label")}
        </h2>
        {summary.provider.mode === "test" && (
          <Badge variant="neutral" title={t("testModeHint")} data-test-mode>
            <FlaskConicalIcon aria-hidden />
            {t("testMode")}
          </Badge>
        )}
      </div>
      {live ? (
        <>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="type-h2 font-display">{s.plan.name}</span>
            <span className="type-body font-extrabold">
              {t(s.price.interval === "year" ? "priceYear" : "priceMonth", {
                amount: money(s.price) ?? "",
              })}
            </span>
          </p>
          <p className="type-body-sm font-bold opacity-80">
            {t(`status.${s.status}`)}
            {s.current_period_start && s.current_period_end && (
              <>
                {" · "}
                {t("period", {
                  start: date(s.current_period_start),
                  end: date(s.current_period_end),
                })}
              </>
            )}
            {summary.payment.next_payment_at && (
              <>
                {" · "}
                {t("nextPayment", { date: date(summary.payment.next_payment_at) })}
              </>
            )}
            {s.status === "cancellation_scheduled" && s.cancellation_effective_at && (
              <>
                {" · "}
                {t("endsOn", { date: date(s.cancellation_effective_at) })}
              </>
            )}
          </p>
        </>
      ) : (
        <>
          <p className="type-h3 font-display">{t("none")}</p>
          <p className="type-body-sm font-bold opacity-80">
            {s !== null
              ? t(`ended.${s.status === "expired" ? "expired" : "cancelled"}`)
              : t("noneBody")}
          </p>
        </>
      )}
    </section>
  );
}

const ATTENTION: readonly PaymentState[] = ["action_required", "payment_failed", "past_due"];

function PaymentNotice({
  gymId,
  summary,
  navigate,
}: {
  gymId: string;
  summary: GymBillingSummary;
  navigate?: Navigate;
}) {
  const t = useTranslations("gymBilling.payment");
  const format = useFormatter();
  const portal = useOpenPortal(gymId, navigate);
  const state = summary.payment.state;
  const url = summary.payment.action_url;
  const ends = summary.subscription?.cancellation_effective_at;

  if (state === "processing")
    return (
      <Notice tone="muted" role="status" data-payment-notice={state}>
        {t("processing")}
      </Notice>
    );
  if (state === "cancellation_scheduled")
    return (
      <Notice tone="amber" data-payment-notice={state}>
        {ends
          ? t("cancellationScheduled", { date: format.dateTime(new Date(ends), "date") })
          : t("cancellationScheduledSoon")}
      </Notice>
    );
  if (!ATTENTION.includes(state)) return null;

  return (
    <Notice
      tone={state === "action_required" ? "amber" : "coral"}
      role="alert"
      data-payment-notice={state}
      action={
        <div className="flex flex-wrap gap-2">
          {url && (
            <Button
              size="sm"
              variant={state === "action_required" ? "warning" : "destructive"}
              asChild
            >
              <a href={url} target="_blank" rel="noopener noreferrer">
                {state === "action_required" ? t("completePayment") : t("payInvoice")}
                <ExternalLinkIcon aria-hidden />
              </a>
            </Button>
          )}
          {state !== "action_required" && summary.provider.portal_available && (
            <Button
              size="sm"
              variant="quiet"
              loading={portal.isPending}
              onClick={() => portal.mutate()}
            >
              {t("updatePaymentMethod")}
            </Button>
          )}
        </div>
      }
    >
      {t(
        state === "action_required"
          ? "actionRequired"
          : state === "payment_failed"
            ? "paymentFailed"
            : "pastDue",
      )}
    </Notice>
  );
}

function PlansCard({
  gymId,
  current,
  ready,
  navigate,
}: {
  gymId: string;
  current: GymSaasSubscription | null;
  ready: boolean;
  navigate?: Navigate;
}) {
  const t = useTranslations("gymBilling.plans");
  const plans = useSaasPlans();
  const checkout = useStartCheckout(gymId, navigate);
  const problem = checkout.isError ? billingProblem(checkout.error) : null;
  const pending = current?.status === "pending_activation" ? current : null;
  const committed = current !== null && pending === null;

  return (
    <Card data-billing-plans>
      <CardHeader>
        <CardTitle className="type-title font-display">
          {current === null ? t("chooseTitle") : t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pending && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-input bg-surface-elevated px-4 py-3">
            <span className="min-w-0 flex-1 type-body-sm">
              {t("pending", { plan: pending.plan.name })}
            </span>
            <Button
              size="sm"
              disabled={!ready}
              loading={checkout.isPending}
              data-billing-continue
              onClick={() => checkout.mutate({ subscriptionId: pending.subscription_id })}
            >
              <CreditCardIcon aria-hidden />
              {t("continueCheckout")}
            </Button>
          </div>
        )}
        {plans.isError && <BillingProblemNotice problem={readProblem(plans.error)} />}
        {plans.data === undefined && !plans.isError && <Skeleton className="h-16 rounded-2xl" />}
        {plans.data?.length === 0 && (
          <p className="type-body-sm text-muted-foreground">{t("empty")}</p>
        )}
        {plans.data !== undefined && plans.data.length > 0 && (
          <ul className="flex flex-col divide-y divide-border">
            {plans.data.map((plan) => (
              <PlanRow
                key={plan.plan_version_id}
                plan={plan}
                current={current}
                disabled={!ready || current !== null || checkout.isPending}
                onChoose={(price) =>
                  checkout.mutate({
                    planVersionId: plan.plan_version_id,
                    priceVersionId: price.price_version_id,
                  })
                }
              />
            ))}
          </ul>
        )}
        {committed && (
          <p className="type-caption text-muted-foreground">{t("changeUnavailable")}</p>
        )}
        {problem && <BillingProblemNotice problem={problem} />}
        <p className="type-caption text-faint-foreground">{t("taxNote")}</p>
      </CardContent>
    </Card>
  );
}

function PlanRow({
  plan,
  current,
  disabled,
  onChoose,
}: {
  plan: SaasPlan;
  current: GymSaasSubscription | null;
  disabled: boolean;
  onChoose: (price: SaasPrice) => void;
}) {
  const t = useTranslations("gymBilling.plans");
  const money = useMoney();
  const prices = payablePrices(plan);
  const isCurrent = current?.plan.plan_version_id === plan.plan_version_id;

  return (
    <li className="flex flex-wrap items-center gap-3 py-3" data-billing-plan={plan.plan_key}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="type-body-sm font-extrabold">{plan.name}</span>
          {isCurrent && <Badge variant="success">{t("currentBadge")}</Badge>}
          {plan.price_source === "provisional" && (
            <Badge variant="outline">{t("provisional")}</Badge>
          )}
        </span>
        {plan.description && (
          <span className="type-caption text-muted-foreground">{plan.description}</span>
        )}
        {prices.length === 0 && (
          <span className="type-caption text-muted-foreground">{t("quote")}</span>
        )}
      </span>
      <span className="flex flex-wrap gap-2">
        {prices.map((price) => (
          <Button
            key={price.price_version_id}
            size="sm"
            variant={price.interval === "month" ? "outline" : "quiet"}
            disabled={disabled}
            data-billing-choose={`${plan.plan_key}:${price.interval}`}
            onClick={() => onChoose(price)}
          >
            {t(price.interval === "month" ? "payMonthly" : "payYearly", {
              amount: money(price) ?? "",
            })}
          </Button>
        ))}
      </span>
    </li>
  );
}

function InvoicesCard({ gymId }: { gymId: string }) {
  const t = useTranslations("gymBilling.invoices");
  const invoices = useGymBillingInvoices(gymId);

  return (
    <Card data-billing-invoices>
      <CardHeader>
        <CardTitle className="type-title font-display">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {invoices.isError && <BillingProblemNotice problem={readProblem(invoices.error)} />}
        {invoices.data === undefined && !invoices.isError && (
          <Skeleton className="h-24 rounded-2xl" />
        )}
        {invoices.data?.length === 0 && (
          <p className="type-body-sm text-muted-foreground">{t("empty")}</p>
        )}
        {invoices.data !== undefined && invoices.data.length > 0 && (
          <table className="w-full table-fixed type-body-sm">
            <caption className="sr-only">{t("title")}</caption>
            <thead>
              <tr className="text-left type-label text-faint-foreground [&>th]:font-semibold">
                <th scope="col" className="w-[28%] pb-2.5 text-left">
                  {t("date")}
                </th>
                <th scope="col" className="w-[30%] pb-2.5 text-left">
                  {t("amount")}
                </th>
                <th scope="col" className="w-[24%] pb-2.5 text-left">
                  {t("status")}
                </th>
                <th scope="col" className="pb-2.5 text-left">
                  <span className="sr-only">{t("document")}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.data.map((invoice) => (
                <InvoiceRow key={invoice.invoice_id} invoice={invoice} />
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

const INVOICE_BADGE = {
  paid: "success",
  open: "warning",
  draft: "neutral",
  uncollectible: "destructive",
  void: "neutral",
} as const;

function InvoiceRow({ invoice }: { invoice: GymBillingInvoice }) {
  const t = useTranslations("gymBilling.invoices");
  const format = useFormatter();
  const money = (amount: string | null, minor: number) =>
    amount === null
      ? format.number(minor, "integer")
      : format.number(Number(amount), { style: "currency", currency: invoice.currency });
  const link = invoice.hosted_invoice_url ?? invoice.invoice_pdf;

  return (
    <tr className="align-middle" data-billing-invoice={invoice.status}>
      <td className="py-3 pr-2">
        <span className="flex flex-col">
          <span>{format.dateTime(new Date(invoice.issued_at), "date")}</span>
          {invoice.number && (
            <span className="type-caption font-mono text-faint-foreground">{invoice.number}</span>
          )}
        </span>
      </td>
      <td className="py-3 pr-2">
        <span className="flex flex-col">
          <span className="font-extrabold">{money(invoice.total, invoice.total_minor)}</span>
          {invoice.amount_refunded_minor > 0 && (
            <span className="type-caption text-muted-foreground">
              {t("refunded", {
                amount: money(invoice.amount_refunded, invoice.amount_refunded_minor),
              })}
            </span>
          )}
        </span>
      </td>
      <td className="py-3 pr-2">
        <span className="flex flex-wrap gap-1">
          <Badge variant={INVOICE_BADGE[invoice.status]}>{t(`statuses.${invoice.status}`)}</Badge>
          {invoice.disputed && <Badge variant="destructive">{t("disputed")}</Badge>}
          {invoice.mode === "test" && <Badge variant="outline">{t("test")}</Badge>}
        </span>
      </td>
      <td className="py-3 text-right">
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-extrabold text-highlight underline-offset-4 hover:underline focus-visible:underline"
          >
            {t("view")}
            <ExternalLinkIcon aria-hidden className="size-3.5" />
            <span className="sr-only">{t("opensStripe")}</span>
          </a>
        )}
      </td>
    </tr>
  );
}

function ManageCard({
  gymId,
  summary,
  current,
  navigate,
}: {
  gymId: string;
  summary: GymBillingSummary;
  current: GymSaasSubscription | null;
  navigate?: Navigate;
}) {
  const t = useTranslations("gymBilling.manage");
  const portal = useOpenPortal(gymId, navigate);
  const reconcile = useReconcile(gymId);
  const problem = portal.isError
    ? billingProblem(portal.error)
    : reconcile.isError
      ? billingProblem(reconcile.error)
      : null;
  const ready = summary.provider.status === "ready";

  return (
    <Card data-billing-manage>
      <CardHeader>
        <CardTitle className="type-title font-display">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="type-body-sm text-muted-foreground">{t("body")}</p>
        <div className={cn("flex flex-wrap items-center gap-2")}>
          <Button
            size="sm"
            disabled={!ready || !summary.provider.portal_available}
            loading={portal.isPending}
            data-billing-portal
            onClick={() => portal.mutate()}
          >
            {t("open")}
            <ExternalLinkIcon aria-hidden />
          </Button>
          {current !== null && ready && (
            <Button
              size="sm"
              variant="quiet"
              loading={reconcile.isPending}
              data-billing-refresh
              onClick={() => reconcile.mutate(current.subscription_id)}
            >
              <RefreshCwIcon aria-hidden />
              {t("refresh")}
            </Button>
          )}
          {current !== null && current.status !== "cancellation_scheduled" && (
            <span className="ml-auto">
              <CancelPlanDialog gymId={gymId} subscription={current} />
            </span>
          )}
        </div>
        {!summary.provider.portal_available && ready && (
          <p className="type-caption text-faint-foreground">{t("noCustomer")}</p>
        )}
        {problem && <BillingProblemNotice problem={problem} />}
      </CardContent>
    </Card>
  );
}
