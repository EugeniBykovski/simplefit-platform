import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { OperationsPage } from "@/widgets/admin-operations";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/integrations">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.operations" });
  return { title: t("metaTitle"), alternates: localeAlternates("/admin/integrations", locale) };
}

/**
 * `web.admin.integrations` (SF-126): AD17, system health from measurements only
 * (`system.health.read`), with the background job list (`system.jobs.read`).
 */
export default async function Page({ params }: PageProps<"/[locale]/admin/integrations">) {
  await resolveLocaleParam(params);
  return <OperationsPage />;
}
