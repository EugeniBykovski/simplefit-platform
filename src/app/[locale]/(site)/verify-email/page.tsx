import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { resolveLocaleParam } from "@/shared/i18n/params";
import { VerifyEmailScreen } from "@/widgets/auth-screens";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/verify-email">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.verifyEmail" });
  // A one-time link target: never indexed, and no referrer leaves the page.
  return { title: t("metaTitle"), robots: { index: false }, referrer: "no-referrer" };
}

/** WA4b, the E01 link (SF-24): verifies the address only, never creates a session. */
export default async function VerifyEmailPage({ params }: PageProps<"/[locale]/verify-email">) {
  await resolveLocaleParam(params);
  return <VerifyEmailScreen />;
}
