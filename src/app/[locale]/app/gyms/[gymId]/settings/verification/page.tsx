import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";

import { VerificationScreen } from "./verification-screen";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/settings/verification">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "gymVerification" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * `web.app.gyms._gym-id.settings.verification` (OG7, SF-103): the gym's business verification (the owner's application, documents and submission), inside
 * the console of the gym in the path (the layout authorizes the gym).
 */
export default async function GymVerificationPage({
  params,
}: PageProps<"/[locale]/app/gyms/[gymId]/settings/verification">) {
  await resolveLocaleParam(params);
  return <VerificationScreen />;
}
