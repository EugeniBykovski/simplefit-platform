"use client";

import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { OversightGym } from "@/entities/admin-oversight";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";

/** The gym's setup lifecycle, in words (never colour alone). */
export function LifecycleBadge({ lifecycle }: { lifecycle: OversightGym["lifecycle"] }) {
  const t = useTranslations("controlPlane.gyms.lifecycle");
  return (
    <Badge
      variant={lifecycle === "completed" ? "success" : "neutral"}
      className="uppercase"
      data-gym-lifecycle={lifecycle}
    >
      {t(lifecycle)}
    </Badge>
  );
}

const VERIFICATION_VARIANT = {
  not_started: "neutral",
  draft: "neutral",
  submitted: "info",
  changes_requested: "warning",
  approved: "success",
  rejected: "destructive",
  revoked: "destructive",
} as const;

/** The business verification application's status (SF-103), in words. */
export function VerificationBadge({ status }: { status: OversightGym["verification_status"] }) {
  const t = useTranslations("controlPlane.gyms.verification");
  return (
    <Badge
      variant={VERIFICATION_VARIANT[status]}
      className="uppercase"
      data-gym-verification={status}
    >
      {t(status)}
    </Badge>
  );
}

/** The operator lacks `gyms.read` (AD2/AD12 `restricted`). */
export function Restricted() {
  const t = useTranslations("controlPlane.users.restricted");
  return (
    <section
      data-gyms-state="restricted"
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
