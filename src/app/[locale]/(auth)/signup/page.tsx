import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { GoogleSignInButton } from "@/features/sign-in-with-google";
import { Link } from "@/shared/i18n/navigation";
import { localeAlternates } from "@/shared/i18n/metadata";
import { resolveLocaleParam } from "@/shared/i18n/params";
import { AuthFrame } from "@/widgets/auth-frame";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/signup">): Promise<Metadata> {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.signup" });
  return { title: t("metaTitle"), alternates: localeAlternates("/signup", locale) };
}

/** O02w sign-up, Google only (SF-22); the role picker and email follow in SF-24. */
export default async function SignupPage({ params }: PageProps<"/[locale]/signup">) {
  const locale = await resolveLocaleParam(params);
  const t = await getTranslations({ locale, namespace: "auth.signup" });

  return (
    <AuthFrame
      title={t("title")}
      description={t("description")}
      footer={t.rich("haveAccount", {
        link: (chunks) => (
          <Link href="/login" className="rounded-xs font-extrabold text-highlight">
            {chunks}
          </Link>
        ),
      })}
    >
      <GoogleSignInButton />
    </AuthFrame>
  );
}
