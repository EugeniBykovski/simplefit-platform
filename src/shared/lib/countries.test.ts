import { describe, expect, it } from "vitest";

import { countryCodes, countryName, countryOptions } from "./countries";

describe("countries", () => {
  it("lists the officially assigned ISO 3166-1 alpha-2 codes (249)", () => {
    const codes = countryCodes();
    expect(codes).toHaveLength(249);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/);
    for (const code of ["PL", "US", "GB", "DE", "UA", "MX", "FR", "AQ", "AX", "SS", "BQ"]) {
      expect(codes).toContain(code);
    }
  });

  it.each(["XK", "EU", "UN", "UK", "SU", "YU", "ZZ", "AC", "EA"])(
    "excludes %s: CLDR names it, ISO does not assign it",
    (code) => {
      expect(countryCodes()).not.toContain(code);
    },
  );

  it("names and sorts countries in the reader's language", () => {
    const de = countryOptions("de");
    expect(de.find((option) => option.code === "DE")?.name).toBe("Deutschland");
    expect(de.map((option) => option.name)).toEqual(
      [...de.map((option) => option.name)].sort(new Intl.Collator("de").compare),
    );
    expect(countryName("PL", "pl")).toBe("Polska");
    expect(countryName("PL", "en")).toBe("Poland");
  });
});
