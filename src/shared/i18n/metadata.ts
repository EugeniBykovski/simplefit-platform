import type { Metadata } from "next";

import { getPathname } from "./navigation";
import { routing, type Locale } from "./routing";

/**
 * Canonical and hreflang alternates for a locale-independent pathname
 * ("/app"). Foundation for SEO; absolute URLs arrive with metadataBase once
 * the production domain is known.
 */
export function localeAlternates(pathname: string, locale: Locale): Metadata["alternates"] {
  const href = (target: Locale) => getPathname({ href: pathname, locale: target });

  return {
    canonical: href(locale),
    languages: {
      ...Object.fromEntries(routing.locales.map((target) => [target, href(target)])),
      "x-default": href(routing.defaultLocale),
    },
  };
}
