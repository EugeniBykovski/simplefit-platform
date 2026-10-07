import { useTranslations } from "next-intl";

import { SignInCodeStep, SignInEmailForm } from "@/features/email-auth";
import { AppleSignInButton } from "@/features/sign-in-with-apple";
import { GoogleSignInButton } from "@/features/sign-in-with-google";
import { Link } from "@/shared/i18n/navigation";
import { withReturnTo } from "@/shared/routes/return-to";
import { textLinkClass } from "@/shared/ui/text-link";

import { AuthDivider, AuthSplitFrame } from "./auth-frame";

/*
 * WA1 and WA1b (Claude Design onboarding page, 1440). The panel's "You land in
 * your last workspace" line and its "After sign-in" destination list describe
 * runtime facts the API cannot provide yet (workspaces, last workspace); they
 * are deferred to SF-25+ and not rendered.
 */

/**
 * WA1 "Sign in": Google (SF-22), Apple (SF-23) and the email sign-in code
 * (SF-24). Every method ends in the same session pipeline; the auth layout
 * then enters the application (a valid `returnTo`, otherwise `/app`).
 */
export function LoginScreen({ returnTo }: { returnTo?: string }) {
  const t = useTranslations("auth.login");

  return (
    <AuthSplitFrame hero={t("hero")}>
      <div className="flex flex-col gap-3.5">
        <h1 className="type-auth-heading">{t("title")}</h1>
        <p className="type-body text-pretty text-muted-foreground">{t("description")}</p>
        <GoogleSignInButton />
        <AppleSignInButton />
        <AuthDivider label={t("orEmail")} />
        <SignInEmailForm
          returnTo={returnTo}
          submitLabel={t("emailSubmit")}
          hint={t("emailHint")}
          className="flex flex-col gap-3.5"
        />
        <p className="type-body-sm text-faint-foreground">
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
    <AuthSplitFrame hero={t("hero")}>
      <SignInCodeStep returnTo={returnTo} />
    </AuthSplitFrame>
  );
}
