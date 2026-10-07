import { Building2Icon, DumbbellIcon, InfoIcon, MailIcon, StarIcon, UsersIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { RegistrationCodeStep, RegistrationEmailForm } from "@/features/email-auth";
import { AppleSignInButton } from "@/features/sign-in-with-apple";
import { GoogleSignInButton } from "@/features/sign-in-with-google";
import { Link } from "@/shared/i18n/navigation";
import { withReturnTo } from "@/shared/routes/return-to";
import { Badge } from "@/shared/ui/badge";
import { BrandTile } from "@/shared/ui/brand-mark";
import { Button } from "@/shared/ui/button";
import { Container } from "@/shared/ui/container";
import { Notice } from "@/shared/ui/notice";
import { textLinkClass } from "@/shared/ui/text-link";

import { AuthStepFrame } from "./auth-frame";

const ROLE_CARDS = [
  { key: "fighter", icon: DumbbellIcon },
  { key: "coach", icon: UsersIcon },
  { key: "gym", icon: Building2Icon },
  { key: "sponsor", icon: StarIcon },
] as const;

/**
 * O02w "Join the boxing community": Google, Apple or email (SF-24). Renders
 * the page body; the page puts it in the public site header and footer.
 *
 * The role cards describe the roles one account can hold. Choosing a role at
 * sign-up belongs to the onboarding domain (SF-25): the cards are not
 * selectable, carry no "Continue" action and nothing about a role is sent or
 * stored.
 */
export function SignupScreen({ returnTo }: { returnTo?: string }) {
  const t = useTranslations("auth.signup");

  return (
    <Container className="grid gap-10 py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-16 lg:py-14">
      <div className="flex min-w-0 flex-col gap-5.5">
        <BrandTile size="xl" />
        <h1 className="type-auth-display text-balance">
          {t.rich("title", { hl: (chunks) => <span className="text-highlight">{chunks}</span> })}
        </h1>
        <p className="type-auth-lead text-pretty text-muted-foreground">{t("description")}</p>
        <div className="flex max-w-105 flex-col gap-2.5">
          <GoogleSignInButton />
          <AppleSignInButton />
          <Button asChild variant="quiet" size="xl" className="w-full">
            <Link href={withReturnTo("web.signup.account", returnTo)}>
              <MailIcon aria-hidden />
              {t("email")}
            </Link>
          </Button>
        </div>
        <p className="type-body-sm text-pretty text-faint-foreground">
          {t.rich("haveAccount", {
            link: (chunks) => (
              <Link href={withReturnTo("web.login", returnTo)} className={textLinkClass}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
      {/* 64 + 8 px: the designed 72 px column gap from canonical steps. */}
      <section aria-labelledby="signup-roles" className="flex min-w-0 flex-col gap-4 lg:pl-2">
        <h2 id="signup-roles" className="type-label-lg text-highlight">
          {t("roles.title")}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ROLE_CARDS.map(({ key, icon: Icon }) => (
            <li key={key} className="flex flex-col gap-2.5 rounded-3xl border bg-surface p-5">
              <span
                aria-hidden
                className="flex size-11.5 items-center justify-center rounded-lg bg-surface-elevated text-highlight"
              >
                <Icon className="size-5.5" />
              </span>
              <h3 className="type-h3">{t(`roles.${key}.title`)}</h3>
              <p className="type-body-sm text-pretty text-muted-foreground">
                {t(`roles.${key}.description`)}
              </p>
            </li>
          ))}
        </ul>
        <Notice tone="muted" icon={InfoIcon}>
          {t("roles.note")}
        </Notice>
      </section>
    </Container>
  );
}

const IDENTITY_ROLES = ["fighter", "coach", "gym", "sponsor"] as const;

/**
 * WA3 "Create your SimpleFit account" (email_verification). The registration
 * API takes the email address only: the design's role selector, full name,
 * consent checkboxes and per-role "What happens next" belong to the
 * onboarding domain (SF-25) and are not rendered, so nothing suggests they
 * were stored. The approved legal line stays as static copy; it records
 * nothing.
 */
export function SignupAccountScreen({ returnTo }: { returnTo?: string }) {
  const t = useTranslations("auth.account");
  const signIn = (chunks: ReactNode) => (
    <Link href={withReturnTo("web.login", returnTo)} className={textLinkClass}>
      {chunks}
    </Link>
  );

  return (
    <AuthStepFrame
      action={t.rich("member", { link: signIn })}
      aside={
        <div className="flex flex-col gap-3 rounded-3xl border bg-surface p-5.5">
          <h2 className="type-label text-faint-foreground">{t("identity.title")}</h2>
          <p className="type-body text-pretty">{t("identity.body")}</p>
          <ul className="flex flex-wrap items-center gap-1.5">
            {IDENTITY_ROLES.map((role) => (
              <li key={role}>
                <Badge>{t(`identity.roles.${role}`)}</Badge>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <div className="flex max-w-103 flex-col gap-4">
        <p className="type-label text-highlight">{t("eyebrow")}</p>
        <h1 className="type-auth-title text-balance">{t("title")}</h1>
        <RegistrationEmailForm
          returnTo={returnTo}
          submitLabel={t("submit")}
          hint={t("hint")}
          hintPlacement="field"
          fullWidth={false}
          className="flex flex-col gap-4"
        >
          <p className="type-body-sm text-pretty text-faint-foreground">{t("legal")}</p>
        </RegistrationEmailForm>
        <p className="type-body-sm text-faint-foreground">
          {t.rich("haveAccount", { link: signIn })}
        </p>
      </div>
    </AuthStepFrame>
  );
}

/**
 * WA4 "Verify your email" (email_verification). The design's aside (an E01
 * email preview and the per-role "After verifying" destinations) is
 * deferred: the destinations need the onboarding domain (SF-25).
 */
export function SignupVerifyScreen({ returnTo }: { returnTo?: string }) {
  return (
    <AuthStepFrame>
      <RegistrationCodeStep returnTo={returnTo} />
    </AuthStepFrame>
  );
}
