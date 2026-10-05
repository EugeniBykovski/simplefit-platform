import { createFormatter } from "next-intl";
import { describe, expect, it } from "vitest";

import { defaultTimeZone, formats } from "./formats";
import { locales, type Locale } from "./routing";

const formatter = (locale: Locale) =>
  createFormatter({ locale, formats, timeZone: defaultTimeZone });

// Intl uses (narrow) no-break spaces as separators; show them as plain spaces.
const plain = (value: string) => value.replace(/[  ]/g, " ");

const moment = Date.UTC(2026, 9, 5, 14, 5, 9);

// Representative output per locale (ICU data shipped with Node 24).
const expected: Record<
  Locale,
  { decimal: string; percent: string; date: string; time: string; eur: string; mxn: string }
> = {
  en: {
    decimal: "1,234,567.89",
    percent: "25.6%",
    date: "Oct 5, 2026",
    time: "02:05:09 PM UTC",
    eur: "€1,234.50",
    mxn: "MX$1,234.50",
  },
  ru: {
    decimal: "1 234 567,89",
    percent: "25,6 %",
    date: "5 окт. 2026 г.",
    time: "14:05:09 UTC",
    eur: "1 234,50 €",
    mxn: "1 234,50 MX$",
  },
  pl: {
    decimal: "1 234 567,89",
    percent: "25,6%",
    date: "5 paź 2026",
    time: "14:05:09 UTC",
    eur: "1234,50 €",
    mxn: "1234,50 MXN",
  },
  de: {
    decimal: "1.234.567,89",
    percent: "25,6 %",
    date: "5. Okt. 2026",
    time: "14:05:09 UTC",
    eur: "1.234,50 €",
    mxn: "1.234,50 MX$",
  },
  uk: {
    decimal: "1 234 567,89",
    percent: "25,6%",
    date: "5 жовт. 2026 р.",
    time: "14:05:09 UTC",
    eur: "1 234,50 EUR",
    mxn: "1 234,50 MXN",
  },
  es: {
    decimal: "1.234.567,89",
    percent: "25,6 %",
    date: "5 oct 2026",
    time: "14:05:09 UTC",
    eur: "1234,50 €",
    mxn: "1234,50 MXN",
  },
  "es-MX": {
    decimal: "1,234,567.89",
    percent: "25.6%",
    date: "5 oct 2026",
    time: "02:05:09 p.m. UTC",
    eur: "EUR 1,234.50",
    mxn: "$1,234.50",
  },
  fr: {
    decimal: "1 234 567,89",
    percent: "25,6 %",
    date: "5 oct. 2026",
    time: "14:05:09 UTC",
    eur: "1 234,50 €",
    mxn: "1 234,50 $MX",
  },
};

describe.each(locales)("locale-aware formatting: %s", (locale) => {
  const format = formatter(locale);
  const want = expected[locale];

  it("formats numbers with the locale's decimal and group separators", () => {
    expect(plain(format.number(1234567.891, "decimal"))).toBe(want.decimal);
  });

  it("formats percentages", () => {
    expect(plain(format.number(0.256, "percent"))).toBe(want.percent);
  });

  it("formats dates and times in the configured time zone", () => {
    expect(plain(format.dateTime(moment, "date"))).toBe(want.date);
    expect(plain(format.dateTime(moment, "time"))).toBe(want.time);
  });

  it("formats currencies only with the currency code supplied by the data", () => {
    expect(plain(format.number(1234.5, { style: "currency", currency: "EUR" }))).toBe(want.eur);
    expect(plain(format.number(1234.5, { style: "currency", currency: "MXN" }))).toBe(want.mxn);
  });
});

describe("regional formatting", () => {
  it("keeps Spanish and Mexican Spanish formatting distinct", () => {
    expect(expected.es.decimal).not.toBe(expected["es-MX"].decimal);
    expect(expected.es.time).not.toBe(expected["es-MX"].time);
  });

  it("does not configure a default currency (currency comes from data, not language)", () => {
    expect(JSON.stringify(formats)).not.toMatch(/currency/i);
  });
});
