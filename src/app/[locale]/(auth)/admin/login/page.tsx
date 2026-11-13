import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { continuationOf } from "@/shared/routes/continuation";
import { AdminSignInScreen } from "@/widgets/auth-screens";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/login">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.password" });
  return {
    title: t("metaTitle"),
    alternates: localeAlternates("/admin/login", locale),
    robots: { index: false, follow: false },
  };
}

/**
 * `web.admin.login` (SF-157, AD0 `handoff`): where the Control Plane sends a
 * visitor without a session. Email and password (ADR 0012 amendment), with the
 * validated continuation, so an operator returns to the Control Plane, whose
 * gate then checks operator access. Signing in grants nothing by itself; the
 * one SimpleFit sign-in (Google, Apple, email code) stays one link away.
 */
export default async function Page({ params, searchParams }: PageProps<"/[locale]/admin/login">) {
  await resolveLocaleParam(params);
  const continuation = continuationOf(await searchParams);
  return <AdminSignInScreen continuation={continuation} />;
}
