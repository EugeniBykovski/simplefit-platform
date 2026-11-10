import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { SponsorUnsupported } from "@/widgets/sponsor-workspace";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/campaigns">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "sponsorPortal" });
  return { title: t("unsupported.metaTitle"), robots: { index: false } };
}

/** `web.sponsor.campaigns` (SF-118): SPE1 "isn't part of SimpleFit yet"; no such domain exists. */
export default async function Page({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/campaigns">) {
  await resolveLocaleParam(params);
  return <SponsorUnsupported />;
}
