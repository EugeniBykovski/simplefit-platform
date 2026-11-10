"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRef, type ReactNode } from "react";

import { useSponsorApplication } from "@/entities/sponsor-application";
import type { SponsorOrganizationAccess } from "@/entities/sponsor-organization";
import { SponsorTile } from "@/features/session-gate";
import { Link } from "@/shared/i18n/navigation";
import { countryName } from "@/shared/lib/countries";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";

import { useSponsorFirstRunFlow } from "./sponsor-first-run";
import { SponsorSuspendedNotice } from "./sponsor-states";
import { useSponsorWorkspace } from "./sponsor-workspace";

/**
 * SPX4 Sponsor overview, MVP (`web.sponsor.dashboard`, SF-117), inside the
 * portal of the organization in the path. Everything shown is the backend's:
 * the organization (name, status), the viewer's role, and the approved
 * application only when it is the viewer's own and created this organization.
 * Campaigns, opportunities, analytics and invoices don't exist, so they are
 * said not to exist, never drawn as numbers: SF-118 lists them as FUTURE,
 * neither links nor buttons. The access card states the membership's real
 * permissions. Not built: the first run and tour (SRW1, SRW2), "Needs you" and
 * the owner's actions (no domain yet).
 */
export function SponsorOverview() {
  const access = useSponsorWorkspace();
  // One overview per organization: switching remounts it, so the first run and an open
  // tour never carry over to another organization.
  return <SponsorOverviewView key={access.organization.sponsor_id} access={access} />;
}

export function SponsorOverviewView({ access }: { access: SponsorOrganizationAccess }) {
  const t = useTranslations("sponsorPortal");
  const locale = useLocale();
  const { organization, membership } = access;
  const sponsorId = organization.sponsor_id;
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRun = useSponsorFirstRunFlow(access, heading);
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
          <h1 ref={heading} tabIndex={-1} className="type-h3 font-display outline-none">
            {t("overview.title")}
          </h1>
        </div>
      </PageHeader>
      <PageBody className="grid content-start gap-4 pt-5.5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {suspended && <SponsorSuspendedNotice />}
          {firstRun.panel}
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
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <Detail label={t("overview.organization.legalName")}>
                {organization.legal_name}
              </Detail>
              <Detail label={t("overview.organization.country")}>
                {countryName(organization.country_code, locale)}
              </Detail>
              {organization.website !== null && (
                <Detail label={t("overview.organization.website")}>
                  <a href={organization.website} rel="noopener noreferrer nofollow" target="_blank">
                    {organization.website}
                  </a>
                </Detail>
              )}
            </dl>
            <Button asChild variant="quiet" className="w-fit">
              <Link
                href={routeHref("web.sponsor.settings", { sponsorId }, { section: "organization" })}
              >
                {t("overview.organization.details")}
              </Link>
            </Button>
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
                <Link href={routeHref("web.sponsor.application", { sponsorId })}>
                  {t("overview.application.action")}
                </Link>
              </Button>
            </Card>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Card id="sponsor-access" title={t("overview.access.title")}>
            <p className="type-body-sm font-extrabold">
              {t("overview.organization.role", { role: t(`roles.${membership.role}`) })}
            </p>
            <p className="type-body-sm text-muted-foreground">{t("overview.access.lead")}</p>
            <ul className="flex list-disc flex-col gap-1 pl-5 type-body-sm">
              {membership.permissions.map((permission) => (
                <li key={permission}>{t(`permissions.${permission}`)}</li>
              ))}
            </ul>
            <Button asChild variant="quiet" className="w-fit">
              <Link href={routeHref("web.sponsor.settings", { sponsorId }, { section: "members" })}>
                {t("overview.access.members")}
              </Link>
            </Button>
          </Card>
          <Card id="sponsor-not-yet" title={t("overview.notYet.title")} tourTarget="sponsor-future">
            <p className="type-body-sm text-muted-foreground">{t("overview.notYet.body")}</p>
            {/* Not links and not buttons: these domains don't exist (D-SA21, D-SA23, D-SA24). */}
            <ul data-sponsor-future className="flex flex-col gap-2">
              {FUTURE.map((key) => (
                <li
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-3.5 py-2.5 type-body-sm text-muted-foreground"
                >
                  {t(`overview.notYet.items.${key}`)}
                  <Badge variant="neutral">{t("overview.notYet.badge")}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </PageBody>
      {firstRun.overlays}
    </div>
  );
}

/** The FUTURE modules of SPX4 and SponsorNav (full), none of which has a domain today. */
const FUTURE = ["campaigns", "opportunities", "analytics", "invoices"] as const;

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="type-caption text-faint-foreground">{label}</dt>
      <dd className="type-body-sm font-bold break-words">{children}</dd>
    </div>
  );
}

function Card({
  id,
  title,
  aside,
  tourTarget,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  /** The SRW2 anchor of this card (SF-119). */
  tourTarget?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      data-tour-target={tourTarget}
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
