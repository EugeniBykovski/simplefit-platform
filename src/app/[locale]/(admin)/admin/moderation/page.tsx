import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { TrustSafetyUnavailable } from "@/widgets/admin-trust-safety";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/moderation">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.trustSafety.moderation" });
  return { title: t("metaTitle"), alternates: localeAlternates("/admin/moderation", locale) };
}

/**
 * `web.admin.moderation` (SF-125): a truthful "not available" screen. No reports, content
 * or enforcement domain exists to review (simplefit-api D-SA32); no data, no API call.
 */
export default async function Page({ params }: PageProps<"/[locale]/admin/moderation">) {
  await resolveLocaleParam(params);
  return <TrustSafetyUnavailable area="moderation" />;
}
