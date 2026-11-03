import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";

import { PlanScreen } from "./plan-screen";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/settings/plan">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymBilling" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * `web.app.gyms._gym-id.settings.plan` (WG25, SF-102): the gym's SimpleFit
 * plan, its Stripe-reconciled payment state and invoices, inside the console
 * of the gym in the path (the layout authorizes the gym). Owner only.
 */
export default async function GymPlanPage({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/settings/plan">) {
  await resolveLocaleParam(params);
  return <PlanScreen />;
}
