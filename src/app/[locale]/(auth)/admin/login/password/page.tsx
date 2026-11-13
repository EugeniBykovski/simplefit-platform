import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { continuationOf } from "@/shared/routes/continuation";
import { AdminPasswordScreen } from "@/widgets/auth-screens";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/login/password">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.password.reset" });
  return {
    title: t("metaTitle"),
    alternates: localeAlternates("/admin/login/password", locale),
    robots: { index: false, follow: false },
  };
}

/**
 * `web.admin.password` (SF-157): set or reset a password with a code emailed to
 * the account's address. Signs the account out everywhere and signs nobody in;
 * the continuation is kept for the sign-in that follows.
 */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/[locale]/admin/login/password">) {
  await resolveLocaleParam(params);
  const continuation = continuationOf(await searchParams);
  return <AdminPasswordScreen continuation={continuation} />;
}
