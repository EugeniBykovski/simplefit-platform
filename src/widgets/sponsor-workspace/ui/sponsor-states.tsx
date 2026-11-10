"use client";

import { SearchXIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { Notice } from "@/shared/ui/notice";
import { PageBody, PageHeader } from "@/shared/ui/page";

/**
 * Not available (SPE1 "Unauthorized workspace (404)", route rule 9): the
 * organization is unknown, someone else's, closed, or the viewer's membership
 * ended. The backend answers all of them with 404, and so does this state: it
 * never says which, nor that the organization exists. Its way out is the entry
 * (`/app`), which resolves the viewer's real contexts again.
 */
export function SponsorNotAvailable() {
  const t = useTranslations("sponsorPortal.states");
  return (
    <div data-sponsor-state="not-available" className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="type-label text-faint-foreground">{t("eyebrow")}</p>
          <h1 className="truncate type-h3 font-display">{t("notAvailable.heading")}</h1>
        </div>
      </PageHeader>
      <PageBody className="pt-5.5">
        <section className="rounded-3xl border bg-surface px-5 py-4.5">
          <div role="status" className="flex flex-col items-start gap-2.5 px-2 py-8">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-highlight">
              <SearchXIcon aria-hidden className="size-5" />
            </span>
            <p className="type-title font-display">{t("notAvailable.title")}</p>
            <p className="max-w-130 type-body-sm text-muted-foreground">{t("notAvailable.body")}</p>
            <Button asChild variant="quiet">
              <Link href={routeHref("web.app")}>{t("notAvailable.action")}</Link>
            </Button>
          </div>
        </section>
      </PageBody>
    </div>
  );
}

/**
 * SPX4 `state=suspended`: a suspended organization stays readable by its
 * members, and nobody can change it (ADR 0030, ADR 0033). No reason is shown:
 * the API gives none to members.
 */
export function SponsorSuspendedNotice() {
  const t = useTranslations("sponsorPortal.states.suspended");
  return (
    <Notice tone="amber" role="status" data-sponsor-suspended>
      <span className="flex flex-col gap-0.5">
        <span className="font-extrabold">{t("title")}</span>
        <span>{t("body")}</span>
      </span>
    </Notice>
  );
}
