"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";

import { useAnswerLabels } from "@/entities/sponsor-application";
import {
  sponsorOrganizationQueryKey,
  type SponsorOrganizationAccess,
} from "@/entities/sponsor-organization";
import { isApiError } from "@/shared/api/http/api-error";
import { PageBody, PageHeader } from "@/shared/ui/page";

import { SponsorSuspendedNotice } from "./sponsor-states";

/**
 * The frame of a partnership page (SF-131): the organization's name as the
 * eyebrow, the page title, header actions, and the suspended notice when the
 * organization is read-only. Same composition as SPX9 (SF-118).
 */
export function PartnershipPage({
  access,
  title,
  state,
  actions,
  children,
}: {
  access: SponsorOrganizationAccess;
  title: string;
  /** `data-sponsor-partnerships` for tests and measurements. */
  state: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { organization } = access;
  return (
    <div data-sponsor-partnerships={state} className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate type-label text-faint-foreground">{organization.display_name}</p>
          <h1 className="type-h3 font-display break-words">{title}</h1>
        </div>
        {actions && <div className="ms-auto flex flex-wrap gap-2">{actions}</div>}
      </PageHeader>
      <PageBody className="flex flex-col gap-4 pt-5.5">
        {organization.status === "suspended" && <SponsorSuspendedNotice />}
        {children}
      </PageBody>
    </div>
  );
}

/** A card section of a partnership page. */
export function PartnershipCard({
  title,
  lead,
  actions,
  children,
  labelledBy,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  labelledBy: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className="flex min-w-0 flex-col gap-4 rounded-3xl border bg-surface px-5 py-4.5 lg:max-w-200"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={labelledBy} className="type-title font-display">
            {title}
          </h2>
          {lead && <p className="type-body-sm text-muted-foreground">{lead}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A read-only answer: label and value; an empty value is said, never invented. */
export function AnswerRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:gap-6">
      <dt className="type-body-sm text-muted-foreground sm:w-44 sm:flex-none">{label}</dt>
      <dd className="min-w-0 type-body-sm font-bold break-words whitespace-pre-line">{children}</dd>
    </div>
  );
}

/** The interest and market answers as words (codes are labelled, never guessed). */
export function useMarketWords() {
  const t = useTranslations("sponsorPartnerships");
  const labels = useAnswerLabels();
  const format = useFormatter();
  const none = t("view.none");
  return {
    none,
    interests: (codes: readonly string[]) =>
      codes.length === 0 ? none : format.list(codes.map(labels.interest)),
    markets: (scope: string | null, countries: readonly string[], cities: readonly string[]) => {
      if (scope === null) return none;
      if (scope === "global") return labels.scope("global");
      const places = [...countries.map(labels.country), ...cities];
      return places.length === 0 ? labels.scope(scope) : format.list(places);
    },
  };
}

/**
 * When a partnership read answers 404 the membership may have ended: the
 * organization is read again, and the portal replaces the page with its
 * not-available state if so. Otherwise the page shows its own not-found.
 */
export function useRecheckOnNotFound(sponsorId: string, error: unknown) {
  const client = useQueryClient();
  const notFound = isApiError(error) && error.status === 404;
  useEffect(() => {
    if (notFound) {
      void client.invalidateQueries({ queryKey: sponsorOrganizationQueryKey(sponsorId) });
    }
  }, [notFound, client, sponsorId]);
  return notFound;
}
