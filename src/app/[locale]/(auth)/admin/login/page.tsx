import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { continuationOf } from "@/shared/routes/continuation";
import { LoginScreen } from "@/widgets/auth-screens";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/admin/login">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return { title: t("metaTitle"), alternates: localeAlternates("/admin/login", locale) };
}

/**
 * `web.admin.login` (SF-120, AD0 `handoff`): where the Control Plane sends a
 * visitor without a session. It is the one SimpleFit sign-in (WA1) with the
 * validated continuation, so an operator returns to the Control Plane, whose
 * gate then checks operator access and the security key. Signing in grants
 * nothing by itself; there is no separate admin password.
 */
export default async function Page({ params, searchParams }: PageProps<"/[locale]/admin/login">) {
  await resolveLocaleParam(params);
  const continuation = continuationOf(await searchParams);
  return <LoginScreen continuation={continuation} />;
}
