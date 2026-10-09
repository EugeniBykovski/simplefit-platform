import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { FighterHome } from "@/widgets/fighter-home";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/home">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "fighterHome" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * `web.app.home` (SF-40): the Fighter home, FRW1 on the first run and the
 * home after it (Claude Design 34b). The Fighter layout's gate has already
 * established that the user is a Fighter with a completed onboarding.
 */
export default async function FighterHomePage({ params }: PageProps<"/[locale]/app/home">) {
  await resolveLocaleParam(params);
  return <FighterHome />;
}
