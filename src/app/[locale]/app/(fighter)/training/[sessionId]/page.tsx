import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { FighterSessionDetail } from "@/widgets/fighter-training";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/training/[sessionId]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "fighterTraining" });
  return {
    title: t("meta.sessionTitle"),
    description: t("meta.sessionDescription"),
    robots: { index: false },
  };
}

/**
 * `web.app.training._session-id` (WFT2, SF-67): one of the fighter's own
 * sessions. The backend decides whether it is theirs.
 */
export default async function FighterSessionPage({
  params,
}: PageProps<"/[locale]/app/training/[sessionId]">) {
  await resolveLocaleParam(params);
  const { sessionId } = await params;
  return <FighterSessionDetail sessionId={sessionId} />;
}
