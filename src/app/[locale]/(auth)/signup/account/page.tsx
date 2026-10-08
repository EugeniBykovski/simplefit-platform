import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { continuationOf } from "@/shared/routes/continuation";
import { SignupAccountScreen } from "@/widgets/auth-screens";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/signup/account">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.account" });
  return { title: t("metaTitle"), alternates: localeAlternates("/signup/account", locale) };
}

/** WA3 create account, email only (SF-24). */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/[locale]/signup/account">) {
  await resolveLocaleParam(params);
  const continuation = continuationOf(await searchParams);
  return <SignupAccountScreen continuation={continuation} />;
}
