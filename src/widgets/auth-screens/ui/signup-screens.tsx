import {
  Building2Icon,
  CakeIcon,
  CircleHelpIcon,
  DumbbellIcon,
  FileTextIcon,
  InfoIcon,
  MailIcon,
  NewspaperIcon,
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
import { withContinuation, type Continuation } from "@/shared/routes/continuation";
import { Badge } from "@/shared/ui/badge";
import { BrandMark, BrandTile } from "@/shared/ui/brand-mark";
import { Button } from "@/shared/ui/button";
import { Container } from "@/shared/ui/container";
import { Input } from "@/shared/ui/input";
import { Notice } from "@/shared/ui/notice";
import { textLinkClass } from "@/shared/ui/text-link";

import { AuthInfoList, AuthStepFrame } from "./auth-frame";

/*
 * Sign-up compositions (Claude Design WebSignUp O02w, WebRegAccount WA3,
 * WebRegVerify WA4). The registration API owns the email address only, so
 * every designed element whose behaviour belongs to the onboarding domain
 * keeps its place in a non-deceptive state: the WA3 role selector, full name
 * and consents are disabled and never sent, and the role overviews are
 * static. The O02w role cards carry the journey as the ephemeral `intent`
 * continuation (SF-45): navigation only, resolved after authentication by
 * the backend, never a role. Google and Apple carry only an intent the page
 * already has; on their own they never mean Fighter.
 *
 * Consent is recorded after authentication, by account registration (WA5,
 * SF-44), never before a User exists. WA3 therefore draws its three agreement
 * rows (D-WA3-PREAUTH-CONSENT, SF-36) as information, not checkboxes: each
 * names the agreement and when it is actually given, as O02w's own legal line
 * does ("You'll review the Terms and Privacy Policy after sign-in").
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
export function SignupScreen({ continuation }: { continuation?: Continuation }) {
  const t = useTranslations("auth.signup");
  const account = withContinuation("web.signup.account", continuation);

  return (
    <Container
      data-auth-frame="signup"
      // WebSignUp: (1312 − 72) split 1 : 1.25 with a 72 px gap. The left track is
      // that exact share; the canonical 64 px gap plus the section's 8 px inset
      // make the 72 px. The artboard is a fixed 1440 × 940 frame whose body fills
      // 940 − 76 (header) − 190 (footer) = 674 px, so the footer sits at y 750.
      className="grid content-start gap-10 py-10 desktop:min-h-[674px] desktop:grid-cols-[minmax(0,calc((100%-4.5rem)/2.25))_minmax(0,1fr)] desktop:gap-16 desktop:py-14"
    >
      <div className="flex min-w-0 flex-col gap-5.5">
        <BrandTile size="xl" />
        <h1 className="type-auth-display text-balance">
          {t.rich("title", { hl: (chunks) => <span className="text-highlight">{chunks}</span> })}
        </h1>
        <p className="type-auth-lead text-pretty text-muted-foreground">{t("description")}</p>
        <div className="flex max-w-105 flex-col gap-2.5">
          {/* O02w's three methods are 54 px (`xl`); Google renders in a slot of that height. */}
          <GoogleSignInButton className="min-h-13.5" />
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
              <Link href={withContinuation("web.login", continuation)} className={textLinkClass}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
      <section aria-labelledby="signup-roles" className="flex min-w-0 flex-col gap-4 desktop:pl-2">
        <h2 id="signup-roles" className="type-label-lg text-highlight">
          {t("roles.title")}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ROLE_CARDS.map(({ key, icon: Icon }, index) => {
            const emphasised = index === 0;
            return (
              <li key={key} className="flex">
                <Link
                  href={
                    key === "sponsor"
                      ? routeHref("web.partners.apply")
                      : withContinuation("web.signup.account", { ...continuation, intent: key })
                  }
                  className={cn(
                    // 20 px padding; 16 at the bottom absorbs the 13 px lines' 20 px
                    // line height (the artboard's is 19.5 / 18), keeping the 197 px card.
                    "flex w-full flex-col gap-2.5 rounded-3xl border px-5 pt-5 pb-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
                  {/* The artboard's 18 px display title on a 22 px line. */}
                  <span className="type-metric-sm font-semibold">{t(`roles.${key}.title`)}</span>
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
const AGREEMENTS = [
  { key: "terms", icon: FileTextIcon },
  { key: "age", icon: CakeIcon },
  { key: "news", icon: NewspaperIcon },
] as const;
const NEXT_STEPS = ["verify", "basics", "setup"] as const;

/**
 * WA3 "Create your SimpleFit account" (email_verification), in the auth step
 * frame (1fr | 420 px, 56 px gap). Only the email address is submitted. The
 * role segments and the identity chip show the journey chosen on O02w
 * (`intent`, navigation only; none without one), and the full name and the
 * agreements are given after verification, in account registration (WA5):
 * the name field is disabled and says so, and the agreement rows are
 * information, not checkboxes.
 */
export function SignupAccountScreen({ continuation }: { continuation?: Continuation }) {
  const t = useTranslations("auth.account");
  const signIn = (chunks: ReactNode) => (
    <Link href={withContinuation("web.login", continuation)} className={textLinkClass}>
      {chunks}
    </Link>
  );

  return (
    <AuthStepFrame
      action={t.rich("member", { link: signIn })}
      aside={
        <>
          {/* 20 px at the bottom: the label (14) and chips (24) run 3 px over the artboard's 13 / 22. */}
          <div className="flex flex-col gap-3 rounded-3xl border bg-surface px-5.5 pt-5.5 pb-5">
            <h2 className="type-label text-faint-foreground">{t("identity.title")}</h2>
            <p className="type-body text-pretty">{t("identity.body")}</p>
            <ul className="flex flex-wrap items-center gap-1.5">
              {IDENTITY_ROLES.map((role) => (
                <li key={role}>
                  {/* WA3 draws the chosen journey's chip in the olive accent, as its segment. */}
                  <Badge variant={role === continuation?.intent ? "accent" : "neutral"}>
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
        {/*
          The eyebrow (14), title (38) and field labels (18) sit on type-role
          lines 1 px taller than the artboard's; the role block, the form and
          the closing line each start 2 px earlier so every row keeps its
          designed position.
        */}
        <div className="-mt-0.5 flex flex-col gap-2">
          <p id="signup-role-label" className="type-body-sm font-bold text-muted-foreground">
            {t("signingUpAs")}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="signup-role-label"
            aria-disabled="true"
            className="grid grid-cols-3 gap-1 rounded-3xl border bg-surface p-1"
          >
            {SIGNUP_ROLES.map((role) => {
              // Presentation only: nothing is submitted or stored. It shows the
              // journey the user chose on O02w (`intent`); without one nothing is
              // selected, so no role is implied.
              const active = role === continuation?.intent;
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
          continuation={continuation}
          submitLabel={t("submit")}
          // WA3's 52 px CTA (15 / 800, radius 18).
          submitClassName="h-13"
          hint={t("hint")}
          hintPlacement="field"
          fullWidth={false}
          className="-mt-0.5 flex flex-col gap-4"
          besideField={
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="signup-full-name"
                className="type-caption font-bold text-muted-foreground"
              >
                {t("fullName")}
              </label>
              {/* Given in account registration (WA5) after verifying: never submitted here. */}
              <Input
                id="signup-full-name"
                fieldSize="lg"
                disabled
                autoComplete="off"
                placeholder={t("fullNamePlaceholder")}
                className="disabled:bg-background disabled:opacity-100"
              />
            </div>
          }
        >
          {/* WA3's three 22 px rows, 10 px apart: what is agreed after verifying, and when. */}
          <ul
            data-auth-agreements
            aria-label={t("agreements.label")}
            className="flex flex-col gap-2.5"
          >
            {AGREEMENTS.map(({ key, icon: Icon }) => (
              <li key={key} className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="flex size-5.5 flex-none items-center justify-center rounded-xs bg-surface-elevated text-faint-foreground"
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="type-body font-semibold">
                  {t(`agreements.${key}`)}
                  <span className="text-faint-foreground"> {t(`agreements.${key}When`)}</span>
                </span>
              </li>
            ))}
          </ul>
        </RegistrationEmailForm>
        <p className="-mt-0.5 type-body-sm text-faint-foreground">
          {t.rich("haveAccount", { link: signIn })}
        </p>
      </div>
    </AuthStepFrame>
  );
}

const AFTER_VERIFYING = ["everyone", "journey", "none"] as const;

/**
 * WA4 "Verify your email" (email_verification), in the auth step frame. The
 * aside shows the E01 email as an illustration with the code masked (never a
 * code anyone could type) and the static "After verifying" overview of the
 * entry resolution (SF-45): account basics for everyone, then the journey
 * picked before sign-in, or the choice of where to start.
 */
export function SignupVerifyScreen({ continuation }: { continuation?: Continuation }) {
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
              {/* The artboard's 18 px display line (22 px). */}
              <p className="type-metric-sm font-semibold">{t("preview.code")}</p>
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
      <RegistrationCodeStep continuation={continuation} />
    </AuthStepFrame>
  );
}
