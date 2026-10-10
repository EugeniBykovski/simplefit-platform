import type { Metadata } from "next";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { parseBilling, parsePricingRole, PricingPage, siteMetadata } from "@/widgets/public-site";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/pricing">): Promise<Metadata> {
  return siteMetadata("pricing", "web.pricing", await resolveLocaleParam(params));
}

/**
 * `web.pricing` (SF-43): PR1–PR4 as `?role=` states (coach by default) and
 * the `?billing=annual` toggle state, read on the server (the segment renders
 * per request, see layout.tsx).
 */
export default async function PricingRoute({
  params,
  searchParams,
}: PageProps<"/[locale]/pricing">) {
  await resolveLocaleParam(params);
  const search = await searchParams;
  const single = (value: string | string[] | undefined) =>
    Array.isArray(value) ? undefined : value;
  return (
    <PricingPage
      audience={parsePricingRole(single(search.role))}
      billing={parseBilling(single(search.billing))}
    />
  );
}
