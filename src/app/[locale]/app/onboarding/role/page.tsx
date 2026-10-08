import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { RoleSelection } from "@/widgets/role-selection";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/onboarding/role">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "roleSelection" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * WA6 Choose where to start (SF-47). The onboarding gate (layout) shows it
 * only when the entry resolver answers `role_selection`; a choice asks the
 * resolver again with that journey's intent.
 */
export default async function RoleSelectionPage({
  params,
}: PageProps<"/[locale]/app/onboarding/role">) {
  await resolveLocaleParam(params);
  return <RoleSelection />;
}
