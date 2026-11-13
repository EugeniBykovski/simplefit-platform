"use client";

import { InfoIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { SponsorOrganizationAccess } from "@/entities/sponsor-organization";
import { usePartnershipPolicy } from "@/entities/sponsor-partnership";
import { ProposalForm } from "@/features/sponsor-partnership-manage";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { Skeleton } from "@/shared/ui/skeleton";
import { FailureView } from "@/widgets/system-states";

import { PartnershipCard, PartnershipPage } from "./partnership-parts";
import { useSponsorWorkspace } from "./sponsor-workspace";

/**
 * `web.sponsor.requests.new` (SF-131): a new draft request (SF-130 `POST
 * …/partnership-proposals`), a nonbinding general inquiry that names no
 * opportunity (none exists, D-SA21). Offered when the viewer's membership
 * reports `manage_partnerships` in an active organization; the API checks
 * again (403, 409 suspended or at the open limit), and anyone else is told the
 * page is read-only for them. A saved draft opens on its own page, where it is
 * submitted.
 */
export function SponsorRequestNew() {
  return <SponsorRequestNewView access={useSponsorWorkspace()} />;
}

export function SponsorRequestNewView({ access }: { access: SponsorOrganizationAccess }) {
  const t = useTranslations("sponsorPartnerships.new");
  const router = useRouter();
  const sponsorId = access.organization.sponsor_id;
  const policy = usePartnershipPolicy();
  const writable =
    access.organization.status === "active" &&
    access.membership.permissions.includes("manage_partnerships");
  const list = routeHref("web.sponsor.requests", { sponsorId });

  return (
    <PartnershipPage access={access} title={t("title")} state="new">
      <Notice tone="muted" icon={InfoIcon} className="lg:max-w-200">
        {t("nonbinding")}
      </Notice>
      {!writable ? (
        <PartnershipCard title={t("readOnlyTitle")} labelledBy="request-new-readonly">
          <p className="type-body-sm text-muted-foreground">{t("readOnly")}</p>
          <Button asChild variant="quiet" className="w-fit">
            <Link href={list}>{t("back")}</Link>
          </Button>
        </PartnershipCard>
      ) : (
        <PartnershipCard title={t("formTitle")} lead={t("formLead")} labelledBy="request-new">
          {policy.data !== undefined ? (
            <ProposalForm
              sponsorId={sponsorId}
              policy={policy.data}
              proposal={null}
              onSaved={(saved) =>
                router.replace(
                  routeHref("web.sponsor.requests._request-id", {
                    sponsorId,
                    requestId: saved.proposal_id,
                  }),
                )
              }
              onCancel={() => router.push(list)}
            />
          ) : policy.isError ? (
            <FailureView error={policy.error} onRetry={() => void policy.refetch()} />
          ) : (
            <Skeleton className="h-96 w-full" />
          )}
        </PartnershipCard>
      )}
    </PartnershipPage>
  );
}
