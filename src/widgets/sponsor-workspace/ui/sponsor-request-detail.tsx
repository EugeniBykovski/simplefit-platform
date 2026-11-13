"use client";

import { ArrowLeftIcon, InfoIcon, MessageSquareWarningIcon, SearchXIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import type { SponsorOrganizationAccess } from "@/entities/sponsor-organization";
import {
  isKnownStatus,
  ProposalStatusBadge,
  usePartnershipPolicy,
  usePartnershipProposal,
  useProposalStatusLabel,
  type PartnershipProposal,
} from "@/entities/sponsor-partnership";
import { ProposalCommands, ProposalForm } from "@/features/sponsor-partnership-manage";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { Skeleton } from "@/shared/ui/skeleton";
import { FailureView } from "@/widgets/system-states";

import {
  AnswerRow,
  PartnershipCard,
  PartnershipPage,
  useMarketWords,
  useRecheckOnNotFound,
} from "./partnership-parts";
import { useSponsorWorkspace } from "./sponsor-workspace";

/**
 * `web.sponsor.requests._request-id` (SF-131): one partnership request of the
 * organization in the path (SF-130 `GET …/partnership-proposals/{id}`; any
 * other organization's id answers 404). Everything shown is the backend's:
 * the status and what it means, the change request SimpleFit sent, the
 * answers, what a submission still needs, the status history (SimpleFit's
 * reviewer is never named) and the actions `allowed_actions` reports for
 * this viewer. No transition is derived here. An unknown status is said to
 * be unknown. Accepted means SimpleFit will follow up; nothing is agreed,
 * booked or paid.
 */
export function SponsorRequestDetail({ requestId }: { requestId: string }) {
  return <SponsorRequestDetailView access={useSponsorWorkspace()} requestId={requestId} />;
}

export function SponsorRequestDetailView({
  access,
  requestId,
}: {
  access: SponsorOrganizationAccess;
  requestId: string;
}) {
  const t = useTranslations("sponsorPartnerships.detail");
  const sponsorId = access.organization.sponsor_id;
  const query = usePartnershipProposal(sponsorId, requestId);
  const notFound = useRecheckOnNotFound(sponsorId, query.error);
  const proposal =
    query.data?.sponsor_id === sponsorId && query.data.proposal_id === requestId
      ? query.data
      : undefined;
  const list = routeHref("web.sponsor.requests", { sponsorId });

  return (
    <PartnershipPage
      access={access}
      title={proposal === undefined ? t("title") : (proposal.answers.title ?? t("untitled"))}
      state="detail"
      actions={
        <Button asChild variant="ghost">
          <Link href={list}>
            <ArrowLeftIcon aria-hidden className="size-4" />
            {t("back")}
          </Link>
        </Button>
      }
    >
      {proposal !== undefined ? (
        <Detail key={proposal.proposal_id} sponsorId={sponsorId} proposal={proposal} />
      ) : notFound ? (
        <section
          role="status"
          data-request-missing
          className="flex flex-col items-start gap-2.5 rounded-3xl border bg-surface px-6 py-8 lg:max-w-200"
        >
          <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-highlight">
            <SearchXIcon aria-hidden className="size-5" />
          </span>
          <p className="type-title font-display">{t("missingTitle")}</p>
          <p className="max-w-130 type-body-sm text-muted-foreground">{t("missingBody")}</p>
        </section>
      ) : query.isError ? (
        <FailureView error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Skeleton className="h-96 w-full rounded-3xl lg:max-w-200" />
      )}
    </PartnershipPage>
  );
}

function Detail({ sponsorId, proposal }: { sponsorId: string; proposal: PartnershipProposal }) {
  const t = useTranslations("sponsorPartnerships.detail");
  const f = useTranslations("sponsorPartnerships.fields");
  const format = useFormatter();
  const words = useMarketWords();
  const statusLabel = useProposalStatusLabel();
  const policy = usePartnershipPolicy();
  const query = usePartnershipProposal(sponsorId, proposal.proposal_id);
  const [editing, setEditing] = useState(false);
  const reload = () => void query.refetch();
  const known = isKnownStatus(proposal.status);
  const answers = proposal.answers;
  const request = proposal.status === "changes_requested" ? proposal.change_request : null;
  const names = useTranslations("sponsorPartnerships.fieldNames");
  const fieldLabel = (field: string) =>
    names.has(field as "title") ? names(field as "title") : field;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ProposalStatusBadge status={proposal.status} />
        <span className="type-caption text-muted-foreground">{t("nonbinding")}</span>
      </div>

      <Notice
        tone={proposal.status === "accepted" ? "olive" : "muted"}
        icon={InfoIcon}
        className="lg:max-w-200"
        data-status-meaning={proposal.status}
      >
        {known ? t(`meaning.${proposal.status}`) : t("meaning.unknown")}
      </Notice>

      {request !== null && (
        <Notice
          tone="amber"
          icon={MessageSquareWarningIcon}
          className="lg:max-w-200"
          data-change-request
        >
          <span className="flex flex-col gap-1">
            <span className="font-extrabold">{t("changesTitle")}</span>
            <span className="whitespace-pre-line">{request.message}</span>
            <span>
              {t("changesFields", { fields: format.list(request.fields.map(fieldLabel)) })}
            </span>
          </span>
        </Notice>
      )}

      {editing && proposal.allowed_actions.edit ? (
        <PartnershipCard title={t("editTitle")} labelledBy="request-edit">
          {policy.data !== undefined ? (
            <ProposalForm
              sponsorId={sponsorId}
              policy={policy.data}
              proposal={proposal}
              onSaved={() => setEditing(false)}
              onCancel={() => setEditing(false)}
              onReload={() => {
                setEditing(false);
                reload();
              }}
            />
          ) : policy.isError ? (
            <FailureView error={policy.error} onRetry={() => void policy.refetch()} />
          ) : (
            <Skeleton className="h-96 w-full" />
          )}
        </PartnershipCard>
      ) : (
        <PartnershipCard
          title={t("answersTitle")}
          labelledBy="request-answers"
          actions={
            proposal.allowed_actions.edit ? (
              <Button type="button" variant="quiet" onClick={() => setEditing(true)}>
                {t("edit")}
              </Button>
            ) : undefined
          }
        >
          <dl className="flex flex-col gap-3">
            <AnswerRow label={f("title")}>{answers.title ?? words.none}</AnswerRow>
            <AnswerRow label={f("interests")}>{words.interests(answers.interests)}</AnswerRow>
            <AnswerRow label={names("market_scope")}>
              {words.markets(answers.market_scope, answers.market_countries, answers.market_cities)}
            </AnswerRow>
            <AnswerRow label={f("summary")}>{answers.summary ?? words.none}</AnswerRow>
          </dl>
          {proposal.missing_fields.length > 0 && proposal.allowed_actions.submit && (
            <p id="proposal-missing" className="type-caption text-warning-subtle-foreground">
              {t("missing", { fields: format.list(proposal.missing_fields.map(fieldLabel)) })}
            </p>
          )}
          <ProposalCommands sponsorId={sponsorId} proposal={proposal} onReload={reload} />
        </PartnershipCard>
      )}

      <PartnershipCard title={t("historyTitle")} labelledBy="request-history">
        <ol className="flex flex-col gap-2">
          {proposal.history.map((event) => (
            <li
              key={`${event.occurred_at}-${event.to_status}`}
              className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-border/60 pb-2 type-body-sm last:border-b-0"
            >
              <span>
                <span className="font-bold">{statusLabel(event.to_status)}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {event.actor === "simplefit" ? t("bySimplefit") : t("byOrganization")}
                </span>
              </span>
              <time dateTime={event.occurred_at} className="text-muted-foreground">
                {format.dateTime(new Date(event.occurred_at), "dateTime")}
              </time>
            </li>
          ))}
        </ol>
        <p className="type-caption text-faint-foreground">
          {proposal.created_by.is_viewer
            ? t("createdByYou")
            : proposal.created_by.short_name === null
              ? t("createdByMember")
              : t("createdBy", { name: proposal.created_by.short_name })}
        </p>
      </PartnershipCard>
    </>
  );
}
