import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { FighterTraining } from "@/widgets/fighter-training";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/training">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "fighterTraining" });
  return { title: t("meta.title"), description: t("meta.description"), robots: { index: false } };
}

/**
 * `web.app.training` (WFT1, SF-67): the fighter's training sessions.
 * `?view=history` shows History, narrowed by `?status=completed|cancelled`;
 * any other value is Upcoming. The Fighter gate of the `(fighter)` layout
 * has already run.
 */
export default async function FighterTrainingPage({
  params,
  searchParams,
}: PageProps<"/[locale]/app/training">) {
  await resolveLocaleParam(params);
  const { view, status } = await searchParams;
  const history = view === "history";
  return (
    <FighterTraining
      view={history ? "history" : "upcoming"}
      filter={history && (status === "completed" || status === "cancelled") ? status : "all"}
    />
  );
}
