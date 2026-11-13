import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { SponsorRequestNew } from "@/widgets/sponsor-workspace";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/requests/new">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "sponsorPartnerships" });
  return { title: t("new.metaTitle"), robots: { index: false } };
}

/** `web.sponsor.requests.new` (SF-131): a new draft partnership request. */
export default async function Page({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/requests/new">) {
  await resolveLocaleParam(params);
  return <SponsorRequestNew />;
}
