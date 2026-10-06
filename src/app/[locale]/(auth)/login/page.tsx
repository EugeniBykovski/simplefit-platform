import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { AppleSignInButton } from "@/features/sign-in-with-apple";
import { GoogleSignInButton } from "@/features/sign-in-with-google";
import { Link } from "@/shared/i18n/navigation";
import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { AuthFrame } from "@/widgets/auth-frame";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/login">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.login" });
  return { title: t("metaTitle"), alternates: localeAlternates("/login", locale) };
}

/** WA1 sign-in with Google (SF-22) and Apple (SF-23); the email code step follows in SF-24. */
export default async function LoginPage({ params }: PageProps<"/[locale]/login">) {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.login" });

  return (
    <AuthFrame
      title={t("title")}
      description={t("description")}
      footer={t.rich("noAccount", {
        link: (chunks) => (
          <Link href="/signup" className="rounded-xs font-extrabold text-highlight">
            {chunks}
          </Link>
        ),
      })}
    >
      <GoogleSignInButton />
      <AppleSignInButton />
    </AuthFrame>
  );
}
