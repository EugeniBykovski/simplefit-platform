"use client";

import { AlertTriangleIcon, InboxIcon, RefreshCwIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import {
  REVIEW_STATUSES,
  useReviewQueue,
  type ReviewFilters,
  type ReviewStatus,
} from "@/entities/admin-sponsor-review";
import { grants, useOperator } from "@/entities/operator";
import { useAnswerLabels } from "@/entities/sponsor-application";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { countryName } from "@/shared/lib/countries";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";

import { Restricted, StatusBadge } from "./review-parts";

const ANY = "any";

/** A `YYYY-MM-DD` date input as the start of that day in UTC, or nothing. */
const dayStart = (value: string) => (value === "" ? undefined : `${value}T00:00:00Z`);
const dayAfter = (value: string) => {
  if (value === "") return undefined;
  const next = new Date(`${value}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
};

/**
 * AS1, the sponsor application queue (SF-124; Claude Design `AdminSponsors`, MVP): every
 * submitted application (never a draft), oldest submission first, filtered on the
 * server by status and submission date, in the backend's keyset pages. Each query is
 * recorded by the backend. No counts, owners, priorities or durations: none exist.
 */
export function ReviewQueue() {
  const t = useTranslations("controlPlane.sponsorReview");
  const common = useTranslations("controlPlane.users");
  const format = useFormatter();
  const locale = useLocale();
  const label = useAnswerLabels();
  const operator = useOperator().data;
  const [status, setStatus] = useState<ReviewStatus>();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);

  const filters: ReviewFilters = {
    ...(status && { status }),
    ...(dayStart(from) && { submitted_after: dayStart(from) }),
    ...(dayAfter(to) && { submitted_before: dayAfter(to) }),
  };
  const filterKey = JSON.stringify(filters);
  const [pagedFor, setPagedFor] = useState(filterKey);
  if (pagedFor !== filterKey) {
    setPagedFor(filterKey);
    setCursors([]);
  }

  const page = useReviewQueue(filters, cursors.at(-1));
  const forbidden =
    (isApiError(page.error) && page.error.status === 403) ||
    (operator != null && !grants(operator, "sponsors.applications.read"));

  let body;
  if (forbidden) {
    body = <Restricted />;
  } else if (page.isPending || (page.isFetching && page.isError)) {
    body = (
      <div
        role="status"
        aria-busy="true"
        aria-label={t("queue.loading")}
        className="flex flex-col gap-2"
      >
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    );
  } else if (page.isError) {
    body = (
      <section className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5">
        <Badge variant="destructive" className="gap-1.5 uppercase">
          <AlertTriangleIcon aria-hidden className="size-3.5" />
          {common("error.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{common("error.title")}</h2>
        <p role="alert" className="type-body-sm text-muted-foreground">
          {common("error.body")}
        </p>
        <Button onClick={() => void page.refetch()}>{common("error.retry")}</Button>
      </section>
    );
  } else if (page.data.applications.length === 0) {
    body = (
      <section
        role="status"
        data-review-state="empty"
        className="flex max-w-155 flex-col items-start gap-2.5 rounded-3xl border bg-surface p-6.5"
      >
        <Badge variant="neutral" className="gap-1.5 uppercase">
          <InboxIcon aria-hidden className="size-3.5" />
          {t("queue.empty.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{t("queue.empty.title")}</h2>
        <p className="type-body-sm text-muted-foreground">{t("queue.empty.body")}</p>
      </section>
    );
  } else {
    const next = page.data.next_cursor;
    body = (
      <div className="flex flex-col gap-3">
        <div className="overflow-x-auto rounded-3xl border bg-surface">
          <table className="w-full min-w-180 text-left" data-review-state="ready">
            <caption className="sr-only">{t("queue.caption")}</caption>
            <thead>
              <tr className="border-b type-label text-faint-foreground">
                <th scope="col" className="p-4">
                  {t("queue.columns.organization")}
                </th>
                <th scope="col" className="p-4">
                  {t("queue.columns.country")}
                </th>
                <th scope="col" className="p-4">
                  {t("queue.columns.submitted")}
                </th>
                <th scope="col" className="p-4">
                  {t("queue.columns.status")}
                </th>
                <th scope="col" className="p-4">
                  {t("queue.columns.documents")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {page.data.applications.map((row) => (
                <tr key={row.application_id} data-application={row.application_id}>
                  <th scope="row" className="max-w-70 p-4">
                    <Link
                      href={routeHref("web.admin.sponsors._sponsor-id", {
                        sponsorId: row.application_id,
                      })}
                      className="block truncate type-body-sm font-bold text-highlight underline-offset-4 hover:underline"
                    >
                      {row.company_name ?? t("noName")}
                    </Link>
                    <span className="block truncate type-caption text-faint-foreground">
                      {[
                        row.industry ? label.industry(row.industry) : null,
                        t("queue.submissions", { count: row.submissions }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </th>
                  <td className="p-4 type-body-sm text-muted-foreground">
                    {row.country_code ? countryName(row.country_code, locale) : "—"}
                  </td>
                  <td className="p-4 type-body-sm text-muted-foreground">
                    {format.dateTime(new Date(row.submitted_at), "date")}
                  </td>
                  <td className="p-4">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={row.status} />
                      {row.change_request_open && (
                        <span className="type-caption text-muted-foreground">
                          {t("queue.changeRequestOpen")}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="p-4 type-body-sm tabular-nums">{row.submitted_documents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav
          aria-label={t("queue.pages.label")}
          className="flex items-center justify-between gap-3"
        >
          <Button
            variant="quiet"
            disabled={cursors.length === 0}
            onClick={() => setCursors((stack) => stack.slice(0, -1))}
          >
            {t("queue.pages.previous")}
          </Button>
          <span className="type-caption text-faint-foreground">
            {t("queue.pages.page", { page: cursors.length + 1 })}
          </span>
          <Button
            variant="quiet"
            disabled={!next}
            onClick={() => next && setCursors((stack) => [...stack, next])}
          >
            {t("queue.pages.next")}
          </Button>
        </nav>
      </div>
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
        {!forbidden && (
          <Button
            variant="quiet"
            size="sm"
            loading={page.isFetching}
            onClick={() => void page.refetch()}
          >
            <RefreshCwIcon aria-hidden />
            {t("queue.refresh")}
          </Button>
        )}
      </PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">
        {!forbidden && (
          <form
            role="search"
            aria-label={t("queue.filters.label")}
            onSubmit={(event) => event.preventDefault()}
            className="grid gap-3 rounded-3xl border bg-surface p-5 sm:grid-cols-3 sm:items-end"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="review-filter-status">{t("queue.filters.status")}</Label>
              <Select
                value={status ?? ANY}
                onValueChange={(value) =>
                  setStatus(value === ANY ? undefined : (value as ReviewStatus))
                }
              >
                <SelectTrigger id="review-filter-status" className="h-11 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>{t("queue.filters.any")}</SelectItem>
                  {REVIEW_STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`status.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="review-filter-from">{t("queue.filters.from")}</Label>
              <Input
                id="review-filter-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="review-filter-to">{t("queue.filters.to")}</Label>
              <Input
                id="review-filter-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </div>
            <p className="type-caption text-faint-foreground sm:col-span-3">{t("queue.note")}</p>
          </form>
        )}
        {body}
      </PageBody>
    </div>
  );
}
