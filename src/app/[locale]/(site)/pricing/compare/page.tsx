import type { Metadata } from "next";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { PlanComparePage, siteMetadata } from "@/widgets/public-site";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/pricing/compare">): Promise<Metadata> {
  return siteMetadata("compare", "web.pricing.compare", await resolveLocaleParam(params));
}

/** `web.pricing.compare` (SF-43). */
export default async function PlanCompareRoute({ params }: PageProps<"/[locale]/pricing/compare">) {
  await resolveLocaleParam(params);
  return <PlanComparePage />;
}
