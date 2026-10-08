import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { EntryRedirect } from "@/features/session-gate";
import { EntryFailure, LaunchScreen } from "@/widgets/system-states";

export async function generateMetadata({ params }: PageProps<"/[locale]/app">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "app" });
  return { title: t("metaTitle"), alternates: localeAlternates("/app", locale) };
}

/**
 * `web.app` (ENTRY, LD3): no page of its own. It resolves the signed-in
 * user's destination with the backend (`GET /api/v1/me/entry`, SF-45) and
 * replaces itself with it; the layout's session gate runs first.
 */
export default async function AppEntryPage({ params }: PageProps<"/[locale]/app">) {
  await resolveLocaleParam(params);
  return <EntryRedirect pending={<LaunchScreen />} failure={<EntryFailure />} />;
}
