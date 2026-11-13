import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { SponsorOpportunities } from "@/widgets/sponsor-workspace";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/opportunities">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "sponsorPartnerships" });
  return { title: t("opportunities.metaTitle"), robots: { index: false } };
}

/** `web.sponsor.opportunities` (SF-131): SPE1 "No opportunities" from the backend's answer (D-SA21). */
export default async function Page({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/opportunities">) {
  await resolveLocaleParam(params);
  return <SponsorOpportunities />;
}
