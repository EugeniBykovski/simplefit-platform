"use client";

import { ChevronRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref, type WebRouteId } from "@/shared/routes/routes";
import { PageBody, PageHeader } from "@/shared/ui/page";

/*
 * The gym settings header and its tabs (WG22–WG26 tab bar, Claude Design
 * WebGymBilling.dc.html). The tabs with a domain open their screen: the
 * SimpleFit plan (WG25, SF-102) and, since SF-103, business verification
 * (OG7), community defaults (WG10 / OG13) and go-live readiness (OG14),
 * which the design draws as setup steps; the others are shown, marked Soon
 * and not linked (as the console sidebar marks its future items) until
 * their tickets build them.
 */
const TABS = [
  "general",
  "locations",
  "roles",
  "integrations",
  "plan",
  "verification",
  "community",
  "goLive",
  "danger",
] as const;
type SettingsTab = (typeof TABS)[number];

const LINKED: Partial<Record<SettingsTab, WebRouteId>> = {
  plan: "web.app.gyms._gym-id.settings.plan",
  verification: "web.app.gyms._gym-id.settings.verification",
  community: "web.app.gyms._gym-id.settings.community",
  goLive: "web.app.gyms._gym-id.settings.go-live",
};

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
          {TABS.map((tab) => {
            const route = LINKED[tab];
            return (
              <li key={tab} className="flex-none">
                {route !== undefined ? (
                  <Link
                    href={routeHref(route, { gymId })}
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
            );
          })}
        </ul>
      </nav>
    </>
  );
}

/**
 * The settings entry (WG22): every section with what it holds; the sections
 * with a domain open, the others are marked Soon.
 */
export function GymSettingsIndex({ gymId }: { gymId: string }) {
  const t = useTranslations("gymBilling");

  return (
    <PageBody className="pt-5.5">
      <ul className="flex max-w-2xl flex-col divide-y divide-border rounded-3xl border border-border bg-card">
        {TABS.map((tab) => {
          const route = LINKED[tab];
          return (
            <li key={tab} data-settings-section={tab}>
              {route !== undefined ? (
                <Link
                  href={routeHref(route, { gymId })}
                  className="flex items-center gap-3 px-5 py-4 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="type-body-sm font-extrabold">{t(`tabs.${tab}`)}</span>
                    <span className="type-caption text-muted-foreground">
                      {t(`sections.${tab}`)}
                    </span>
                  </span>
                  <ChevronRightIcon aria-hidden className="size-4 text-faint-foreground" />
                </Link>
              ) : (
                <div aria-disabled="true" className="flex items-center gap-3 px-5 py-4">
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="type-body-sm font-extrabold text-faint-foreground">
                      {t(`tabs.${tab}`)}
                    </span>
                    <span className="type-caption text-faint-foreground">
                      {t(`sections.${tab}`)}
                    </span>
                  </span>
                  <span className="type-caption text-faint-foreground">{t("tabs.soon")}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </PageBody>
  );
}
