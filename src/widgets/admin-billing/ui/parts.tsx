"use client";

import { AlertTriangleIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { formatAmount, type BillingMode } from "@/entities/admin-billing";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";

type Variant = "success" | "warning" | "destructive" | "neutral" | "outline";

/** A status shown as text and a badge, never by colour alone. */
export function StatusBadge({ variant, children }: { variant: Variant; children: ReactNode }) {
  return (
    <Badge variant={variant} className="max-w-full text-start whitespace-normal">
      {children}
    </Badge>
  );
}

export const SUBSCRIPTION_VARIANT: Record<string, Variant> = {
  pending_activation: "neutral",
  active: "success",
  cancellation_scheduled: "warning",
  cancelled: "outline",
  expired: "outline",
};

export const PROVIDER_VARIANT: Record<string, Variant> = {
  incomplete: "neutral",
  incomplete_expired: "outline",
  trialing: "neutral",
  active: "success",
  past_due: "warning",
  canceled: "outline",
  unpaid: "destructive",
  paused: "neutral",
};

export const INVOICE_VARIANT: Record<string, Variant> = {
  draft: "outline",
  open: "neutral",
  paid: "success",
  uncollectible: "destructive",
  void: "outline",
};

export const RECONCILIATION_VARIANT: Record<string, Variant> = {
  in_sync: "success",
  stale: "warning",
  mismatch: "destructive",
  not_linked: "neutral",
  not_evaluated: "outline",
};

/** Formats amounts exactly as sent, in their own currency; minor units when SimpleFit doesn't list it. */
export function useMoney() {
  const t = useTranslations("controlPlane.billing");
  const locale = useLocale();
  return (amount: string | null, minor: number | string | null, currency: string) => {
    const formatted = formatAmount(locale, amount, currency);
    if (formatted !== null) return formatted;
    if (minor === null) return t("quote");
    return t("minorUnits", { minor: String(minor), currency });
  };
}

/** Formats a timestamp, or "never". */
export function useWhen() {
  const t = useTranslations("controlPlane.billing.overview");
  const format = useFormatter();
  return (at: string | null | undefined) =>
    at ? format.dateTime(new Date(at), "dateTime") : t("never");
}

export function Amount({
  amount,
  minor,
  currency,
}: {
  amount: string | null;
  minor: number | string | null;
  currency: string;
}) {
  const money = useMoney();
  return <span className="tabular-nums">{money(amount, minor, currency)}</span>;
}

/**
 * The Stripe mode the page reads, as a two-button switch. The backend validates it and
 * answers with the mode it actually read; this only asks.
 */
export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: BillingMode | undefined;
  onChange: (mode: BillingMode) => void;
}) {
  const t = useTranslations("controlPlane.billing.mode");
  return (
    <div role="group" aria-label={t("label")} className="flex items-center gap-1.5">
      <span className="type-label text-faint-foreground">{t("label")}</span>
      {(["test", "live"] as const).map((value) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={mode === value ? "primary" : "quiet"}
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
        >
          {t(value)}
        </Button>
      ))}
    </div>
  );
}

/** The mode the figures came from, always visible. */
export function ModeBadge({ mode }: { mode: BillingMode }) {
  const t = useTranslations("controlPlane.billing.mode.badge");
  return (
    <Badge
      variant={mode === "live" ? "warning" : "neutral"}
      className="uppercase"
      data-billing-mode={mode}
    >
      {t(mode)}
    </Badge>
  );
}

export function Loading({ label, tall = false }: { label: string; tall?: boolean }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col gap-2">
      <Skeleton className={tall ? "h-40 w-full rounded-lg" : "h-24 w-full rounded-lg"} />
    </div>
  );
}

/** A read that failed: what failed and how to retry, never a zero. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  const common = useTranslations("controlPlane.users");
  return (
    <div className="flex flex-col items-start gap-2">
      <p role="alert" className="type-body-sm text-muted-foreground">
        {common("error.body")}
      </p>
      <Button variant="quiet" onClick={onRetry}>
        {common("error.retry")}
      </Button>
    </div>
  );
}

export function Unreachable({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("controlPlane.billing");
  const common = useTranslations("controlPlane.users");
  return (
    <section
      data-billing-state="unreachable"
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
      <Button onClick={onRetry}>{common("error.retry")}</Button>
    </section>
  );
}

export function Restricted() {
  const t = useTranslations("controlPlane.users.restricted");
  return (
    <section
      data-billing-state="restricted"
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

/** Keyset pages: previous pops the cursor stack, next pushes the backend's cursor. */
export function Pager({
  label,
  page,
  next,
  onPrevious,
  onNext,
}: {
  label: string;
  page: number;
  next: string | null;
  onPrevious: () => void;
  onNext: (cursor: string) => void;
}) {
  const t = useTranslations("controlPlane.billing.subscriptions.pages");
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3">
      <Button variant="quiet" disabled={page === 1} onClick={onPrevious}>
        {t("previous")}
      </Button>
      <span className="type-caption text-faint-foreground">{t("page", { page })}</span>
      <Button variant="quiet" disabled={!next} onClick={() => next && onNext(next)}>
        {t("next")}
      </Button>
    </nav>
  );
}

/** A labelled count: an actual measured number, zero included. */
export function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl border bg-surface p-3.5">
      <dt className="type-label text-faint-foreground">{label}</dt>
      <dd className="type-h3 font-display tabular-nums">{value}</dd>
    </div>
  );
}

const DISCREPANCIES = [
  "customer_mismatch",
  "price_mismatch",
  "ended_locally_live_at_provider",
  "invoice_subscription_mismatch",
  "invoice_currency_mismatch",
  "invoice_amount_mismatch",
  "invoice_period_over",
  "invoice_period_missing",
  "invoice_not_paid",
  "invalid_evidence",
] as const;

/** Whether `value` is one of `known` (narrowing a backend string to a message key). */
export function isKnown<const T extends string>(known: readonly T[], value: string): value is T {
  return (known as readonly string[]).includes(value);
}

/** A known discrepancy code in words; any other code shown as it is. */
export function useDiscrepancy() {
  const t = useTranslations("controlPlane.billing.discrepancy");
  return (code: string) => (isKnown(DISCREPANCIES, code) ? t(code) : t("other", { code }));
}
