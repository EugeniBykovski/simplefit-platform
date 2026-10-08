import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { continuationOf } from "@/shared/routes/continuation";
import { SignupVerifyScreen } from "@/widgets/auth-screens";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/signup/verify">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.code.registration" });
  return {
    title: t("metaTitle"),
    alternates: localeAlternates("/signup/verify", locale),
    robots: { index: false },
  };
}

/** WA4 verify email (SF-24). */
export default async function Page({ params, searchParams }: PageProps<"/[locale]/signup/verify">) {
  await resolveLocaleParam(params);
  const continuation = continuationOf(await searchParams);
  return <SignupVerifyScreen continuation={continuation} />;
}
