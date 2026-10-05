import type { Formats } from "next-intl";

/**
 * Named, locale-independent format presets. The active locale decides how
 * they render (e.g. "1,234.5" in en, "1 234,5" in pl and ru).
 *
 * Currency is deliberately NOT configured here: amounts must always be
 * formatted with the currency code that comes with the data, e.g.
 *   format.number(price.amount, { style: "currency", currency: price.currency })
 */
export const formats = {
  dateTime: {
    date: { day: "numeric", month: "short", year: "numeric" },
    dateTime: {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
    time: { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" },
  },
  number: {
    integer: { maximumFractionDigits: 0 },
    decimal: { minimumFractionDigits: 0, maximumFractionDigits: 2 },
    percent: { style: "percent", maximumFractionDigits: 1 },
  },
} satisfies Formats;

/**
 * Time zone used for server and client rendering until users have a stored
 * time zone. Explicit to keep server and client output identical.
 */
export const defaultTimeZone = "UTC";
