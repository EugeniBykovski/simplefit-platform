import { hasLocale } from "next-intl";
import { defineRouting } from "next-intl/routing";

type LocaleDefinition = {
  /** The language's name in that language (endonym), shown in the language selector. */
  readonly name: string;
  /**
   * Locale to inherit missing messages from before English, e.g. es-MX -> es.
   * Lets regional locales override only what differs from their base language.
   */
  readonly fallback?: string;
};

/**
 * Canonical locale registry: the single source of truth for supported locales.
 * Codes are BCP 47 tags in canonical casing ("es-MX") and are used verbatim in
 * URLs (/es-MX/app), <html lang> and Intl formatting.
 *
 * Adding a locale:
 * 1. add an entry here (order = order in the language selector),
 * 2. add messages/<locale>/<namespace>.json for every namespace (a locale with
 *    a `fallback` only needs the namespaces and keys it overrides),
 * 3. run `pnpm test`: the i18n tests report missing or unknown keys.
 */
export const localeRegistry = {
  en: { name: "English" },
  ru: { name: "Русский" },
  pl: { name: "Polski" },
  de: { name: "Deutsch" },
  uk: { name: "Українська" },
  es: { name: "Español" },
  "es-MX": { name: "Español (México)", fallback: "es" },
  fr: { name: "Français" },
} as const satisfies Record<string, LocaleDefinition>;

export type Locale = keyof typeof localeRegistry;

export const locales = Object.keys(localeRegistry) as Locale[];

/** English is the default locale and the final fallback for every message. */
export const defaultLocale: Locale = "en";

export function localeName(locale: Locale): string {
  return localeRegistry[locale].name;
}

/** Message lookup order for a locale, most specific first: es-MX -> es -> en. */
export function fallbackChain(locale: Locale): Locale[] {
  const chain: Locale[] = [];
  let current: Locale | undefined = locale;
  while (current && !chain.includes(current)) {
    chain.push(current);
    const definition: LocaleDefinition = localeRegistry[current];
    current = definition.fallback as Locale | undefined;
  }
  if (!chain.includes(defaultLocale)) chain.push(defaultLocale);
  return chain;
}

export const routing = defineRouting({
  locales,
  defaultLocale,
  // Every URL carries its locale (/en, /es-MX/app): explicit, cacheable and
  // unambiguous for hreflang and canonical URLs.
  localePrefix: "always",
  // Only URLs without a locale are negotiated (NEXT_LOCALE cookie, then
  // Accept-Language best match, then English). An explicit URL locale always
  // wins. No geolocation is used.
  localeDetection: true,
});

/**
 * Maps a requested tag onto a supported locale, tolerating case differences
 * ("es-mx" -> "es-MX", "EN" -> "en"). Anything unsupported, including regional
 * variants that are not registered ("es-AR"), resolves to undefined: callers
 * decide whether to 404 or use the default. It never guesses.
 */
export function matchLocale(requested: string | undefined): Locale | undefined {
  if (!requested) return undefined;
  if (hasLocale(locales, requested)) return requested;
  let canonical: string | undefined;
  try {
    canonical = Intl.getCanonicalLocales(requested)[0];
  } catch {
    return undefined;
  }
  return locales.find((locale) => locale === canonical);
}

/** Unsupported or missing locales resolve to the default locale. */
export function resolveLocale(requested: string | undefined): Locale {
  return matchLocale(requested) ?? defaultLocale;
}
