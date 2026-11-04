import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";

import { GoLiveScreen } from "./go-live-screen";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/settings/go-live">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymGoLive" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * `web.app.gyms._gym-id.settings.go-live` (OG14, SF-103): the gym's backend-derived go-live readiness, inside
 * the console of the gym in the path (the layout authorizes the gym).
 */
export default async function GymGoLivePage({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/settings/go-live">) {
  await resolveLocaleParam(params);
  return <GoLiveScreen />;
}
