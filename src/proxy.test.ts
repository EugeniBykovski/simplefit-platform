// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { locales } from "@/shared/i18n/routing";

import proxy from "./proxy";

function request(path: string, headers: Record<string, string> = {}) {
  return proxy(new NextRequest(new URL(path, "https://simplefit.test"), { headers }));
}

const redirectPath = (response: Response) => {
  const location = response.headers.get("location");
  return location ? new URL(location).pathname : null;
};

describe("locale negotiation (proxy)", () => {
  it("redirects to English by default", () => {
    expect(redirectPath(request("/"))).toBe("/en");
  });

  it.each(locales)("serves the explicit %s URL without redirecting", (locale) => {
    for (const path of [`/${locale}`, `/${locale}/app`]) {
      const response = request(path, { "accept-language": "fr", cookie: "NEXT_LOCALE=de" });
      expect(redirectPath(response), path).toBeNull();
      expect(response.status, path).toBe(200);
    }
  });

  it.each([
    ["pl-PL,pl;q=0.9,en;q=0.8", "/pl"],
    ["uk-UA,uk;q=0.9", "/uk"],
    ["de-AT", "/de"],
    ["es-MX,es;q=0.9", "/es-MX"],
    // CLDR best fit: Latin American Spanish (es-419 region group) is closer to
    // Mexican Spanish than to Spain Spanish.
    ["es-AR,es;q=0.9", "/es-MX"],
    ["es-419", "/es-MX"],
    ["es-ES", "/es"],
    ["fr-CA", "/fr"],
  ])("negotiates Accept-Language %s to %s for URLs without a locale", (header, path) => {
    expect(redirectPath(request("/", { "accept-language": header }))).toBe(path);
  });

  it("falls back to English for unsupported browser languages", () => {
    expect(redirectPath(request("/", { "accept-language": "pt-BR,pt;q=0.9" }))).toBe("/en");
  });

  it("prefers a previously selected locale (NEXT_LOCALE cookie) over the browser language", () => {
    expect(
      redirectPath(request("/app", { cookie: "NEXT_LOCALE=es-MX", "accept-language": "pl" })),
    ).toBe("/es-MX/app");
  });

  it.each([
    ["/es-mx/app", "/es-MX/app"],
    ["/ES-MX", "/es-MX"],
    ["/EN/app", "/en/app"],
  ])("redirects the non-canonical locale %s to %s", (path, canonical) => {
    const response = request(path);
    expect(response.status).toBe(308);
    expect(redirectPath(response)).toBe(canonical);
  });

  it("treats an unsupported locale segment as a path in the default locale", () => {
    expect(redirectPath(request("/pt"))).toBe("/en/pt");
    expect(redirectPath(request("/es-AR/app"))).toBe("/en/es-AR/app");
  });
});
