import { getTranslations } from "next-intl/server";

import type { Locale } from "@/shared/i18n/routing";
import { webRoute, type WebRouteId } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";

import { routeTitleKey } from "../model/route-title";

/**
 * The one canonical placeholder for SF-31 routes whose feature screen is
 * built by a later ticket (SF-32, route-architecture §14). It renders inside
 * the route's shell and shows the route name, a "Planned" status and the
 * canonical path — no data, no controls, no API calls, nothing that pretends
 * to be the product. Replace the route's page with the real screen; never
 * fork this component per route.
 */
export async function FeaturePlaceholder({
  routeId,
  locale,
}: {
  routeId: WebRouteId;
  locale: Locale;
}) {
  const t = await getTranslations({ locale, namespace: "shells.placeholder" });
  const titles = await getTranslations({ locale, namespace: "routes.titles" });
  const headingId = `placeholder-${routeId}`;

  return (
    <section
      aria-labelledby={headingId}
      data-feature-placeholder={routeId}
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6 lg:py-12"
    >
      <Badge variant="outline">{t("badge")}</Badge>
      <h1 id={headingId} className="type-h2 text-pretty sm:type-h1">
        {titles(routeTitleKey(routeId))}
      </h1>
      <p className="max-w-2xl text-pretty text-muted-foreground">{t("description")}</p>
      <dl className="flex flex-wrap items-baseline gap-x-2 gap-y-1 type-caption text-faint-foreground">
        <dt>{t("route")}</dt>
        <dd>
          <code className="font-mono break-all">{webRoute(routeId).path}</code>
        </dd>
      </dl>
    </section>
  );
}
