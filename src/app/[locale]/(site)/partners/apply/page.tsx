import type { Metadata } from "next";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { PartnersApplyPage, siteMetadata } from "@/widgets/public-site";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/partners/apply">): Promise<Metadata> {
  return siteMetadata("apply", "web.partners.apply", await resolveLocaleParam(params));
}

/** `web.partners.apply` (SF-43). */
export default async function PartnersApplyRoute({
  params,
}: PageProps<"/[locale]/partners/apply">) {
  await resolveLocaleParam(params);
  return <PartnersApplyPage />;
}
