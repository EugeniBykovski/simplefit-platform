import { useTranslations } from "next-intl";

import { SignInCodeStep, SignInEmailForm } from "@/features/email-auth";
import { AppleSignInButton } from "@/features/sign-in-with-apple";
import { GoogleSignInButton } from "@/features/sign-in-with-google";
import { Link } from "@/shared/i18n/navigation";
import { withContinuation, type Continuation } from "@/shared/routes/continuation";
import { routeHref } from "@/shared/routes/routes";
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
 * then enters the application through the backend entry resolution (SF-45).
 */
export function LoginScreen({ continuation }: { continuation?: Continuation }) {
  const t = useTranslations("auth.login");

  return (
    <AuthSplitFrame hero={t("hero")} panel={<AfterSignInPanel />}>
      <div className="flex flex-col gap-3.5">
        <h1 className="type-auth-heading">{t("title")}</h1>
        <p className="type-body text-pretty text-muted-foreground">{t("description")}</p>
        {/*
          WA1 draws two 52 px provider buttons and a 50 px CTA, all 15 px 800
          on radius 18. Google's own button (GSI, at most 400 × 40) is centred
          in a 52 px slot, so the provider pair keeps its designed rhythm.
        */}
        <GoogleSignInButton className="min-h-13" />
        <AppleSignInButton className="h-13" />
        <AuthDivider label={t("orEmail")} />
        <SignInEmailForm
          continuation={continuation}
          submitLabel={t("emailSubmit")}
          submitSize="xl"
          submitClassName="h-12.5"
          hint={t("emailHint")}
          className="flex flex-col gap-3.5"
        />
        {/* The hint and this line are 13 px on 20 px lines; the artboard's are 18. */}
        <p className="-mt-1 type-body-sm text-faint-foreground">
          {t.rich("noAccount", {
            link: (chunks) => (
              <Link href={withContinuation("web.signup", continuation)} className={textLinkClass}>
                {chunks}
              </Link>
            ),
            sponsor: (chunks) => (
              <Link href={routeHref("web.sponsor.login")} className={textLinkClass}>
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
export function LoginCodeScreen({ continuation }: { continuation?: Continuation }) {
  const t = useTranslations("auth.login");
  return (
    <AuthSplitFrame hero={t("hero")} panel={<AfterSignInPanel />} column="code">
      <SignInCodeStep continuation={continuation} />
    </AuthSplitFrame>
  );
}
