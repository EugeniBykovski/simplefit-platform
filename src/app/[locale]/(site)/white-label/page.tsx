import type { Metadata } from "next";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { WhiteLabelPage, siteMetadata } from "@/widgets/public-site";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/white-label">): Promise<Metadata> {
  return siteMetadata("whiteLabel", "web.white-label", await resolveLocaleParam(params));
}

/** `web.white-label` (SF-43). */
export default async function WhiteLabelRoute({ params }: PageProps<"/[locale]/white-label">) {
  await resolveLocaleParam(params);
  return <WhiteLabelPage />;
}
