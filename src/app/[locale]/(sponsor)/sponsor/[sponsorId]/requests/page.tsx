import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { requestFilter, SponsorRequests } from "@/widgets/sponsor-workspace";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/requests">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "sponsorPartnerships" });
  return { title: t("requests.metaTitle"), robots: { index: false } };
}

/** `web.sponsor.requests` (SF-131): the organization's partnership requests, `?status=` filtered. */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/[locale]/sponsor/[sponsorId]/requests">) {
  await resolveLocaleParam(params);
  const { status } = await searchParams;
  return <SponsorRequests status={requestFilter(status)} />;
}
