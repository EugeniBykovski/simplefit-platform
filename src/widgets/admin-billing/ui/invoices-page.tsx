"use client";

import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import {
  INVOICE_ISSUES,
  INVOICE_STATUSES,
  isRefusal,
  useBillingInvoices,
  useBillingOverview,
  useForgetBillingOnRefusal,
  type BillingMode,
  type InvoiceFilters,
} from "@/entities/admin-billing";
import { grants, useOperator } from "@/entities/operator";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

import {
  INVOICE_VARIANT,
  LoadError,
  Loading,
  ModeBadge,
  ModeSwitch,
  Pager,
  Restricted,
  StatusBadge,
  useMoney,
  useWhen,
} from "./parts";

const ANY = "any";
const CURRENCY = /^[A-Z]{3}$/;

/**
 * AR2 adapted (SF-127; Claude Design `AdminTransactions`, FUTURE, built read-only on the
 * SF-102 domain): recorded Stripe invoices of gyms paying SimpleFit, of one mode, newest
 * first, with Stripe's statuses and payment issues. No buyer card details, fees, payouts,
 * export or refund: none exists here.
 */
export function InvoicesPage() {
  const t = useTranslations("controlPlane.billing.invoices");
  const operator = useOperator().data;
  const known = operator !== undefined;
  const canRead = !!operator && grants(operator, "billing.read");
  const [chosen, setChosen] = useState<BillingMode | undefined>(undefined);
  // The configured mode comes from the backend's own answer, never assumed here.
  const configured = useBillingOverview(undefined, canRead && chosen === undefined);
  const mode = chosen ?? configured.data?.mode;
  const refused = known && (!canRead || isRefusal(configured.error));

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader className="flex-wrap gap-y-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <nav aria-label="Breadcrumb">
            <p className="type-label text-faint-foreground">{t("breadcrumb")}</p>
          </nav>
          <h1 className="truncate type-h3 font-display">{t("title")}</h1>
        </div>
        {known && !refused && <ModeSwitch mode={mode} onChange={setChosen} />}
      </PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">
        {refused ? (
          <Restricted />
        ) : mode === undefined ? (
          configured.isError ? (
            <LoadError onRetry={() => void configured.refetch()} />
          ) : (
            <Loading label={t("loading")} />
          )
        ) : (
          <>
            <p className="type-body-sm text-muted-foreground">{t("intro")}</p>
            <InvoiceList mode={mode} />
          </>
        )}
        <p className="type-caption text-muted-foreground">{t("noRefunds")}</p>
      </PageBody>
    </div>
  );
}

function InvoiceList({ mode }: { mode: BillingMode }) {
  const t = useTranslations("controlPlane.billing.invoices");
  const b = useTranslations("controlPlane.billing");
  const [filters, setFilters] = useState<InvoiceFilters>({});
  const [currencyDraft, setCurrencyDraft] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const page = useBillingInvoices(mode, filters, cursors.at(-1));
  useForgetBillingOnRefusal(page.error);
  const money = useMoney();
  const when = useWhen();

  const reset = (next: InvoiceFilters) => {
    setFilters(next);
    setCursors([]);
  };

  let body: ReactNode;
  if (isRefusal(page.error)) {
    body = <Restricted />;
  } else if (page.isPending) {
    body = <Loading label={t("loading")} />;
  } else if (page.isError) {
    body = <LoadError onRetry={() => void page.refetch()} />;
  } else if (page.data.invoices.length === 0) {
    body = (
      <p role="status" data-invoices-state="empty" className="type-body-sm text-muted-foreground">
        {t("empty")}
      </p>
    );
  } else {
    body = (
      <div className="flex flex-col gap-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-220 text-left" data-invoices-state="ready">
            <caption className="sr-only">{t("caption")}</caption>
            <thead>
              <tr className="border-b type-label text-faint-foreground">
                {(
                  [
                    "invoice",
                    "gym",
                    "status",
                    "issue",
                    "total",
                    "paid",
                    "refunded",
                    "issued",
                  ] as const
                ).map((column) => (
                  <th key={column} scope="col" className="py-2 pe-3">
                    {t(`columns.${column}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {page.data.invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  className="type-body-sm"
                  data-invoice-issue={invoice.issue ?? "none"}
                >
                  <td className="py-2.5 pe-3 font-extrabold">{invoice.number ?? t("noNumber")}</td>
                  <td className="py-2.5 pe-3">{invoice.gym.name ?? invoice.gym.id}</td>
                  <td className="py-2.5 pe-3">
                    <StatusBadge variant={INVOICE_VARIANT[invoice.status] ?? "neutral"}>
                      {b(`invoiceStatus.${invoice.status}`)}
                    </StatusBadge>
                  </td>
                  <td className="py-2.5 pe-3">
                    {invoice.issue ? (
                      <StatusBadge
                        variant={invoice.issue === "uncollectible" ? "destructive" : "warning"}
                      >
                        {b(`issue.${invoice.issue}`)}
                      </StatusBadge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2.5 pe-3 tabular-nums">
                    {money(invoice.total, invoice.total_minor, invoice.currency)}
                  </td>
                  <td className="py-2.5 pe-3 tabular-nums">
                    {money(invoice.amount_paid, invoice.amount_paid_minor, invoice.currency)}
                  </td>
                  <td className="py-2.5 pe-3 tabular-nums">
                    {money(
                      invoice.amount_refunded,
                      invoice.amount_refunded_minor,
                      invoice.currency,
                    )}
                  </td>
                  <td className="py-2.5 pe-3 text-muted-foreground">{when(invoice.issued_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager
          label={b("subscriptions.pages.label")}
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
      aria-labelledby="billing-invoices"
      className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="billing-invoices" className="type-title font-display">
          {t("caption")}
        </h2>
        <ModeBadge mode={mode} />
      </div>
      <form
        role="search"
        aria-label={t("filters.label")}
        onSubmit={(event) => {
          event.preventDefault();
          const code = currencyDraft.trim().toUpperCase();
          reset({ ...filters, currency: CURRENCY.test(code) ? code : undefined });
        }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="invoice-filter-status">{t("filters.status")}</Label>
          <Select
            value={filters.status ?? ANY}
            onValueChange={(value) =>
              reset({
                ...filters,
                status: value === ANY ? undefined : (value as InvoiceFilters["status"]),
              })
            }
          >
            <SelectTrigger id="invoice-filter-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("filters.any")}</SelectItem>
              {INVOICE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {b(`invoiceStatus.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="invoice-filter-issue">{t("filters.issue")}</Label>
          <Select
            value={filters.issue ?? ANY}
            onValueChange={(value) =>
              reset({
                ...filters,
                issue: value === ANY ? undefined : (value as InvoiceFilters["issue"]),
              })
            }
          >
            <SelectTrigger id="invoice-filter-issue" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t("filters.any")}</SelectItem>
              {INVOICE_ISSUES.map((issue) => (
                <SelectItem key={issue} value={issue}>
                  {b(`issue.${issue}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="invoice-filter-currency">{t("filters.currency")}</Label>
          <Input
            id="invoice-filter-currency"
            value={currencyDraft}
            maxLength={3}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setCurrencyDraft(event.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="quiet">
            {b("subscriptions.filters.apply")}
          </Button>
        </div>
      </form>
      {body}
    </section>
  );
}
