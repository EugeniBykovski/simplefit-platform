import { createFormatter } from "next-intl";

import type { Locale } from "@/shared/i18n/routing";
import { describe, expect, it } from "vitest";

import { formatPrice } from "./price-format";

const formatter = (locale: Locale) => createFormatter({ locale, timeZone: "UTC" });

describe("formatPrice", () => {
  it("writes whole amounts without decimals and others with two, in the price's currency", () => {
    expect(formatPrice(formatter("en"), { amount: 0, currency: "EUR" })).toBe("€0");
    expect(formatPrice(formatter("en"), { amount: 39, currency: "EUR" })).toBe("€39");
    expect(formatPrice(formatter("en"), { amount: 14.99, currency: "EUR" })).toBe("€14.99");
    expect(formatPrice(formatter("en"), { amount: 76.7, currency: "EUR" })).toBe("€76.70");
  });

  it("follows the locale's format, never inferring the currency from it", () => {
    // Intl separates the amount and the symbol with a no-break space (U+00A0).
    expect(formatPrice(formatter("de"), { amount: 14.99, currency: "EUR" })).toBe("14,99\u00a0€");
    expect(formatPrice(formatter("pl"), { amount: 329, currency: "PLN" })).toBe("329\u00a0zł");
    expect(formatPrice(formatter("en"), { amount: 329, currency: "PLN" })).toBe("PLN\u00a0329");
  });
});
