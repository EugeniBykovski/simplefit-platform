import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { FighterCoaches } from "@/widgets/fighter-coaches";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/coaches">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "fighterCoaches" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * `web.app.coaches` (WFC1, SF-60): the fighter's coaches. `?view=ended`
 * shows the ended relationships; any other value is the active list. The
 * Fighter gate of the `(fighter)` layout has already run.
 */
export default async function FighterCoachesPage({
  params,
  searchParams,
}: PageProps<"/[locale]/app/coaches">) {
  await resolveLocaleParam(params);
  const { view } = await searchParams;
  return <FighterCoaches view={view === "ended" ? "ended" : "active"} />;
}
