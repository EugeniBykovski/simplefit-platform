import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import type { WebRouteId } from "@/shared/routes/routes";

import { routeTitleKey } from "../model/route-title";
import { FeaturePlaceholder } from "./feature-placeholder";

type RouteProps = { params: Promise<{ locale: string }> };

/**
 * Page module for a route that renders the canonical placeholder:
 *
 *   const route = placeholderRoute("web.app.home");
 *   export const generateMetadata = route.generateMetadata;
 *   export default route.Page;
 *
 * Placeholders are kept out of search indexes.
 */
export function placeholderRoute(routeId: WebRouteId) {
  async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
    const locale = await resolveLocaleParam(params);
    const titles = await getTranslations({ locale, namespace: "routes.titles" });
    return { title: titles(routeTitleKey(routeId)), robots: { index: false } };
  }

  async function Page({ params }: RouteProps) {
    const locale = await resolveLocaleParam(params);
    return <FeaturePlaceholder routeId={routeId} locale={locale} />;
  }

  return { routeId, generateMetadata, Page };
}
