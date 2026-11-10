"use client";

import { useFormatter, useTranslations } from "next-intl";

import { AnswerSummary, useSponsorApplication } from "@/entities/sponsor-application";
import type { SponsorOrganizationAccess } from "@/entities/sponsor-organization";
import { Badge } from "@/shared/ui/badge";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { FailureView } from "@/widgets/system-states";

import { useSponsorWorkspace } from "./sponsor-workspace";

/**
 * The organization's application inside its portal (`web.sponsor.application`,
 * SF-118). Only the viewer's own application is readable
 * (`GET /api/v1/me/sponsor-application`), so it is shown, read-only, only when
 * it is the approved application that created this organization; other
 * members are told that only the applicant can see it (no endpoint shares an
 * organization's application with its members).
 */
export function SponsorApplicationPage() {
  return <SponsorApplicationView access={useSponsorWorkspace()} />;
}

export function SponsorApplicationView({ access }: { access: SponsorOrganizationAccess }) {
  const t = useTranslations("sponsorPortal.application");
  const format = useFormatter();
  const query = useSponsorApplication();
  const application = query.data;
  const own =
    application !== undefined &&
    application !== null &&
    application.status === "approved" &&
    application.sponsor_id === access.organization.sponsor_id;

  let body;
  if (query.isError) {
    body = <FailureView error={query.error} onRetry={() => void query.refetch()} />;
  } else if (application === undefined) {
    body = <Skeleton className="h-48 rounded-3xl" />;
  } else if (own) {
    body = (
      <section
        aria-labelledby="sponsor-application-own"
        data-sponsor-application="own"
        className="flex min-w-0 flex-col gap-4 rounded-3xl border bg-surface px-5 py-4.5 lg:max-w-200"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="sponsor-application-own" className="type-title font-display">
            {t("own.title")}
          </h2>
          <Badge variant="success">{t("own.status")}</Badge>
        </div>
        {application.submitted_at !== null && (
          <p className="type-body-sm text-muted-foreground">
            {t("own.submitted", {
              date: format.dateTime(new Date(application.submitted_at), "date"),
            })}
          </p>
        )}
        <h3 className="type-label text-faint-foreground">{t("own.answers")}</h3>
        <AnswerSummary answers={application.answers} detailed />
      </section>
    );
  } else {
    body = (
      <section
        aria-labelledby="sponsor-application-other"
        data-sponsor-application="other"
        className="flex min-w-0 flex-col gap-2 rounded-3xl border bg-surface px-5 py-4.5 lg:max-w-200"
      >
        <h2 id="sponsor-application-other" className="type-title font-display">
          {t("other.title")}
        </h2>
        <p className="type-body-sm text-muted-foreground">{t("other.body")}</p>
      </section>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate type-label text-faint-foreground">
            {access.organization.display_name}
          </p>
          <h1 className="type-h3 font-display">{t("title")}</h1>
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-4 pt-5.5">{body}</PageBody>
    </div>
  );
}
