import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { SponsorApplicationPage } from "@/widgets/sponsor-workspace";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/application">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "sponsorPortal" });
  return { title: t("application.metaTitle"), robots: { index: false } };
}

/** `web.sponsor.application` (SF-118): the application that created the organization in the path. */
export default async function Page({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/application">) {
  await resolveLocaleParam(params);
  return <SponsorApplicationPage />;
}
