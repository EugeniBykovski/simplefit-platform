import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { routing, type Locale } from "./routing";

/**
 * Resolves the `[locale]` route param in a layout or page: unsupported locales
 * render the not-found page, supported ones are registered for static
 * rendering (next-intl `setRequestLocale`). Call it at the top of every
 * layout and page under app/[locale].
 */
export async function resolveLocaleParam(params: Promise<{ locale: string }>): Promise<Locale> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return locale;
}
