"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { useSponsorApplication } from "@/entities/sponsor-application";
import type { SponsorOrganizationAccess } from "@/entities/sponsor-organization";
import { SponsorTile } from "@/features/session-gate";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";

import { SponsorSuspendedNotice } from "./sponsor-states";
import { useSponsorWorkspace } from "./sponsor-workspace";

/**
 * SPX4 Sponsor overview, MVP (`web.sponsor.dashboard`, SF-117), inside the
 * portal of the organization in the path. Everything shown is the backend's:
 * the organization (name, status), the viewer's role, and the approved
 * application only when it is the viewer's own and created this organization.
 * Campaigns, opportunities, analytics and invoices don't exist, so they are
 * said not to exist, never drawn as numbers. Not built: the first run and
 * tour (SRW1, SRW2), "Needs you" and the owner's actions (no domain yet).
 */
export function SponsorOverview() {
  return <SponsorOverviewView access={useSponsorWorkspace()} />;
}

export function SponsorOverviewView({ access }: { access: SponsorOrganizationAccess }) {
  const t = useTranslations("sponsorPortal");
  const { organization, membership } = access;
  const suspended = organization.status === "suspended";
  const application = useSponsorApplication();
  const own =
    application.data?.status === "approved" &&
    application.data.sponsor_id === organization.sponsor_id;

  return (
    <div
      data-sponsor-overview
      data-sponsor-id={organization.sponsor_id}
      className="flex min-h-full flex-col"
    >
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate type-label text-faint-foreground">{t("overview.eyebrow")}</p>
          <h1 className="type-h3 font-display">{t("overview.title")}</h1>
        </div>
      </PageHeader>
      <PageBody className="grid content-start gap-4 pt-5.5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {suspended && <SponsorSuspendedNotice />}
          <Card
            id="sponsor-organization"
            title={t("overview.organization.label")}
            aside={
              <Badge variant={suspended ? "warning" : "accent"}>
                {t(`statuses.${organization.status}`)}
              </Badge>
            }
          >
            <div className="flex min-w-0 items-center gap-3">
              <SponsorTile />
              <p className="min-w-0 type-title font-display break-words">
                {organization.display_name}
              </p>
            </div>
            <p className="type-body-sm text-muted-foreground">
              {t("overview.organization.role", { role: t(`roles.${membership.role}`) })}
            </p>
          </Card>
          {own && (
            <Card
              id="sponsor-application"
              title={t("overview.application.label")}
              aside={<Badge variant="success">{t("overview.application.status")}</Badge>}
            >
              <p className="type-body-sm font-extrabold">{t("overview.application.title")}</p>
              <p className="type-body-sm text-muted-foreground">{t("overview.application.body")}</p>
              <Button asChild variant="quiet" className="w-fit">
                <Link href={routeHref("web.partners.apply", {}, { step: "status" })}>
                  {t("overview.application.action")}
                </Link>
              </Button>
            </Card>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Card id="sponsor-not-yet" title={t("overview.notYet.title")}>
            <p className="type-body-sm text-muted-foreground">{t("overview.notYet.body")}</p>
          </Card>
        </div>
      </PageBody>
    </div>
  );
}

function Card({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex min-w-0 flex-col gap-3.5 rounded-3xl border bg-surface px-5 py-4.5"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="type-label text-faint-foreground">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
