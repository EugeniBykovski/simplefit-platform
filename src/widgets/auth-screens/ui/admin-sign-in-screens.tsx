import { KeyRoundIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { PasswordResetForm, PasswordSignInForm } from "@/features/password-auth";
import { siteConfig } from "@/shared/config/site";
import { Link } from "@/shared/i18n/navigation";
import { withContinuation, type Continuation } from "@/shared/routes/continuation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { BrandTile } from "@/shared/ui/brand-mark";
import { Button } from "@/shared/ui/button";
import { textLinkClass } from "@/shared/ui/text-link";

import { SessionEndedNotice } from "./session-ended-notice";

/*
 * The Control Plane sign-in (SF-157, AD0 `handoff`). Claude Design draws no
 * password state (D-SF157-05), so these are interim compositions in AD0's own
 * language: its header (brand, "Control plane · every action is recorded") and
 * one centred card, with the design system's fields, buttons and notices.
 */

function AdminAuthFrame({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  const t = useTranslations("controlPlane.entry");
  return (
    <div data-admin-sign-in className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-16 items-center gap-2.5 px-4 sm:px-12">
        <Link href={routeHref("web.root")} className="flex items-center gap-2.5 rounded-md">
          <BrandTile size="sm" />
          <span className="type-brand">{siteConfig.name.split(" ")[0]}</span>
        </Link>
        <span className="ml-auto hidden type-label text-faint-foreground uppercase sm:inline">
          {t("header")}
        </span>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 justify-center px-4 pt-8 pb-12 outline-none sm:px-12 sm:pt-16"
      >
        <section
          aria-labelledby="admin-sign-in-title"
          className="flex h-fit w-full max-w-130 flex-col gap-4 rounded-3xl border bg-surface p-5 sm:p-6.5"
        >
          <Badge variant="neutral" className="w-fit gap-1.5 uppercase">
            <KeyRoundIcon aria-hidden className="size-3.5" />
            {eyebrow}
          </Badge>
          <h1 id="admin-sign-in-title" className="type-h2 font-display text-pretty">
            {title}
          </h1>
          {children}
        </section>
      </main>
    </div>
  );
}

/** `/admin/login`: email and password, with the ways around it. */
export function AdminSignInScreen({ continuation }: { continuation?: Continuation }) {
  const t = useTranslations("auth.password");
  return (
    <AdminAuthFrame eyebrow={t("eyebrow")} title={t("title")}>
      <p className="type-body-sm text-muted-foreground">{t("description")}</p>
      <SessionEndedNotice />
      <PasswordSignInForm className="flex flex-col gap-3.5" />
      <div className="flex flex-col gap-2 type-body-sm">
        <Link href={withContinuation("web.admin.password", continuation)} className={textLinkClass}>
          {t("forgot")}
        </Link>
        <p className="text-faint-foreground">
          {t.rich("otherWays", {
            link: (chunks) => (
              <Link href={withContinuation("web.login", continuation)} className={textLinkClass}>
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </AdminAuthFrame>
  );
}

/** `/admin/login/password`: set or reset a password with an emailed code. */
export function AdminPasswordScreen({ continuation }: { continuation?: Continuation }) {
  const t = useTranslations("auth.password");
  const signIn = withContinuation("web.admin.login", continuation);
  return (
    <AdminAuthFrame eyebrow={t("eyebrow")} title={t("reset.title")}>
      <PasswordResetForm
        signInLink={
          <Button asChild size="xl" className="w-full">
            <Link href={signIn}>{t("reset.backToSignIn")}</Link>
          </Button>
        }
      />
      <Link href={signIn} className={`${textLinkClass} type-body-sm`}>
        {t("reset.cancel")}
      </Link>
    </AdminAuthFrame>
  );
}
