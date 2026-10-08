import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { AccountRegistration } from "@/widgets/account-registration";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/app/onboarding/account">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "accountRegistration" });
  return { title: t("metaTitle"), robots: { index: false } };
}

/**
 * WA5 Account basics & consent (SF-46) on the SF-44 account registration.
 * The onboarding gate (layout) keeps an incomplete account here and sends a
 * complete one on to the entry resolver's destination.
 */
export default async function AccountRegistrationPage({
  params,
}: PageProps<"/[locale]/app/onboarding/account">) {
  await resolveLocaleParam(params);
  return <AccountRegistration />;
}
