import type { Metadata } from "next";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { PartnersPage, siteMetadata } from "@/widgets/public-site";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/partners">): Promise<Metadata> {
  return siteMetadata("partners", "web.partners", await resolveLocaleParam(params));
}

/** `web.partners` (SF-43). */
export default async function PartnersRoute({ params }: PageProps<"/[locale]/partners">) {
  await resolveLocaleParam(params);
  return <PartnersPage />;
}
