import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { locales } from "@/shared/i18n/routing";

import LocaleLayout from "./layout";

// next/font only runs inside the Next.js compiler.
vi.mock("@/shared/styles/fonts", () => ({ fontVariables: "font-variables" }));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => key,
  setRequestLocale: vi.fn(),
}));

const render = (locale: string) =>
  LocaleLayout({ children: null, params: Promise.resolve({ locale }) } as never);

describe("LocaleLayout", () => {
  it.each(locales)("sets <html lang> to %s", async (locale) => {
    const html = (await render(locale)) as ReactElement<{ lang: string }>;
    expect(isValidElement(html)).toBe(true);
    expect(html.type).toBe("html");
    expect(html.props.lang).toBe(locale);
  });

  it.each(["pt", "es-mx", "es-AR"])(
    "renders not-found for the unsupported locale %s",
    async (locale) => {
      await expect(render(locale)).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
    },
  );
});
