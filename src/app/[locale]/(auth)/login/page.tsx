import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { sanitizeReturnTo } from "@/shared/routes/return-to";
import { LoginScreen } from "@/widgets/auth-screens";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/login">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return { title: t("metaTitle"), alternates: localeAlternates("/login", locale) };
}

/** WA1 sign in (SF-22 Google, SF-23 Apple, SF-24 email code). */
export default async function Page({ params, searchParams }: PageProps<"/[locale]/login">) {
  await resolveLocaleParam(params);
  const returnTo = sanitizeReturnTo((await searchParams).returnTo);
  return <LoginScreen returnTo={returnTo} />;
}
