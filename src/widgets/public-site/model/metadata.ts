import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { siteConfig } from "@/shared/config/site";
import type { Messages } from "@/shared/i18n/messages";
import { localeAlternates } from "@/shared/i18n/metadata";
import type { Locale } from "@/shared/i18n/routing";
import { routeHref, type WebRouteId } from "@/shared/routes/routes";

type SitePageKey = keyof Messages["site"]["meta"];
type RouteTitleKey = keyof Messages["routes"]["titles"];

/**
 * The metadata of a public page (SF-43): its localized title (the route's
 * `routes.titles` entry; the home page keeps the site name), description,
 * canonical URL and hreflang alternates, and the matching Open Graph and
 * Twitter card text. No image, URL base or structured data: no production
 * domain or social image is approved yet, and nothing is claimed that the
 * product does not back.
 */
export async function siteMetadata(
  page: SitePageKey,
  routeId: WebRouteId,
  locale: Locale,
): Promise<Metadata> {
  const meta = await getTranslations({ locale, namespace: "site.meta" });
  const titles = await getTranslations({ locale, namespace: "routes.titles" });
  const description = meta(page);
  const title =
    routeId === "web.root" ? undefined : titles(routeId.replaceAll(".", "/") as RouteTitleKey);
  const fullTitle = title === undefined ? siteConfig.name : `${title} · ${siteConfig.name}`;

  return {
    ...(title === undefined ? {} : { title }),
    description,
    alternates: localeAlternates(routeHref(routeId), locale),
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      locale,
      title: fullTitle,
      description,
    },
    twitter: { card: "summary", title: fullTitle, description },
  };
}
