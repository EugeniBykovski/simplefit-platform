"use client";

import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { AdminAccountSummary } from "@/entities/admin-user";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

/** The account's state, in words (never colour alone). */
export function StatusBadge({ status }: { status: AdminAccountSummary["status"] }) {
  const t = useTranslations("controlPlane.users.status");
  return (
    <Badge
      variant={status === "suspended" ? "warning" : "success"}
      className="uppercase"
      data-account-status={status}
    >
      {t(status)}
    </Badge>
  );
}

/** What the account takes part in: context types only, never their content. */
export function ContextList({ contexts }: { contexts: AdminAccountSummary["contexts"] }) {
  const t = useTranslations("controlPlane.users.contexts");
  const names = [
    contexts.fighter_profile === "completed" && t("fighter"),
    contexts.coach_profile === "completed" && t("coach"),
    contexts.gym_staff > 0 && t("gymStaff"),
    contexts.gym_member > 0 && t("gymMember"),
    contexts.sponsor_memberships > 0 && t("sponsor"),
    contexts.platform_operator && t("operator"),
  ].filter((name): name is string => Boolean(name));
  return (
    <span className="type-body-sm text-muted-foreground">
      {names.length === 0 ? t("none") : names.join(" · ")}
    </span>
  );
}

/** The operator lacks the section's permission (AD7/AD8 `restricted`). */
export function Restricted() {
  const t = useTranslations("controlPlane.users.restricted");
  return (
    <section
      data-users-state="restricted"
      className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5"
    >
      <Badge variant="neutral" className="gap-1.5 uppercase">
        <LockIcon aria-hidden className="size-3.5" />
        {t("pill")}
      </Badge>
      <h2 className="type-h3 font-display">{t("title")}</h2>
      <p className="type-body-sm text-muted-foreground">{t("body")}</p>
      <Button asChild variant="quiet">
        <Link href={routeHref("web.admin")}>{t("back")}</Link>
      </Button>
    </section>
  );
}
