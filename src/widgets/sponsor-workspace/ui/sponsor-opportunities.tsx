"use client";

import { CircleSlashIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { SponsorOrganizationAccess } from "@/entities/sponsor-organization";
import { usePartnershipOpportunities } from "@/entities/sponsor-partnership";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { FailureView } from "@/widgets/system-states";

import { PartnershipPage, useRecheckOnNotFound } from "./partnership-parts";
import { useSponsorWorkspace } from "./sponsor-workspace";

/**
 * `web.sponsor.opportunities` (SF-131): SPE1 "No sponsorship opportunities",
 * from the backend's answer (SF-130 `GET …/partnership-opportunities`:
 * `unavailable`, `no_inventory`; D-SA21). No inventory exists, so nothing is
 * listed, no example is drawn and no "Apply" action exists. It points to
 * what does exist: the organization's interests and its partnership requests.
 */
export function SponsorOpportunities() {
  return <SponsorOpportunitiesView access={useSponsorWorkspace()} />;
}

export function SponsorOpportunitiesView({ access }: { access: SponsorOrganizationAccess }) {
  const t = useTranslations("sponsorPartnerships.opportunities");
  const sponsorId = access.organization.sponsor_id;
  const query = usePartnershipOpportunities(sponsorId);
  const notFound = useRecheckOnNotFound(sponsorId, query.error);
  const answer = query.data?.sponsor_id === sponsorId ? query.data : undefined;

  return (
    <PartnershipPage access={access} title={t("title")} state="opportunities">
      {answer !== undefined ? (
        <section
          aria-labelledby="opportunities-state"
          data-opportunities={answer.availability}
          data-reason={answer.reason}
          className="flex flex-col items-start gap-2.5 rounded-3xl border bg-surface px-6 py-10 lg:max-w-200"
        >
          <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-highlight">
            <CircleSlashIcon aria-hidden className="size-5" />
          </span>
          <h2 id="opportunities-state" className="type-title font-display">
            {t("noneTitle")}
          </h2>
          <p className="max-w-130 type-body-sm text-muted-foreground">{t("noneBody")}</p>
          <p className="max-w-130 type-body-sm text-muted-foreground">{t("instead")}</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="quiet">
              <Link href={routeHref("web.sponsor.requests", { sponsorId })}>{t("requests")}</Link>
            </Button>
            <Button asChild variant="quiet">
              <Link href={routeHref("web.sponsor.interests", { sponsorId })}>{t("interests")}</Link>
            </Button>
          </div>
        </section>
      ) : query.isError && !notFound ? (
        <FailureView error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <Skeleton className="h-56 w-full rounded-3xl lg:max-w-200" />
      )}
    </PartnershipPage>
  );
}
