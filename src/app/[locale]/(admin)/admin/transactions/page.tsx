import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { InvoicesPage } from "@/widgets/admin-billing";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/transactions">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.billing.invoices" });
  return { title: t("metaTitle"), alternates: localeAlternates("/admin/transactions", locale) };
}

/**
 * `web.admin.transactions` (SF-127): AR2 read-only, recorded Stripe invoices of gyms
 * paying SimpleFit, one mode at a time (`billing.read`). No refund or export.
 */
export default async function Page({ params }: PageProps<"/[locale]/admin/transactions">) {
  await resolveLocaleParam(params);
  return <InvoicesPage />;
}
