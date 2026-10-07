import { useTranslations } from "next-intl";

import { SignInCodeStep, SignInEmailForm } from "@/features/email-auth";
import { AppleSignInButton } from "@/features/sign-in-with-apple";
import { GoogleSignInButton } from "@/features/sign-in-with-google";
import { Link } from "@/shared/i18n/navigation";
import { withReturnTo } from "@/shared/routes/return-to";
import { textLinkClass } from "@/shared/ui/text-link";

import { AuthDivider, AuthInfoList, AuthSplitFrame } from "./auth-frame";

/*
 * WA1 and WA1b (Claude Design WebLogin / WebSignInCode, 1440) share the split
 * frame and its brand panel. The panel's "After sign-in" card is a static
 * overview of each role's home; the line above it ("You land in your last
 * workspace") claims a runtime fact the API cannot provide yet (SF-25+) and
 * is not rendered.
 */

const ROLE_HOMES = ["fighter", "coach", "gym", "sponsor"] as const;

function AfterSignInPanel() {
  const t = useTranslations("auth.login.afterSignIn");
  return (
    <AuthInfoList
      variant="panel"
      title={t("title")}
      rows={ROLE_HOMES.map((key) => ({
        key,
        title: t(`${key}.title`),
        detail: t(`${key}.detail`),
      }))}
    />
  );
}

/**
 * WA1 "Sign in": Google (SF-22), Apple (SF-23) and the email sign-in code
 * (SF-24). Every method ends in the same session pipeline; the auth layout
 * then enters the application (a valid `returnTo`, otherwise `/app`).
 */
export function LoginScreen({ returnTo }: { returnTo?: string }) {
  const t = useTranslations("auth.login");

  return (
    <AuthSplitFrame hero={t("hero")} panel={<AfterSignInPanel />}>
      <div className="flex flex-col gap-3.5">
        <h1 className="type-auth-heading">{t("title")}</h1>
        <p className="type-body text-pretty text-muted-foreground">{t("description")}</p>
        {/*
          WA1 draws two 52 px provider buttons and a 50 px CTA. Apple is the
          nearest button step (`xl`, 54) and the CTA `lg` (48); Google renders
          in a 50 px slot, so the provider pair keeps its designed 2 × 52 px.
        */}
        <GoogleSignInButton className="min-h-12.5" />
        <AppleSignInButton />
        <AuthDivider label={t("orEmail")} />
        <SignInEmailForm
          returnTo={returnTo}
          submitLabel={t("emailSubmit")}
          submitSize="lg"
          hint={t("emailHint")}
          className="flex flex-col gap-3.5"
        />
        {/* The hint and this line are 13 px on 20 px lines; the artboard's are 18. */}
        <p className="-mt-1 type-body-sm text-faint-foreground">
          {t.rich("noAccount", {
            link: (chunks) => (
              <Link href={withReturnTo("web.signup", returnTo)} className={textLinkClass}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </AuthSplitFrame>
  );
}

/** WA1b "Enter your sign-in code" (email_sign_in). */
export function LoginCodeScreen({ returnTo }: { returnTo?: string }) {
  const t = useTranslations("auth.login");
  return (
    <AuthSplitFrame hero={t("hero")} panel={<AfterSignInPanel />} column="code">
      <SignInCodeStep returnTo={returnTo} />
    </AuthSplitFrame>
  );
}
