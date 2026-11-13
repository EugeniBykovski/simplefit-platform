import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { SponsorInterests } from "@/widgets/sponsor-workspace";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/interests">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "sponsorPartnerships" });
  return { title: t("interests.metaTitle"), robots: { index: false } };
}

/** `web.sponsor.interests` (SF-131): the organization's partnership interests (SF-130 preferences). */
export default async function Page({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/interests">) {
  await resolveLocaleParam(params);
  return <SponsorInterests />;
}
