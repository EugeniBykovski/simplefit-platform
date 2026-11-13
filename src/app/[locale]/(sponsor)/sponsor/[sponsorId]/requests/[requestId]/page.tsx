import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { isUuid } from "@/shared/lib/utils";
import { SponsorRequestDetail } from "@/widgets/sponsor-workspace";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/requests/[requestId]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "sponsorPartnerships" });
  return { title: t("detail.metaTitle"), robots: { index: false } };
}

/**
 * `web.sponsor.requests._request-id` (SF-131): one partnership request. A
 * segment that is not a UUID is the not-found page: it never reaches an API path.
 */
export default async function Page({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/requests/[requestId]">) {
  await resolveLocaleParam(params);
  const { requestId } = await params;
  if (!isUuid(requestId)) notFound();
  return <SponsorRequestDetail requestId={requestId} />;
}
