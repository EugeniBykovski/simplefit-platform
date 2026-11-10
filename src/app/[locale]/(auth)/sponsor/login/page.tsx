import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { continuationOf } from "@/shared/routes/continuation";
import { LoginScreen } from "@/widgets/auth-screens";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sponsor/login">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return { title: t("metaTitle"), alternates: localeAlternates("/sponsor/login", locale) };
}

/**
 * `web.sponsor.login` (SF-117): where the partner portal sends a visitor
 * without a session. It is the one SimpleFit sign-in (WA1: Google, Apple,
 * email code) with the validated continuation, so a portal link returns to
 * that portal after sign-in, once the entry resolver reports the workspace.
 * There is no separate sponsor sign-in: SPX3's own layout is not built.
 */
export default async function Page({ params, searchParams }: PageProps<"/[locale]/sponsor/login">) {
  await resolveLocaleParam(params);
  const continuation = continuationOf(await searchParams);
  return <LoginScreen continuation={continuation} />;
}
