import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { GymChooser } from "@/widgets/gym-chooser";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/gyms">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymConsole" });
  return { title: t("chooser.metaTitle"), robots: { index: false } };
}

/**
 * `web.app.gyms` (SF-88): the gym chooser, where the entry resolver's
 * `gym_selection` lands. It lists the user's real gym workspaces only.
 */
export default async function GymChooserPage({ params }: PageProps<"/[locale]/app/gyms">) {
  await resolveLocaleParam(params);
  return <GymChooser />;
}
