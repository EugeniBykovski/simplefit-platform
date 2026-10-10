import type { useFormatter } from "next-intl";

import type { Price } from "./pricing";

/**
 * A price in the locale's currency format with the price's own currency
 * code: whole amounts without decimals ("€0", "€39"), others with two
 * ("€14.99"), as the artboards write them.
 */
export function formatPrice(format: ReturnType<typeof useFormatter>, price: Price): string {
  const whole = Number.isInteger(price.amount);
  return format.number(price.amount, {
    style: "currency",
    currency: price.currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  });
}
