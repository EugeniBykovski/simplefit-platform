import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";

import { CommunityScreen } from "./community-screen";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/settings/community">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymCommunity" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * `web.app.gyms._gym-id.settings.community` (WG10 / OG13, SF-103): the gym's community defaults: privacy guarantees and the settings coming later, inside
 * the console of the gym in the path (the layout authorizes the gym).
 */
export default async function GymCommunityPage({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/settings/community">) {
  await resolveLocaleParam(params);
  return <CommunityScreen />;
}
