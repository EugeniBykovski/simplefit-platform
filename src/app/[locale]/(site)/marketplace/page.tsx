import type { Metadata } from "next";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { MarketplacePage, siteMetadata } from "@/widgets/public-site";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/marketplace">): Promise<Metadata> {
  return siteMetadata("marketplace", "web.marketplace", await resolveLocaleParam(params));
}

/** `web.marketplace` (SF-43). */
export default async function MarketplaceRoute({ params }: PageProps<"/[locale]/marketplace">) {
  await resolveLocaleParam(params);
  return <MarketplacePage />;
}
