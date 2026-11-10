"use client";

import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import {
  useSponsorContacts,
  useSponsorMembers,
  type SponsorOrganizationAccess,
} from "@/entities/sponsor-organization";
import { isApiError } from "@/shared/api/http/api-error";
import { Link } from "@/shared/i18n/navigation";
import { countryName } from "@/shared/lib/countries";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";
import { FailureView } from "@/widgets/system-states";

import { SETTINGS_SECTIONS, type SettingsSection } from "../model/settings";
import { SponsorSuspendedNotice } from "./sponsor-states";
import { useSponsorWorkspace } from "./sponsor-workspace";

/**
 * SPX9 Sponsor settings, MVP (`web.sponsor.settings`, SF-118), for the
 * organization in the path. Everything is read-only: the API has no write for
 * the organization, its contacts or its members (D-SA08, D-SA12 undecided), so no
 * edit, invite, role, transfer or leave control is drawn and nothing pretends to
 * save. Contacts are requested only when the viewer's membership reports
 * `view_contacts` (owner, manager); the backend checks every read again.
 * Notifications and Privacy aren't built: they would state unapproved claims.
 */
export function SponsorSettings({ section }: { section: SettingsSection }) {
  return <SponsorSettingsView access={useSponsorWorkspace()} section={section} />;
}

