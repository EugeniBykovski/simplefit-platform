import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { GymDashboard } from "@/widgets/gym-workspace";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymConsole" });
  return { title: t("dashboard.metaTitle"), robots: { index: false } };
}

/** `web.app.gyms._gym-id` (WG1, SF-88): the gym dashboard of the gym in the path. */
export default async function GymDashboardPage({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]">) {
  await resolveLocaleParam(params);
  return <GymDashboard />;
}
