import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { SponsorOverview } from "@/widgets/sponsor-workspace";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/dashboard">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "sponsorPortal" });
  return { title: t("overview.metaTitle"), robots: { index: false } };
}

/** `web.sponsor.dashboard` (SPX4 MVP, SF-117): the overview of the organization in the path. */
export default async function SponsorDashboardPage({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/dashboard">) {
  await resolveLocaleParam(params);
  return <SponsorOverview />;
}
