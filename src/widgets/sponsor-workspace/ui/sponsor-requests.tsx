"use client";

import { ChevronRightIcon, MessageSquareWarningIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import type { SponsorOrganizationAccess } from "@/entities/sponsor-organization";
import {
  PROPOSAL_STATUSES,
  ProposalStatusBadge,
  usePartnershipProposals,
  type PartnershipProposalSummary,
  type ProposalStatus,
} from "@/entities/sponsor-partnership";
import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { FailureView } from "@/widgets/system-states";

import { PartnershipPage, useRecheckOnNotFound } from "./partnership-parts";
import { useSponsorWorkspace } from "./sponsor-workspace";

/**
 * `web.sponsor.requests` (SF-131): the organization's nonbinding partnership
 * requests (SF-130 proposals), newest first, by status (`?status=`, links so
 * the filter is shareable and back-button safe), page by page. "New request"
 * appears only when the backend's `can_create` says so (owner or manager of an
 * active organization below its open limit). No artboard (D-SF131-PARTNERSHIP-BOARDS).
 */
export function SponsorRequests({ status }: { status: ProposalStatus | undefined }) {
  return <SponsorRequestsView access={useSponsorWorkspace()} status={status} />;
}

export function SponsorRequestsView({
  access,
  status,
}: {
  access: SponsorOrganizationAccess;
  status: ProposalStatus | undefined;
}) {
  const t = useTranslations("sponsorPartnerships.requests");
  const s = useTranslations("sponsorPartnerships.statuses");
  const sponsorId = access.organization.sponsor_id;
  const query = usePartnershipProposals(sponsorId, status);
  const notFound = useRecheckOnNotFound(sponsorId, query.error);
  const pages = query.data?.pages.filter((page) => page.sponsor_id === sponsorId) ?? [];
  const rows = pages.flatMap((page) => page.proposals);
  const canCreate = pages[0]?.can_create === true;

  return (
    <PartnershipPage
      access={access}
      title={t("title")}
      state="requests"
      actions={
        canCreate ? (
          <Button asChild>
            <Link href={routeHref("web.sponsor.requests.new", { sponsorId })}>{t("new")}</Link>
          </Button>
        ) : undefined
      }
    >
      <p className="max-w-160 type-body-sm text-muted-foreground">{t("lead")}</p>
      <nav aria-label={t("filterLabel")} className="-mx-1 overflow-x-auto px-1 pb-1">
        <ul className="flex w-max gap-2">
          {[undefined, ...PROPOSAL_STATUSES].map((key) => (
            <li key={key ?? "all"}>
              <Link
                href={routeHref(
                  "web.sponsor.requests",
                  { sponsorId },
                  key === undefined ? {} : { status: key },
                )}
                aria-current={key === status ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center rounded-xl border px-3.5 type-body-sm font-bold whitespace-nowrap",
                  key === status
                    ? "border-primary-muted bg-accent text-accent-foreground"
                    : "border-border text-muted-foreground",
                )}
              >
                {key === undefined ? t("all") : s(key)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {query.isError && !notFound && rows.length === 0 ? (
        <FailureView error={query.error} onRetry={() => void query.refetch()} />
      ) : query.isPending || (notFound && rows.length === 0) ? (
        <Skeleton className="h-40 w-full rounded-3xl lg:max-w-200" />
      ) : rows.length === 0 ? (
        <section
          data-requests-empty
          className="flex flex-col items-start gap-2 rounded-3xl border bg-surface px-6 py-8 lg:max-w-200"
        >
          <h2 className="type-title font-display">
            {status === undefined ? t("emptyTitle") : t("emptyFiltered")}
          </h2>
          <p className="max-w-130 type-body-sm text-muted-foreground">
            {canCreate ? t("emptyBody") : t("emptyReadOnly")}
          </p>
        </section>
      ) : (
        <ul aria-label={t("listLabel")} className="flex flex-col gap-2 lg:max-w-200">
          {rows.map((row) => (
            <RequestRow key={row.proposal_id} sponsorId={sponsorId} row={row} />
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <Button
          type="button"
          variant="quiet"
          className="w-fit"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? t("loading") : t("more")}
        </Button>
      )}
      {query.isError && rows.length > 0 && (
        <p role="alert" className="type-caption text-destructive-subtle-foreground">
          {t("moreFailed")}
        </p>
      )}
    </PartnershipPage>
  );
}

function RequestRow({ sponsorId, row }: { sponsorId: string; row: PartnershipProposalSummary }) {
  const t = useTranslations("sponsorPartnerships.requests");
  const format = useFormatter();
  const title = row.title ?? t("untitled");
  return (
    <li>
      <Link
        href={routeHref("web.sponsor.requests._request-id", {
          sponsorId,
          requestId: row.proposal_id,
        })}
        data-request-row={row.proposal_id}
        className="flex min-h-16 items-center gap-3 rounded-2xl border bg-surface px-4 py-3 outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate type-body-sm font-extrabold">{title}</span>
          <span className="type-caption text-muted-foreground">
            {row.submitted_at === null
              ? t("created", { date: format.dateTime(new Date(row.created_at), "date") })
              : t("submitted", { date: format.dateTime(new Date(row.submitted_at), "date") })}
          </span>
        </span>
        {row.change_request_open && row.status === "changes_requested" && (
          <MessageSquareWarningIcon aria-hidden className="size-4 flex-none text-warning" />
        )}
        <ProposalStatusBadge status={row.status} />
        <ChevronRightIcon aria-hidden className="size-4 flex-none text-faint-foreground" />
      </Link>
    </li>
  );
}
