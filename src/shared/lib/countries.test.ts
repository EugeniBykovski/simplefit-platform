import { describe, expect, it } from "vitest";

import { countryCodes, countryName, countryOptions } from "./countries";

describe("countries", () => {
  it("lists the officially assigned ISO 3166-1 alpha-2 codes (249)", () => {
    const codes = countryCodes();
    expect(codes).toHaveLength(249);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/);
    for (const code of ["PL", "US", "GB", "DE", "UA", "MX", "FR", "AQ", "AX", "SS", "BQ", "QA"]) {
      expect(codes).toContain(code);
    }
  });

  it.each([
    // Exceptionally and transitionally reserved, user-assigned, unknown.
    "XK",
    "EU",
    "UN",
    "UK",
    "SU",
    "YU",
    "ZZ",
    "AC",
    "EA",
    "NT",
    "QO",
    "XA",
    "AA",
    // Withdrawn codes some engines still name (Firefox: ISO 3166-3).
    "CT",
    "FQ",
    "JT",
    "MI",
    "NQ",
    "PC",
    "PU",
    "PZ",
    "WK",
  ])("excludes %s: not an officially assigned country", (code) => {
    expect(countryCodes()).not.toContain(code);
  });

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
