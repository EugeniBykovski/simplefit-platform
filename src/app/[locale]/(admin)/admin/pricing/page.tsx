import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { PlansPage } from "@/widgets/admin-billing";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/pricing">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.billing.plans" });
  return { title: t("metaTitle"), alternates: localeAlternates("/admin/pricing", locale) };
}

/**
 * `web.admin.pricing` (SF-127): AR4 read-only, the SaaS plan catalog with every version
 * (`billing.read`). No plan, price or entitlement edit.
 */
export default async function Page({ params }: PageProps<"/[locale]/admin/pricing">) {
  await resolveLocaleParam(params);
  return <PlansPage />;
}
