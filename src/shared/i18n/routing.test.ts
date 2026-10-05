import { describe, expect, it } from "vitest";

import {
  defaultLocale,
  fallbackChain,
  localeName,
  locales,
  matchLocale,
  resolveLocale,
  routing,
} from "./routing";

describe("locale registry", () => {
  it("supports the canonical SimpleFit locales with prefixed URLs", () => {
    expect(locales).toEqual(["en", "ru", "pl", "de", "uk", "es", "es-MX", "fr"]);
    expect(routing.locales).toEqual(locales);
    expect(defaultLocale).toBe("en");
    expect(routing.defaultLocale).toBe("en");
    expect(routing.localePrefix).toBe("always");
  });

  it("names every locale in its own language", () => {
    expect(locales.map(localeName)).toEqual([
      "English",
      "Русский",
      "Polski",
      "Deutsch",
      "Українська",
      "Español",
      "Español (México)",
      "Français",
    ]);
  });

  it("uses canonical BCP 47 tags", () => {
    for (const locale of locales) {
      expect(Intl.getCanonicalLocales(locale)[0]).toBe(locale);
    }
  });

  it("falls back es-MX -> es -> en and every other locale -> en", () => {
    expect(fallbackChain("es-MX")).toEqual(["es-MX", "es", "en"]);
    expect(fallbackChain("es")).toEqual(["es", "en"]);
    expect(fallbackChain("de")).toEqual(["de", "en"]);
    expect(fallbackChain("en")).toEqual(["en"]);
  });
});

describe("matchLocale", () => {
  it.each(locales)("recognizes %s", (locale) => {
    expect(matchLocale(locale)).toBe(locale);
  });

  it.each([
    ["es-mx", "es-MX"],
    ["ES-MX", "es-MX"],
    ["EN", "en"],
    ["Uk", "uk"],
  ])("canonicalizes %s to %s", (requested, locale) => {
    expect(matchLocale(requested)).toBe(locale);
  });

  it("keeps es and es-MX distinct", () => {
    expect(matchLocale("es")).toBe("es");
    expect(matchLocale("es-MX")).toBe("es-MX");
  });

  it.each(["es-AR", "es-ES", "en-US", "pt", "ua", "zz", "not a locale", "", undefined])(
    "does not treat %s as supported",
    (requested) => {
      expect(matchLocale(requested)).toBeUndefined();
    },
  );
});

describe("resolveLocale", () => {
  it("falls back to English for unsupported or missing locales", () => {
    expect(resolveLocale("pt")).toBe("en");
    expect(resolveLocale(undefined)).toBe("en");
    expect(resolveLocale("es-mx")).toBe("es-MX");
  });
});
