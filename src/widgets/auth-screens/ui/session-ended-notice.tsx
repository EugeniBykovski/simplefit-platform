"use client";

import { CircleAlertIcon, LogOutIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { useSession } from "@/entities/session";
import { Notice } from "@/shared/ui/notice";

/**
 * Why the sign-in page is shown, when a session ended in this page (SF-28):
 * the API rejected it (`expired`), or the user signed out here or in another
 * tab. "Signed out on this browser" stays true even when the logout could
 * not reach the API, so nothing claims a server revocation that did not
 * happen. Nothing renders after a fresh page load.
 */
export function SessionEndedNotice() {
  const t = useTranslations("auth.session.ended");
  const { status, ended } = useSession();
  if (status !== "anonymous" || ended === undefined) return null;
  return ended === "expired" ? (
    <Notice tone="amber" icon={CircleAlertIcon} role="status">
      {t("expired")}
    </Notice>
  ) : (
    <Notice tone="muted" icon={LogOutIcon} role="status">
      {t("signedOut")}
    </Notice>
  );
}
