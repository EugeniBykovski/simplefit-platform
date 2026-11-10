import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { settingsSection, SponsorSettings } from "@/widgets/sponsor-workspace";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sponsor/[sponsorId]/settings">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "sponsorPortal" });
  return { title: t("settings.metaTitle"), robots: { index: false } };
}

/** `web.sponsor.settings` (SPX9 MVP, SF-118): the organization's settings, section from `?section=`. */
export default async function SponsorSettingsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/sponsor/[sponsorId]/settings">) {
  await resolveLocaleParam(params);
  const { section } = await searchParams;
  return <SponsorSettings section={settingsSection(section)} />;
}
