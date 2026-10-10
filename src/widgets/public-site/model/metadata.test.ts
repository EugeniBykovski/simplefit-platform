import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/shared/i18n/messages";
import type { Locale } from "@/shared/i18n/routing";

import { siteMetadata } from "./metadata";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: Locale; namespace: string }) =>
    createTranslator({
      locale,
      messages: await loadMessages(locale),
      namespace: namespace as never,
    }),
}));

describe("siteMetadata", () => {
  it("titles a page by its route, describes it and links every locale", async () => {
    const metadata = await siteMetadata("pricing", "web.pricing", "pl");
    expect(metadata.title).toBe("Cennik");
    expect(metadata.description).toBe(
      "Za darmo dla zawodników. Uczciwie dla trenerów. Stworzone, by klub rósł.",
    );
    expect(metadata.alternates?.canonical).toBe("/pl/pricing");
    expect(metadata.alternates?.languages).toMatchObject({
      en: "/en/pricing",
      "es-MX": "/es-MX/pricing",
      "x-default": "/en/pricing",
    });
    expect(metadata.openGraph).toMatchObject({ title: "Cennik · SimpleFit Boxing", locale: "pl" });
  });

  it("keeps the site name as the home page title", async () => {
    const metadata = await siteMetadata("home", "web.root", "en");
    expect(metadata.title).toBeUndefined();
    expect(metadata.alternates?.canonical).toBe("/en");
    expect(metadata.openGraph).toMatchObject({ title: "SimpleFit Boxing" });
  });
});
