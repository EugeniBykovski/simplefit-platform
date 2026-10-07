import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { sanitizeReturnTo } from "@/shared/routes/return-to";
import { LoginCodeScreen } from "@/widgets/auth-screens";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/login/code">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.code.signIn" });
  return {
    title: t("metaTitle"),
    alternates: localeAlternates("/login/code", locale),
    robots: { index: false },
  };
}

/** WA1b sign-in code (SF-24). */
export default async function Page({ params, searchParams }: PageProps<"/[locale]/login/code">) {
  await resolveLocaleParam(params);
  const returnTo = sanitizeReturnTo((await searchParams).returnTo);
  return <LoginCodeScreen returnTo={returnTo} />;
}
