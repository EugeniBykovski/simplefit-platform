"use client";

import { AlertTriangleIcon, SearchXIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

import { READ_REASONS, useAccountSearch, type ReadReason } from "@/entities/admin-user";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";

import { ContextList, Restricted, StatusBadge } from "./account-parts";
import { ReasonSelect } from "./reason-select";

/**
 * AD7, account search (SF-122; Claude Design `AdminUsers`, MVP): an exact email address
 * or user id with a recorded reason; at most one result, masked. There's no list of
 * accounts and no partial match: the backend decides both.
 */
export function AccountSearch() {
  const t = useTranslations("controlPlane.users");
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
        <AccountSearchPanel />
      </PageBody>
    </div>
  );
}

/** AD7's account search without the page chrome, for `UserExplorer`'s Accounts tab. */
export function AccountSearchPanel() {
  const t = useTranslations("controlPlane.users");
  const format = useFormatter();
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState<ReadReason>();
  const [submitted, setSubmitted] = useState<{ query: string; reason: ReadReason } | null>(null);
  const search = useAccountSearch(submitted);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed === "" || reason === undefined) return;
    setSubmitted({ query: trimmed, reason });
  };

  const forbidden = isApiError(search.error) && search.error.status === 403;
  const limited = isApiError(search.error) && search.error.status === 429;

  let body;
  if (forbidden) {
    body = <Restricted />;
  } else if (submitted === null) {
    body = <p className="type-body-sm text-muted-foreground">{t("search.idle")}</p>;
  } else if (search.isFetching) {
    body = (
      <div role="status" aria-label={t("searching")} aria-busy="true">
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  } else if (search.isError) {
    body = (
      <section className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5">
        <Badge variant="destructive" className="gap-1.5 uppercase">
          <AlertTriangleIcon aria-hidden className="size-3.5" />
          {t("error.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{t("error.title")}</h2>
        <p role="alert" className="type-body-sm text-muted-foreground">
          {limited ? t("search.rateLimited") : t("error.body")}
        </p>
        <Button onClick={() => void search.refetch()}>{t("error.retry")}</Button>
      </section>
    );
  } else if (search.data?.length === 0) {
    body = (
      <section
        role="status"
        data-search-state="no-match"
        className="flex max-w-155 flex-col items-start gap-2.5 rounded-3xl border bg-surface p-6.5"
      >
        <Badge variant="neutral" className="gap-1.5 uppercase">
          <SearchXIcon aria-hidden className="size-3.5" />
          {t("search.noMatch.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{t("search.noMatch.title")}</h2>
        <p className="type-body-sm text-muted-foreground">{t("search.noMatch.body")}</p>
      </section>
    );
  } else if (search.data && submitted) {
    body = (
      <section aria-labelledby="account-search-result" className="flex flex-col gap-3">
        <h2 id="account-search-result" className="type-title font-display">
          {t("search.result")}
        </h2>
        <ul className="flex flex-col divide-y rounded-3xl border bg-surface">
          {search.data.map((account) => (
            <li
              key={account.id}
              data-search-result={account.id}
              className="grid gap-3 p-4 sm:grid-cols-5 sm:items-center"
            >
              <div className="flex min-w-0 flex-col sm:col-span-2">
                <Link
                  href={routeHref(
                    "web.admin.users._user-id",
                    { userId: account.id },
                    { reason: submitted.reason },
                  )}
                  className="truncate type-body-sm font-bold text-highlight underline-offset-4 hover:underline"
                >
                  {account.name ?? t("detail.noName")}
                </Link>
                <span className="truncate type-caption text-faint-foreground">{account.id}</span>
              </div>
              <span className="truncate type-body-sm text-muted-foreground">
                <span className="sr-only">{t("search.columns.email")}: </span>
                {account.masked_emails.join(", ") || "—"}
              </span>
              <ContextList contexts={account.contexts} />
              <span className="flex items-center gap-2">
                <StatusBadge status={account.status} />
                <span className="type-caption text-faint-foreground">
                  {format.dateTime(new Date(account.joined_at), "date")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <>
      <form
        role="search"
        onSubmit={submit}
        className="grid gap-3 rounded-3xl border bg-surface p-5 md:grid-cols-5 md:items-end"
      >
        <div className="flex min-w-0 flex-col gap-1.5 md:col-span-2">
          <Label htmlFor="account-search-query">
            {t("search.label")} <span aria-hidden>*</span>
          </Label>
          <Input
            id="account-search-query"
            value={query}
            required
            maxLength={320}
            autoComplete="off"
            spellCheck={false}
            placeholder={t("search.placeholder")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <ReasonSelect
            id="account-search-reason"
            label={t("search.reason")}
            placeholder={t("search.reasonPlaceholder")}
            reasons={READ_REASONS}
            value={reason}
            onChange={(value) => setReason(value as ReadReason)}
          />
        </div>
        <Button
          type="submit"
          className="h-11"
          disabled={query.trim() === "" || reason === undefined}
          loading={search.isFetching}
        >
          {t("search.submit")}
        </Button>
        <p className="type-caption text-faint-foreground md:col-span-5">{t("search.note")}</p>
      </form>
      {body}
    </>
  );
}
