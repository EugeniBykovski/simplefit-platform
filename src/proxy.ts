import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { matchLocale, routing } from "@/shared/i18n/routing";

const handleI18nRouting = createMiddleware(routing);

/**
 * Locale negotiation (Next.js 16 proxy).
 *
 * - A locale segment in the wrong case is redirected to its canonical form
 *   (/es-mx/app -> /es-MX/app) so every page has exactly one URL.
 * - Requests without a supported locale prefix are redirected to
 *   /<locale>/...: NEXT_LOCALE cookie, then Accept-Language best match, then
 *   English. An explicit supported URL locale is never overridden.
 * - No geolocation is used.
 */
export default function proxy(request: NextRequest) {
  const [, first = "", ...rest] = request.nextUrl.pathname.split("/");
  const canonical = matchLocale(first);

  if (canonical && canonical !== first) {
    const url = request.nextUrl.clone();
    url.pathname = ["", canonical, ...rest].join("/");
    return NextResponse.redirect(url, 308);
  }

  return handleI18nRouting(request);
}

export const config = {
  // Everything except Next.js internals and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
