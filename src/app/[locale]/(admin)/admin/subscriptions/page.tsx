import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { BillingPage } from "@/widgets/admin-billing";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/subscriptions">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.billing" });
  return { title: t("metaTitle"), alternates: localeAlternates("/admin/subscriptions", locale) };
}

/**
 * `web.admin.subscriptions` (SF-127): AD13, billing visibility of one Stripe mode
 * (`billing.read`), with reconciliation (`billing.reconciliation.read`). Read only.
 */
export default async function Page({ params }: PageProps<"/[locale]/admin/subscriptions">) {
  await resolveLocaleParam(params);
  return <BillingPage />;
}
