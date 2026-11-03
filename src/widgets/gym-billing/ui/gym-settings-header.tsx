"use client";

import { ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { PageBody, PageHeader } from "@/shared/ui/page";

/*
 * The gym settings header and its tabs (WG22–WG26 tab bar, Claude Design
 * WebGymBilling.dc.html). Only the SimpleFit plan tab (WG25, SF-102) has a
 * domain; the others are shown, marked Soon and not linked (as the console
 * sidebar marks its future items) until their tickets build them.
 */
const TABS = ["general", "locations", "roles", "integrations", "plan", "danger"] as const;
type SettingsTab = (typeof TABS)[number];

export function GymSettingsHeader({ gymId, active }: { gymId: string; active?: SettingsTab }) {
  const t = useTranslations("gymBilling");

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="type-label text-faint-foreground">{t("eyebrow")}</p>
          <h1 className="type-h3 font-display">{t("title")}</h1>
        </div>
      </PageHeader>
      <nav aria-label={t("tabs.label")} className="border-b">
        <ul className="-mb-px flex gap-6 overflow-x-auto px-4 sm:px-6 md:px-8">
          {TABS.map((tab) => (
            <li key={tab} className="flex-none">
              {tab === "plan" ? (
                <Link
                  href={routeHref("web.app.gyms._gym-id.settings.plan", { gymId })}
                  aria-current={active === tab ? "page" : undefined}
                  className={cn(
                    "inline-flex border-b-2 pt-3 pb-3 type-body-sm font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    active === tab
                      ? "border-highlight text-foreground"
                      : "border-transparent text-faint-foreground hover:text-foreground",
                  )}
                >
                  {t(`tabs.${tab}`)}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="inline-flex items-center gap-1.5 border-b-2 border-transparent pt-3 pb-3 text-faint-foreground"
                >
                  <span className="type-body-sm font-extrabold">{t(`tabs.${tab}`)}</span>
                  <span className="type-caption">{t("tabs.soon")}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

/**
 * The settings entry (WG22): every section with what it holds; only the
 * SimpleFit plan opens, the others are marked Soon.
 */
export function GymSettingsIndex({ gymId }: { gymId: string }) {
  const t = useTranslations("gymBilling");

  return (
    <PageBody className="pt-5.5">
      <ul className="flex max-w-2xl flex-col divide-y divide-border rounded-3xl border border-border bg-card">
        {TABS.map((tab) => (
          <li key={tab} data-settings-section={tab}>
            {tab === "plan" ? (
              <Link
                href={routeHref("web.app.gyms._gym-id.settings.plan", { gymId })}
                className="flex items-center gap-3 px-5 py-4 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="type-body-sm font-extrabold">{t(`tabs.${tab}`)}</span>
                  <span className="type-caption text-muted-foreground">{t(`sections.${tab}`)}</span>
                </span>
                <ChevronRightIcon aria-hidden className="size-4 text-faint-foreground" />
              </Link>
            ) : (
              <div aria-disabled="true" className="flex items-center gap-3 px-5 py-4">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="type-body-sm font-extrabold text-faint-foreground">
                    {t(`tabs.${tab}`)}
                  </span>
                  <span className="type-caption text-faint-foreground">{t(`sections.${tab}`)}</span>
                </span>
                <span className="type-caption text-faint-foreground">{t("tabs.soon")}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </PageBody>
  );
}
