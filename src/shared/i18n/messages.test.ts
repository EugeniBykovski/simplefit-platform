import { describe, expect, it } from "vitest";

import {
  loadLocaleMessages,
  loadMessages,
  namespaces,
  withFallback,
  type MessageTree,
} from "./messages";
import { defaultLocale, fallbackChain, locales } from "./routing";

/** Flattens a message tree into "namespace.key.sub" -> message. */
function flatten(tree: MessageTree, prefix = ""): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((flat, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string"
      ? { ...flat, [path]: value }
      : { ...flat, ...flatten(value, path) };
  }, {});
}

/** ICU arguments ({name}) and rich-text tags (<tag>) a message relies on. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)|<\/?(\w+)>/g)].map((m) => m[1] ?? `<${m[2]}>`).sort();
}

const raw = async (locale: (typeof locales)[number]) =>
  flatten((await loadLocaleMessages(locale)) as MessageTree);

const source = await raw(defaultLocale);
const sourceKeys = Object.keys(source).sort();

const inheriting = locales.filter((locale) => fallbackChain(locale).length > 2);
const standalone = locales.filter(
  (locale) => locale !== defaultLocale && !inheriting.includes(locale),
);

describe("message catalogs", () => {
  it("has English source messages for every namespace", async () => {
    const english = await loadLocaleMessages(defaultLocale);
    expect(Object.keys(english).sort()).toEqual([...namespaces].sort());
  });

  describe.each(standalone)("%s (full catalog)", (locale) => {
    it("translates exactly the English keys", async () => {
      expect(Object.keys(await raw(locale)).sort()).toEqual(sourceKeys);
    });
  });

  describe.each(inheriting)("%s (regional overrides)", (locale) => {
    it("only overrides keys that exist in English", async () => {
      for (const key of Object.keys(await raw(locale))) {
        expect(sourceKeys, `${locale}: unknown key ${key}`).toContain(key);
      }
    });
  });

  describe.each(locales.filter((locale) => locale !== defaultLocale))("%s", (locale) => {
    it("keeps the ICU arguments and tags of the English messages", async () => {
      for (const [key, message] of Object.entries(await raw(locale))) {
        expect(placeholders(message), `${locale}: ${key}`).toEqual(placeholders(source[key]!));
      }
    });

    it("has no empty translations", async () => {
      for (const [key, message] of Object.entries(await raw(locale))) {
        expect(message.trim(), `${locale}: ${key}`).not.toBe("");
      }
    });
  });

  it.each(locales)("resolves every English key for %s", async (locale) => {
    const resolved = flatten((await loadMessages(locale)) as unknown as MessageTree);
    expect(Object.keys(resolved).sort()).toEqual(sourceKeys);
  });
});

describe("loadMessages", () => {
  it.each([
    ["en", "Overview"],
    ["ru", "Обзор"],
    ["pl", "Przegląd"],
    ["de", "Übersicht"],
    ["uk", "Огляд"],
    ["es", "Resumen"],
    ["es-MX", "Resumen"],
    ["fr", "Vue d’ensemble"],
  ] as const)("loads %s messages", async (locale, overview) => {
    expect((await loadMessages(locale)).navigation.overview).toBe(overview);
  });

  it("resolves es-MX through es before English, keeping es-MX overrides distinct", async () => {
    const es = await loadMessages("es");
    const esMX = await loadMessages("es-MX");

    // Override defined for Mexican Spanish.
    expect(esMX.actions.checkAgain).toBe("Verificar de nuevo");
    expect(es.actions.checkAgain).toBe("Comprobar de nuevo");
    // Inherited from Spanish, not English.
    expect(esMX.actions.close).toBe(es.actions.close);
    expect(esMX.actions.close).toBe("Cerrar");
  });
});

describe("withFallback", () => {
  it("falls back to the base text for missing keys", () => {
    const merged = withFallback({ a: "A", nested: { b: "B", c: "C" } }, { nested: { b: "B-pl" } });
    expect(merged).toEqual({ a: "A", nested: { b: "B-pl", c: "C" } });
  });
});
