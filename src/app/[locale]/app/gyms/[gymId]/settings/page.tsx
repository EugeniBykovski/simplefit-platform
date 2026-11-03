import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";

import { SettingsScreen } from "./settings-screen";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/settings">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymBilling" });
  return { title: t("settingsMetaTitle"), robots: { index: false } };
}

/**
 * `web.app.gyms._gym-id.settings` (WG22 entry, SF-102): the gym settings
 * sections; only the SimpleFit plan (WG25) has a domain yet, the others are
 * marked Soon.
 */
export default async function GymSettingsPage({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/settings">) {
  await resolveLocaleParam(params);
  return <SettingsScreen />;
}
