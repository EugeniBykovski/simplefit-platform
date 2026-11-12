import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { OperatorsPage } from "@/widgets/admin-operators";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/staff">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.operators" });
  return { title: t("metaTitle"), alternates: localeAlternates("/admin/staff", locale) };
}

/**
 * `web.admin.staff` (SF-129): AD20, the operators with each permission's provenance
 * (`operators.read`), adding an operator and the SF-111 actions (`operators.manage`),
 * their history (`audit.read`) and the viewer's own security.
 */
export default async function Page({ params }: PageProps<"/[locale]/admin/staff">) {
  await resolveLocaleParam(params);
  return <OperatorsPage />;
}
