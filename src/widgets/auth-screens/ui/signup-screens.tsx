import {
  Building2Icon,
  CircleHelpIcon,
  DumbbellIcon,
  InfoIcon,
  MailIcon,
  StarIcon,
  UsersIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { RegistrationCodeStep, RegistrationEmailForm } from "@/features/email-auth";
import { AppleSignInButton } from "@/features/sign-in-with-apple";
import { GoogleSignInButton } from "@/features/sign-in-with-google";
import { Link } from "@/shared/i18n/navigation";
import { cn } from "@/shared/lib/utils";
import { routeHref } from "@/shared/routes/routes";
import { withReturnTo } from "@/shared/routes/return-to";
import { Badge } from "@/shared/ui/badge";
import { BrandMark, BrandTile } from "@/shared/ui/brand-mark";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Container } from "@/shared/ui/container";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";
import { textLinkClass } from "@/shared/ui/text-link";

import { AuthInfoList, AuthStepFrame } from "./auth-frame";

/*
 * Sign-up compositions (Claude Design WebSignUp O02w, WebRegAccount WA3,
 * WebRegVerify WA4). The registration API owns the email address only, so
 * every designed element whose behaviour belongs to the onboarding domain
 * (SF-25) keeps its place in a non-deceptive state: role cards link on
 * without carrying a role, the WA3 role selector, full name and consents are
 * disabled and never sent, and the role overviews are static.
 */

const ROLE_CARDS = [
  { key: "fighter", icon: DumbbellIcon },
  { key: "coach", icon: UsersIcon },
  { key: "gym", icon: Building2Icon },
  { key: "sponsor", icon: StarIcon },
] as const;

/**
 * O02w "Join the boxing community" (page body; the page renders it in the
 * site chrome): the site Container, a 1 : 1.25 grid with a 72 px gap (64 +
 * 8 px steps). Left: tile, headline, lead, the three 54 px methods (max
 * 420 px) and the sign-in / legal line. Right: the role cards (2 × 2, 16 px
 * gap; Fighter is the design's emphasised card) and the info strip.
 */
