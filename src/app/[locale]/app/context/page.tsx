import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { ContextSelection } from "@/widgets/context-selection";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/context">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "contextSelection" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * `web.app.context` (WCX1, SF-54): where the entry resolver's
 * `context_selection` lands. The page shows only while the entry answers it;
 * any other answer continues to its destination.
 */
export default async function ContextSelectionPage({ params }: PageProps<"/[locale]/app/context">) {
  await resolveLocaleParam(params);
  return <ContextSelection />;
}
