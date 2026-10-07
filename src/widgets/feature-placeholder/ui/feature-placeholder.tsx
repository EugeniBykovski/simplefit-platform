import { getTranslations } from "next-intl/server";

import type { Locale } from "@/shared/i18n/routing";
import { webRoute, webShell, type WebRouteId } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { PageBody, PageHeader } from "@/shared/ui/page";

import { routeTitleKey } from "../model/route-title";

/**
 * The one canonical placeholder for SF-31 routes whose feature screen is
 * built by a later ticket (SF-32, route-architecture §14). It renders inside
 * the route's shell and shows the route name, a "Planned" status and the
 * canonical path — no data, no controls, no API calls, nothing that pretends
 * to be the product. Replace the route's page with the real screen; never
 * fork this component per route.
 *
 * Layout (SF-34): the canonical PageHeader (title) and PageBody, on the app
 * inset inside a sidebar shell and on the site inset elsewhere, so it lines
 * up with the shell's own header.
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
  const route = webRoute(routeId);
  const inset = webShell(route.shell).navItems.length > 0 ? "app" : "site";

  return (
    <section
      aria-labelledby={headingId}
      data-feature-placeholder={routeId}
      className="flex w-full flex-1 flex-col self-stretch"
    >
      <PageHeader inset={inset}>
        <h1 id={headingId} className="type-h2 text-pretty">
          {titles(routeTitleKey(routeId))}
        </h1>
        <Badge variant="outline">{t("badge")}</Badge>
      </PageHeader>
      <PageBody inset={inset} className="flex flex-col gap-4">
        <p className="max-w-2xl text-pretty text-muted-foreground">{t("description")}</p>
        <dl className="flex flex-wrap items-baseline gap-x-2 gap-y-1 type-caption text-faint-foreground">
          <dt>{t("route")}</dt>
          <dd>
            <code className="font-mono break-all">{route.path}</code>
          </dd>
        </dl>
      </PageBody>
    </section>
  );
}
