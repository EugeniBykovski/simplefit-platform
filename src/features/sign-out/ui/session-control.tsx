"use client";

import { LogInIcon, LogOutIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { signOut, useSessionStatus } from "@/entities/session";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { disableGoogleAutoSelect } from "@/shared/lib/google-identity";
import { Button } from "@/shared/ui/button";
import { Spinner } from "@/shared/ui/spinner";

/**
 * Minimal session indicator for the app shell (SF-22): sign out when signed
 * in, a sign-in link otherwise. Sign-out revokes the session on the API,
 * clears it in memory and stops Google from re-selecting the account. Route
 * guards are not decided here.
 */
export function SessionControl() {
  const t = useTranslations("auth.session");
  const status = useSessionStatus();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    disableGoogleAutoSelect();
    router.replace("/login");
  }

  if (status === "loading") return <Spinner label={t("checking")} />;

  if (status === "anonymous") {
    return (
      <Button asChild variant="ghost" size="sm">
        <Link href="/login">
          <LogInIcon aria-hidden />
          {t("signIn")}
        </Link>
      </Button>
    );
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut} loading={signingOut}>
      {signingOut ? null : <LogOutIcon aria-hidden />}
      {t("signOut")}
    </Button>
  );
}
