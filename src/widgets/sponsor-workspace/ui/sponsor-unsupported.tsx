"use client";

import { CircleSlashIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";

import { useSponsorWorkspace } from "./sponsor-workspace";

/**
 * SPE1 "Unsupported feature" (SF-118): a direct visit to a partner-portal page
 * whose domain doesn't exist (campaigns, analytics, invoices; D-SA21, D-SA23,
 * D-SA24). It says so and leads back to the overview: no mock data, no empty
 * business page that implies the feature runs. The sidebar never links here.
 */
export function SponsorUnsupported() {
  const t = useTranslations("sponsorPortal");
  const { organization } = useSponsorWorkspace();
  return (
    <div data-sponsor-state="unsupported" className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate type-label text-faint-foreground">{organization.display_name}</p>
          <h1 className="type-h3 font-display">{t("unsupported.title")}</h1>
        </div>
      </PageHeader>
      <PageBody className="pt-5.5">
        <section className="flex flex-col items-start gap-2.5 rounded-3xl border bg-surface px-6 py-10">
          <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-highlight">
            <CircleSlashIcon aria-hidden className="size-5" />
          </span>
          <p className="max-w-130 type-body-sm text-muted-foreground">{t("unsupported.body")}</p>
          <Button asChild variant="quiet">
            <Link href={routeHref("web.sponsor.dashboard", { sponsorId: organization.sponsor_id })}>
              {t("unsupported.action")}
            </Link>
          </Button>
        </section>
      </PageBody>
    </div>
  );
}
