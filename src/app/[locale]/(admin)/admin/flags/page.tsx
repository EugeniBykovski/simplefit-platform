import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { ConfigurationPage } from "@/widgets/admin-configuration";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/flags">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.configuration" });
  return { title: t("metaTitle"), alternates: localeAlternates("/admin/flags", locale) };
}

/**
 * `web.admin.flags` (SF-128): AD6 reduced, the registered feature switches
 * (`config.read`) and suspending or restoring the allowlisted ones (`config.flags.write`).
 */
export default async function Page({ params }: PageProps<"/[locale]/admin/flags">) {
  await resolveLocaleParam(params);
  return <ConfigurationPage />;
}