export function SponsorSettingsView({
  access,
  section,
}: {
  access: SponsorOrganizationAccess;
  section: SettingsSection;
}) {
  const t = useTranslations("sponsorPortal.settings");
  const sponsorId = access.organization.sponsor_id;
  const suspended = access.organization.status === "suspended";

  return (
    <div data-sponsor-settings={section} className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate type-label text-faint-foreground">
            {access.organization.display_name}
          </p>
          <h1 className="type-h3 font-display">{t("title")}</h1>
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-4 pt-5.5">
        {suspended && <SponsorSuspendedNotice />}
        <nav aria-label={t("sectionsLabel")} className="-mx-1 overflow-x-auto px-1 pb-1">
          <ul className="flex w-max gap-2">
            {SETTINGS_SECTIONS.map((key) => (
              <li key={key}>
                <Link
                  href={routeHref("web.sponsor.settings", { sponsorId }, { section: key })}
                  aria-current={key === section ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-xl border px-3.5 type-body-sm font-bold whitespace-nowrap",
                    key === section
                      ? "border-primary-muted bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {t(`sections.${key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {section === "organization" && <OrganizationSection access={access} />}
        {section === "contact" && <ContactSection access={access} />}
        {section === "members" && <MembersSection sponsorId={sponsorId} />}
        {section === "application" && <ApplicationSection sponsorId={sponsorId} />}
        {section === "account" && <AccountSection />}
      </PageBody>
    </div>
  );
}

function Section({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby="sponsor-settings-section"
      className="flex min-w-0 flex-col gap-4 rounded-3xl border bg-surface px-5 py-4.5 lg:max-w-200"
    >
      <div className="flex flex-col gap-1">
        <h2 id="sponsor-settings-section" className="type-title font-display">
          {title}
        </h2>
        {lead && <p className="type-body-sm text-muted-foreground">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

/** One read-only field: a label and its value (never an input that can't save). */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 pb-3 last:border-b-0 last:pb-0 sm:flex-row sm:gap-6">
      <dt className="type-body-sm text-muted-foreground sm:w-44 sm:flex-none">{label}</dt>
      <dd className="min-w-0 type-body-sm font-bold break-words">{children ?? <NotProvided />}</dd>
    </div>
  );
}

/** A value the organization's record doesn't have: said, never invented. */
function NotProvided() {
  const s = useTranslations("sponsorPortal.settings");
  return <span className="text-muted-foreground">{s("notProvided")}</span>;
}

function ReadOnlyNote({ children }: { children: ReactNode }) {
  return <p className="type-caption text-faint-foreground">{children}</p>;
}

function OrganizationSection({ access }: { access: SponsorOrganizationAccess }) {
  const t = useTranslations("sponsorPortal");
  const s = useTranslations("sponsorPortal.settings");
  const format = useFormatter();
  const locale = useLocale();
  const { organization } = access;
  return (
    <Section title={s("organization.title")}>
      <dl className="flex flex-col gap-3">
        <Field label={s("organization.legalName")}>{organization.legal_name}</Field>
        <Field label={s("organization.brandName")}>{organization.display_name}</Field>
        <Field label={s("organization.website")}>
          {organization.website === null ? (
            <NotProvided />
          ) : (
            <a href={organization.website} rel="noopener noreferrer nofollow" target="_blank">
              {organization.website}
            </a>
          )}
        </Field>
        <Field label={s("organization.country")}>
          {countryName(organization.country_code, locale)}
        </Field>
        <Field label={s("organization.status")}>
          <Badge variant={organization.status === "suspended" ? "warning" : "accent"}>
            {t(`statuses.${organization.status}`)}
          </Badge>
        </Field>
        <Field label={s("organization.since")}>
          {format.dateTime(new Date(organization.created_at), "date")}
        </Field>
      </dl>
      <ReadOnlyNote>{s("readOnly")}</ReadOnlyNote>
    </Section>
  );
}

function ContactSection({ access }: { access: SponsorOrganizationAccess }) {
  const s = useTranslations("sponsorPortal.settings");
  const allowed = access.membership.permissions.includes("view_contacts");
  const query = useSponsorContacts(access.organization.sponsor_id, allowed);
  const forbidden = isApiError(query.error) && query.error.status === 403;

  let body: ReactNode;
  if (!allowed || forbidden) {
    body = (
      <Notice role="status" data-sponsor-contacts="restricted">
        {s("contact.restricted")}
      </Notice>
    );
  } else if (query.isError) {
    body = <FailureView error={query.error} onRetry={() => void query.refetch()} />;
  } else if (query.data === undefined) {
    body = <Skeleton className="h-32 rounded-2xl" />;
  } else if (query.data.length === 0) {
    body = <p className="type-body-sm text-muted-foreground">{s("contact.empty")}</p>;
  } else {
    body = (
      <ul className="flex flex-col gap-4">
        {query.data.map((contact) => (
          <li key={contact.contact_id} className="flex flex-col gap-3">
            <p className="type-label text-faint-foreground">{s(`contact.kinds.${contact.kind}`)}</p>
            <dl className="flex flex-col gap-3">
              <Field label={s("contact.name")}>{contact.full_name}</Field>
              <Field label={s("contact.position")}>{contact.job_title ?? <NotProvided />}</Field>
              <Field label={s("contact.email")}>{contact.email}</Field>
              <Field label={s("contact.phone")}>{contact.phone ?? <NotProvided />}</Field>
            </dl>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Section title={s("contact.title")} lead={s("contact.lead")}>
      {body}
      {allowed && !forbidden && <ReadOnlyNote>{s("readOnly")}</ReadOnlyNote>}
    </Section>
  );
}

function MembersSection({ sponsorId }: { sponsorId: string }) {
  const t = useTranslations("sponsorPortal");
  const s = useTranslations("sponsorPortal.settings");
  const query = useSponsorMembers(sponsorId);
  const members = query.data?.pages.flatMap((page) => page.members) ?? [];

  let body: ReactNode;
  if (query.isError && members.length === 0) {
    body = <FailureView error={query.error} onRetry={() => void query.refetch()} />;
  } else if (query.data === undefined) {
    body = <Skeleton className="h-40 rounded-2xl" />;
  } else if (members.length === 0) {
    body = <p className="type-body-sm text-muted-foreground">{s("members.empty")}</p>;
  } else {
    body = (
      <ul className="flex flex-col" data-sponsor-members>
        {members.map((member) => (
          <li
            key={member.membership_id}
            className="flex min-w-0 items-center gap-3 border-b border-border/60 py-3 last:border-b-0"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate type-body-sm font-extrabold">
                {member.short_name ?? s("members.unnamed")}
              </span>
              <span className="truncate type-caption text-muted-foreground">
                {member.is_viewer
                  ? s("members.line", { role: t(`roles.${member.role}`), you: s("members.you") })
                  : t(`roles.${member.role}`)}
              </span>
            </span>
            <Badge variant={member.status === "active" ? "accent" : "warning"}>
              {t(`memberStatuses.${member.status}`)}
            </Badge>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Section title={s("members.title")}>
      {body}
      {query.hasNextPage && (
        <Button
          type="button"
          variant="quiet"
          className="w-fit"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {s("members.more")}
        </Button>
      )}
      <ReadOnlyNote>{s("members.readOnly")}</ReadOnlyNote>
    </Section>
  );
}

function ApplicationSection({ sponsorId }: { sponsorId: string }) {
  const s = useTranslations("sponsorPortal.settings");
  return (
    <Section title={s("application.title")} lead={s("application.lead")}>
      <Button asChild variant="quiet" className="w-fit">
        <Link href={routeHref("web.sponsor.application", { sponsorId })}>
          {s("application.action")}
        </Link>
      </Button>
    </Section>
  );
}

function AccountSection() {
  const s = useTranslations("sponsorPortal.settings");
  return (
    <Section title={s("account.title")} lead={s("account.lead")}>
      {/* WS1 (account settings) isn't built: shown, unlinked and marked, never a placeholder link. */}
      <p
        aria-disabled="true"
        className="flex w-fit items-center gap-2 rounded-xl border border-dashed px-3.5 py-2.5 type-body-sm font-bold text-muted-foreground"
      >
        {s("account.action")}
        <Badge variant="neutral">{s("account.soon")}</Badge>
      </p>
    </Section>
  );
}
