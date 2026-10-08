import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { continuationOf } from "@/shared/routes/continuation";
import { SignupScreen } from "@/widgets/auth-screens";
import { SiteFrame } from "@/widgets/site-header";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/signup">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.signup" });
  return { title: t("metaTitle"), alternates: localeAlternates("/signup", locale) };
}

/** O02w sign-up in the public site chrome (SF-24). */
export default async function Page({ params, searchParams }: PageProps<"/[locale]/signup">) {
  await resolveLocaleParam(params);
  const continuation = continuationOf(await searchParams);
  return (
    <SiteFrame fill={false}>
      <SignupScreen continuation={continuation} />
    </SiteFrame>
  );
}
