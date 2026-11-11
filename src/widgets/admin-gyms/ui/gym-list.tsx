"use client";

import { AlertTriangleIcon, SearchXIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import {
  GYM_LIFECYCLES,
  GYM_VERIFICATIONS,
  useGymPage,
  type GymFilters,
} from "@/entities/admin-oversight";
import { grants, useOperator } from "@/entities/operator";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";

import { LifecycleBadge, Restricted, VerificationBadge } from "./gym-parts";

const ANY = "any";
const DEBOUNCE_MS = 300;
const COUNTRY = /^[A-Z]{2}$/;

/**
 * AD2, the gym list (SF-123; Claude Design `AdminTenants`, MVP): every gym's own state,
 * newest first, filtered by name prefix, lifecycle, verification and country on the
 * server, in keyset pages. No member data, no publication state (none exists) and no
 * bulk export. Each query is keyed by its exact filters and page, so an answer to an
 * older filter never shows as the current one.
 */
export function GymList() {
  const t = useTranslations("controlPlane.gyms");
  const common = useTranslations("controlPlane.users");
  const format = useFormatter();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [lifecycle, setLifecycle] = useState<GymFilters["lifecycle"]>();
  const [verification, setVerification] = useState<GymFilters["verification"]>();
  const [country, setCountry] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(name.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [name]);

  const code = country.trim().toUpperCase();
  const filters: GymFilters = {
    ...(query !== "" && { query }),
    ...(lifecycle && { lifecycle }),
    ...(verification && { verification }),
    ...(COUNTRY.test(code) && { country: code }),
  };
  const filterKey = JSON.stringify(filters);
  const [pagedFor, setPagedFor] = useState(filterKey);
  if (pagedFor !== filterKey) {
    setPagedFor(filterKey);
    setCursors([]);
  }

  const page = useGymPage(filters, cursors.at(-1));
  // The backend refused, or the operator's grants (re-read on focus) no longer include
  // `gyms.read`: nothing read before is shown any more.
  const operator = useOperator().data;
  const forbidden =
    (isApiError(page.error) && page.error.status === 403) ||
    (operator != null && !grants(operator, "gyms.read"));

  let body;
  if (forbidden) {
    body = <Restricted />;
  } else if (page.isPending || page.isFetching) {
    body = (
      <div role="status" aria-busy="true" aria-label={t("loading")} className="flex flex-col gap-2">
        <Skeleton className="h-12 w-full rounded-lg" />
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
  } else if (page.data.gyms.length === 0) {
    body = (
      <section
        role="status"
        data-gyms-state="empty"
        className="flex max-w-155 flex-col items-start gap-2.5 rounded-3xl border bg-surface p-6.5"
      >
        <Badge variant="neutral" className="gap-1.5 uppercase">
          <SearchXIcon aria-hidden className="size-3.5" />
          {t("empty.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{t("empty.title")}</h2>
        <p className="type-body-sm text-muted-foreground">{t("empty.body")}</p>
      </section>
    );
  } else {
    const next = page.data.next_cursor;
    body = (
      <div className="flex flex-col gap-3">
        <div className="overflow-x-auto rounded-3xl border bg-surface">
          <table className="w-full min-w-180 text-left" data-gyms-state="ready">
            <caption className="sr-only">{t("table.caption")}</caption>
            <thead>
              <tr className="border-b type-label text-faint-foreground">
                <th scope="col" className="p-4">
                  {t("table.gym")}
                </th>
                <th scope="col" className="p-4">
                  {t("table.lifecycle")}
                </th>
                <th scope="col" className="p-4">
                  {t("table.verification")}
                </th>
                <th scope="col" className="p-4">
                  {t("table.location")}
                </th>
                <th scope="col" className="p-4">
                  {t("table.staff")}
                </th>
                <th scope="col" className="p-4">
                  {t("table.created")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {page.data.gyms.map((gym) => (
                <tr key={gym.id} data-gym={gym.id}>
                  <th scope="row" className="max-w-70 p-4">
                    <Link
                      href={routeHref("web.admin.tenants._tenant-id", { tenantId: gym.id })}
                      className="block truncate type-body-sm font-bold text-highlight underline-offset-4 hover:underline"
                    >
                      {gym.name}
                    </Link>
                    <span className="block truncate type-caption text-faint-foreground">
                      {t(`gymType.${gym.gym_type}`)}
                    </span>
                  </th>
                  <td className="p-4">
                    <LifecycleBadge lifecycle={gym.lifecycle} />
                  </td>
                  <td className="p-4">
                    <VerificationBadge status={gym.verification_status} />
                  </td>
                  <td className="p-4 type-body-sm text-muted-foreground">
                    {gym.country_code
                      ? `${gym.city ?? ""}${gym.city ? ", " : ""}${gym.country_code}`
                      : t("noLocation")}
                  </td>
                  <td className="p-4 type-body-sm tabular-nums">{gym.staff_count}</td>
                  <td className="p-4 type-body-sm text-muted-foreground">
                    {format.dateTime(new Date(gym.created_at), "date")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav aria-label={t("pages.label")} className="flex items-center justify-between gap-3">
          <Button
            variant="quiet"
            disabled={cursors.length === 0}
            onClick={() => setCursors((stack) => stack.slice(0, -1))}
          >
            {t("pages.previous")}
          </Button>
          <span className="type-caption text-faint-foreground">
            {t("pages.page", { page: cursors.length + 1 })}
          </span>
          <Button
            variant="quiet"
            disabled={!next}
            onClick={() => next && setCursors((stack) => [...stack, next])}
          >
            {t("pages.next")}
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
      </PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">
        {!forbidden && (
          <form
            role="search"
            aria-label={t("filters.label")}
            onSubmit={(event) => event.preventDefault()}
            className="grid gap-3 rounded-3xl border bg-surface p-5 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="gym-filter-name">{t("filters.name")}</Label>
              <Input
                id="gym-filter-name"
                value={name}
                maxLength={80}
                autoComplete="off"
                spellCheck={false}
                placeholder={t("filters.namePlaceholder")}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <FilterSelect
              id="gym-filter-lifecycle"
              label={t("filters.lifecycle")}
              any={t("filters.any")}
              value={lifecycle}
              options={GYM_LIFECYCLES.map((value) => [value, t(`lifecycle.${value}`)])}
              onChange={(value) => setLifecycle(value as GymFilters["lifecycle"])}
            />
            <FilterSelect
              id="gym-filter-verification"
              label={t("filters.verification")}
              any={t("filters.any")}
              value={verification}
              options={GYM_VERIFICATIONS.map((value) => [value, t(`verification.${value}`)])}
              onChange={(value) => setVerification(value as GymFilters["verification"])}
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="gym-filter-country">{t("filters.country")}</Label>
              <Input
                id="gym-filter-country"
                value={country}
                maxLength={2}
                autoComplete="off"
                spellCheck={false}
                placeholder={t("filters.countryPlaceholder")}
                aria-describedby="gym-filter-country-hint"
                onChange={(event) => setCountry(event.target.value)}
              />
              <p id="gym-filter-country-hint" className="type-caption text-faint-foreground">
                {t("filters.countryHint")}
              </p>
            </div>
            <p className="type-caption text-faint-foreground sm:col-span-2 lg:col-span-4">
              {t("note")}
            </p>
          </form>
        )}
        {body}
        {!forbidden && <p className="type-caption text-faint-foreground">{t("publicationNote")}</p>}
      </PageBody>
    </div>
  );
}

function FilterSelect({
  id,
  label,
  any,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  any: string;
  value: string | undefined;
  options: [string, string][];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? ANY}
        onValueChange={(next) => onChange(next === ANY ? undefined : next)}
      >
        <SelectTrigger id={id} className="h-11 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{any}</SelectItem>
          {options.map(([option, name]) => (
            <SelectItem key={option} value={option}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
