import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { PlanPage } from "@/widgets/admin-billing";

const PLAN_KEY = /^[a-z][a-z0-9_]{1,39}$/;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/pricing/[planId]">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "controlPlane.billing.plans" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * `web.admin.pricing._plan-id` (SF-127): AR5 read-only, one plan's version history. The
 * id is the plan key; anything else is never sent to the API.
 */
export default async function Page({ params }: PageProps<"/[locale]/admin/pricing/[planId]">) {
  await resolveLocaleParam(params);
  const { planId } = await params;
  if (!PLAN_KEY.test(planId)) notFound();
  return <PlanPage planKey={planId} />;
}
