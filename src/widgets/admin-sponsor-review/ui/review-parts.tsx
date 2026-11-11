"use client";

import { LockIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ReviewApplication } from "@/entities/admin-sponsor-review";
import { Link } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

const STATUS_VARIANT = {
  submitted: "info",
  under_review: "warning",
  changes_requested: "neutral",
  approved: "success",
  rejected: "destructive",
  withdrawn: "neutral",
} as const;

/** The application's status, in words (never colour alone). */
export function StatusBadge({ status }: { status: ReviewApplication["status"] }) {
  const t = useTranslations("controlPlane.sponsorReview.status");
  return (
    <Badge variant={STATUS_VARIANT[status]} className="uppercase" data-application-status={status}>
      {t(status)}
    </Badge>
  );
}

/** The organization an approval created: active, suspended or closed, in words. */
export function OrganizationBadge({
  organization,
}: {
  organization: ReviewApplication["organization"];
}) {
  const t = useTranslations("controlPlane.sponsorReview.organization");
  if (organization === null)
    return (
      <Badge variant="neutral" className="uppercase" data-organization-status="none">
        {t("none")}
      </Badge>
    );
  return (
    <Badge
      variant={organization.status === "active" ? "success" : "warning"}
      className="uppercase"
      data-organization-status={organization.status}
    >
      {t(organization.status)}
    </Badge>
  );
}

/** A required reason code from the backend's list for one action. */
export function ReasonSelect({
  id,
  reasons,
  value,
  onChange,
  disabled,
}: {
  id: string;
  reasons: readonly string[];
  value: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("controlPlane.sponsorReview");
  const name = (code: string) =>
    t.has(`reasons.${code}` as Parameters<typeof t.has>[0])
      ? t(`reasons.${code}` as Parameters<typeof t>[0])
      : code;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id}>
        {t("action.reason")} <span aria-hidden>*</span>
      </Label>
      <Select value={value ?? ""} onValueChange={onChange} disabled={disabled} required>
        <SelectTrigger id={id} className="h-11 w-full" aria-required="true">
          <SelectValue placeholder={t("action.reasonPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {reasons.map((code) => (
            <SelectItem key={code} value={code}>
              {name(code)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The operator lacks the section's permission (AS1/AS2 `restricted`). */
export function Restricted() {
  const t = useTranslations("controlPlane.users.restricted");
  return (
    <section
      data-review-state="restricted"
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