export function SignupScreen({ returnTo }: { returnTo?: string }) {
  const t = useTranslations("auth.signup");
  const account = withReturnTo("web.signup.account", returnTo);

  return (
    <Container
      data-auth-frame="signup"
      // WebSignUp: (1312 − 72) split 1 : 1.25 with a 72 px gap. The left track is
      // that exact share; the canonical 64 px gap plus the section's 8 px inset
      // make the 72 px.
      className="grid gap-10 py-10 lg:grid-cols-[minmax(0,calc((100%-4.5rem)/2.25))_minmax(0,1fr)] lg:gap-16 lg:py-14"
    >
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
            <Link href={account}>
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
      <section aria-labelledby="signup-roles" className="flex min-w-0 flex-col gap-4 lg:pl-2">
        <h2 id="signup-roles" className="type-label-lg text-highlight">
          {t("roles.title")}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ROLE_CARDS.map(({ key, icon: Icon }, index) => {
            const emphasised = index === 0;
            return (
              <li key={key} className="flex">
                <Link
                  href={key === "sponsor" ? routeHref("web.partners.apply") : account}
                  className={cn(
                    "flex w-full flex-col gap-2.5 rounded-3xl border p-5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    emphasised
                      ? "border-[1.5px] border-highlight bg-accent"
                      : "bg-surface hover:border-border-strong",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-11.5 items-center justify-center rounded-lg",
                      emphasised
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-elevated text-highlight",
                    )}
                  >
                    <Icon className="size-5.5" />
                  </span>
                  <span className="type-h3">{t(`roles.${key}.title`)}</span>
                  <span className="type-body-sm text-pretty text-muted-foreground">
                    {t(`roles.${key}.description`)}
                  </span>
                  <span className="mt-auto type-body-sm font-extrabold text-highlight">
                    {t("roles.continue")}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <Notice tone="muted" icon={InfoIcon}>
          {t("roles.note")}
        </Notice>
      </section>
    </Container>
  );
}

const IDENTITY_ROLES = ["fighter", "coach", "gym", "sponsor"] as const;
const SIGNUP_ROLES = ["fighter", "coach", "gym"] as const;
const CONSENTS = [
  { key: "terms", required: true },
  { key: "age", required: true },
  { key: "news", required: false },
] as const;
const NEXT_STEPS = ["verify", "setup", "home"] as const;

/**
 * WA3 "Create your SimpleFit account" (email_verification), in the auth step
 * frame (1fr | 420 px, 56 px gap). The role selector, full name and consent
 * checkboxes are rendered in place but disabled and never sent: they are set
 * after verification by the onboarding domain (SF-25). Only the email address
 * is submitted.
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
        <>
          <div className="flex flex-col gap-3 rounded-3xl border bg-surface p-5.5">
            <h2 className="type-label text-faint-foreground">{t("identity.title")}</h2>
            <p className="type-body text-pretty">{t("identity.body")}</p>
            <ul className="flex flex-wrap items-center gap-1.5">
              {IDENTITY_ROLES.map((role, index) => (
                <li key={role}>
                  {/* WA3 draws FIGHTER in the olive accent, matching the Fighter segment. */}
                  <Badge variant={index === 0 ? "accent" : "neutral"}>
                    {t(`identity.roles.${role}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
          <AuthInfoList
            title={t("next.title")}
            rows={NEXT_STEPS.map((key) => ({
              key,
              title: t(`next.${key}.title`),
              detail: t(`next.${key}.detail`),
            }))}
          />
          <Notice tone="muted" icon={CircleHelpIcon}>
            {t("next.note")}
          </Notice>
        </>
      }
    >
      <div data-auth-step-column className="flex flex-col gap-4">
        <p className="type-label text-highlight">{t("eyebrow")}</p>
        <h1 className="type-auth-title text-balance">{t("title")}</h1>
        <div className="flex flex-col gap-2">
          <p id="signup-role-label" className="type-body-sm font-bold text-muted-foreground">
            {t("signingUpAs")}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="signup-role-label"
            aria-disabled="true"
            className="grid grid-cols-3 gap-1 rounded-3xl border bg-surface p-1"
          >
            {SIGNUP_ROLES.map((role, index) => {
              // WA3 draws Fighter as the selected (bone) segment. The control is
              // presentation only: nothing is submitted, stored or put in the URL.
              const active = index === 0;
              return (
                <span
                  key={role}
                  role="radio"
                  aria-checked={active}
                  aria-disabled="true"
                  data-active={active || undefined}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-xl type-caption",
                    active
                      ? "bg-secondary font-extrabold text-secondary-foreground"
                      : "font-bold text-muted-foreground",
                  )}
                >
                  {t(`roles.${role}`)}
                </span>
              );
            })}
          </div>
          <p className="type-body-sm text-faint-foreground">
            {t.rich("sponsor", {
              link: (chunks) => (
                <Link href={routeHref("web.partners.apply")} className={textLinkClass}>
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
        <RegistrationEmailForm
          returnTo={returnTo}
          submitLabel={t("submit")}
          hint={t("hint")}
          hintPlacement="field"
          fullWidth={false}
          className="flex flex-col gap-4"
          besideField={
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="signup-full-name"
                className="type-caption font-bold text-muted-foreground"
              >
                {t("fullName")}
              </label>
              {/* Presentation only (SF-25 owns the profile): never submitted. */}
              <Input
                id="signup-full-name"
                fieldSize="lg"
                disabled
                autoComplete="off"
                className="disabled:bg-background disabled:opacity-100"
              />
            </div>
          }
        >
          <div className="flex flex-col gap-2.5">
            {CONSENTS.map(({ key, required }) => (
              <label key={key} className="flex items-center gap-3">
                {/* Never pre-ticked and never stored: consent persistence is SF-25. */}
                <Checkbox
                  disabled
                  checked={false}
                  className="size-5.5 rounded-xs border-2 border-border-strong disabled:cursor-default disabled:opacity-100"
                />
                <span className="type-body font-semibold">
                  {t(`consents.${key}`)}
                  {required && (
                    <span className="text-faint-foreground"> {t("consents.required")}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </RegistrationEmailForm>
        <p className="type-body-sm text-faint-foreground">
          {t.rich("haveAccount", { link: signIn })}
        </p>
      </div>
    </AuthStepFrame>
  );
}

const AFTER_VERIFYING = ["fighter", "coach", "gym"] as const;

/**
 * WA4 "Verify your email" (email_verification), in the auth step frame. The
 * aside shows the E01 email as an illustration with the code masked (never a
 * code anyone could type) and a static "After verifying" overview.
 */
export function SignupVerifyScreen({ returnTo }: { returnTo?: string }) {
  const t = useTranslations("auth.code.registration.aside");

  return (
    <AuthStepFrame
      aside={
        <>
          <section
            aria-label={t("preview.label")}
            className="flex flex-col gap-2.5 rounded-3xl border bg-surface p-4.5"
          >
            <p className="type-label text-faint-foreground">{t("preview.label")}</p>
            <div className="flex flex-col gap-2.5 rounded-lg bg-secondary p-4.5 text-secondary-foreground">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="flex size-6.5 flex-none items-center justify-center rounded-sm bg-primary text-primary-foreground"
                >
                  <BrandMark className="size-4.5" />
                </span>
                <span className="type-body-sm font-extrabold">{t("preview.brand")}</span>
              </div>
              <p className="type-h3">{t("preview.code")}</p>
              <p className="type-caption">{t("preview.body")}</p>
            </div>
          </section>
          <AuthInfoList
            variant="compact"
            title={t("afterVerifying.title")}
            rows={AFTER_VERIFYING.map((key) => ({
              key,
              title: t(`afterVerifying.${key}.title`),
              detail: t(`afterVerifying.${key}.detail`),
            }))}
          />
        </>
      }
    >
      <RegistrationCodeStep returnTo={returnTo} />
    </AuthStepFrame>
  );
}
