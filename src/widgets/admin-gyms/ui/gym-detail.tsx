"use client";

import { AlertTriangleIcon, SearchXIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import {
  OVERSIGHT_REASONS,
  useGym,
  type OversightGym,
  type OversightReason,
} from "@/entities/admin-oversight";
import { grants, useOperator } from "@/entities/operator";
import { isApiError } from "@/shared/api/http/api-error";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Label } from "@/shared/ui/label";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Skeleton } from "@/shared/ui/skeleton";

import { LifecycleBadge, Restricted, VerificationBadge } from "./gym-parts";

/**
 * AD12, one gym (SF-123; Claude Design `AdminTenantDetail`, MVP reduced): what the
 * backend shows an operator, read with a recorded reason: the gym's own state, people
 * as counts plus the owner's short name, and the business verification status. No
 * member names, contacts, business details or documents; no action (gym suspension,
 * verification review and publication don't exist in the Control Plane). The owner's
 * account opens only through `users.read`, checked again by the backend.
 */
export function GymDetail({
  gymId,
  initialReason,
}: {
  gymId: string;
  initialReason: OversightReason | null;
}) {
  const t = useTranslations("controlPlane.gyms.detail");
  const common = useTranslations("controlPlane.users");
  const router = useRouter();
  const [reason, setReason] = useState<OversightReason | null>(initialReason);
  const [chosen, setChosen] = useState<OversightReason>();
  const read = useGym(gymId, reason);
  const operator = useOperator().data;
  // Revoked meanwhile (the operator's grants are re-read on focus): nothing stays shown.
  const revoked = operator != null && !grants(operator, "gyms.read");

  let body: ReactNode;
  if (reason === null) {
    body = (
      <form
        className="flex max-w-130 flex-col gap-3 rounded-3xl border bg-surface p-6.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (chosen) {
            setReason(chosen);
            router.replace(
              routeHref("web.admin.tenants._tenant-id", { tenantId: gymId }, { reason: chosen }),
            );
          }
        }}
      >
        <h2 className="type-h3 font-display">{t("reasonTitle")}</h2>
        <p className="type-body-sm text-muted-foreground">{t("reasonBody")}</p>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="gym-reason">
            {common("search.reason")} <span aria-hidden>*</span>
          </Label>
          <Select
            value={chosen ?? ""}
            onValueChange={(value) => setChosen(value as OversightReason)}
          >
            <SelectTrigger id="gym-reason" className="h-11 w-full" aria-required="true">
              <SelectValue placeholder={common("search.reasonPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {OVERSIGHT_REASONS.map((code) => (
                <SelectItem key={code} value={code}>
                  {common(`reasons.${code}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="h-11 w-fit" disabled={chosen === undefined}>
          {t("open")}
        </Button>
      </form>
    );
  } else if (revoked || (isApiError(read.error) && read.error.status === 403)) {
    body = <Restricted />;
  } else if (isApiError(read.error) && read.error.status === 404) {
    body = (
      <section className="flex max-w-155 flex-col items-start gap-2.5 rounded-3xl border bg-surface p-6.5">
        <Badge variant="neutral" className="gap-1.5 uppercase">
          <SearchXIcon aria-hidden className="size-3.5" />
          {t("notFound.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{t("notFound.title")}</h2>
        <p className="type-body-sm text-muted-foreground">{t("notFound.body")}</p>
      </section>
    );
  } else if (read.isError) {
    body = (
      <section className="flex max-w-155 flex-col items-start gap-3 rounded-3xl border bg-surface p-6.5">
        <Badge variant="destructive" className="gap-1.5 uppercase">
          <AlertTriangleIcon aria-hidden className="size-3.5" />
          {common("error.pill")}
        </Badge>
        <h2 className="type-h3 font-display">{common("error.title")}</h2>
        <p role="alert" className="type-body-sm text-muted-foreground">
          {common("error.body")}
        </p>
        <Button onClick={() => void read.refetch()}>{common("error.retry")}</Button>
      </section>
    );
  } else if (read.data === undefined) {
    body = (
      <div
        role="status"
        aria-busy="true"
        aria-label={t("loading")}
        className="grid gap-4 lg:grid-cols-2"
      >
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  } else {
    body = <Gym gym={read.data} reason={reason} />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex min-w-0 flex-col gap-0.5">
          <nav aria-label="Breadcrumb">
            <p className="type-label text-faint-foreground">
              <Link
                href={routeHref("web.admin.tenants")}
                className="underline-offset-4 hover:underline"
              >
                {t("breadcrumb")}
              </Link>
              {read.data ? ` / ${read.data.name}` : ""}
            </p>
          </nav>
          <h1 className="truncate type-h3 font-display">{t("title")}</h1>
        </div>
      </PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">{body}</PageBody>
    </div>
  );
}

function Gym({ gym, reason }: { gym: OversightGym; reason: OversightReason }) {
  const t = useTranslations("controlPlane.gyms");
  const format = useFormatter();
  const operator = useOperator().data;
  const date = (value: string) => format.dateTime(new Date(value), "date");
  const count = (value: number) => t("detail.count", { count: value });
  const canOpenAccount = operator ? grants(operator, "users.read") : false;

  return (
    <div data-gym={gym.id} className="flex flex-col gap-4">
      <header className="flex flex-col gap-1 rounded-3xl border bg-surface p-5">
        <h2 className="flex flex-wrap items-center gap-2 type-h3 font-display">
          {gym.name}
          <LifecycleBadge lifecycle={gym.lifecycle} />
        </h2>
        <p className="truncate type-caption text-faint-foreground">
          {t("detail.header", {
            id: gym.id,
            date: date(gym.created_at),
            country: gym.country_code ?? t("noLocation"),
          })}
        </p>
        <p className="type-caption text-muted-foreground">{t("detail.noActions")}</p>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Section title={t("detail.people.title")} id="people" notes={[t("detail.people.never")]}>
          <Row
            label={t("detail.people.owner")}
            value={
              gym.owner === null ? (
                t("detail.people.noOwner")
              ) : canOpenAccount ? (
                <Link
                  href={routeHref(
                    "web.admin.users._user-id",
                    { userId: gym.owner.user_id },
                    { reason },
                  )}
                  className="font-bold text-highlight underline-offset-4 hover:underline"
                >
                  {gym.owner.short_name ?? t("detail.people.unnamed")}
                </Link>
              ) : (
                (gym.owner.short_name ?? t("detail.people.unnamed"))
              )
            }
          />
          <Row label={t("detail.people.managers")} value={count(gym.staff.manager)} />
          <Row label={t("detail.people.coaches")} value={count(gym.staff.coach)} />
          <Row label={t("detail.people.frontDesk")} value={count(gym.staff.front_desk)} />
          <Row
            label={t("detail.people.invitations")}
            value={count(gym.staff_invitations_pending)}
          />
          <Row label={t("detail.people.members")} value={count(gym.members.active)} />
          <Row label={t("detail.people.requested")} value={count(gym.members.requested)} />
        </Section>

        <div className="flex flex-col gap-4">
          <Section
            title={t("detail.verification.title")}
            id="verification"
            notes={[t("detail.verification.reviewNote")]}
          >
            <Row
              label={t("detail.verification.status")}
              value={<VerificationBadge status={gym.verification.status} />}
            />
            {gym.verification.revision !== null && (
              <Row
                label={t("detail.verification.revision")}
                value={String(gym.verification.revision)}
              />
            )}
            {gym.verification.submitted_at && (
              <Row
                label={t("detail.verification.submitted")}
                value={date(gym.verification.submitted_at)}
              />
            )}
            {gym.verification.decided_at && (
              <Row
                label={t("detail.verification.decided")}
                value={date(gym.verification.decided_at)}
              />
            )}
          </Section>

          <Section
            title={t("detail.profile.title")}
            id="profile"
            notes={[t("detail.profile.publication")]}
          >
            <Row label={t("detail.profile.type")} value={t(`gymType.${gym.gym_type}`)} />
            <Row
              label={t("detail.profile.location")}
              value={
                gym.country_code
                  ? `${gym.city ?? ""}${gym.city ? ", " : ""}${gym.country_code}`
                  : t("noLocation")
              }
            />
            <Row label={t("detail.profile.staff")} value={count(gym.staff_count)} />
            <Row label={t("detail.profile.revision")} value={String(gym.revision)} />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  id,
  notes,
  children,
}: {
  title: string;
  id: string;
  notes: string[];
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`gym-${id}`}
      className="flex flex-col gap-3 rounded-3xl border bg-surface p-5"
    >
      <h2 id={`gym-${id}`} className="type-title font-display">
        {title}
      </h2>
      <dl className="flex flex-col divide-y">{children}</dl>
      {notes.map((note) => (
        <p key={note} className="type-caption text-faint-foreground">
          {note}
        </p>
      ))}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:justify-between sm:gap-3">
      <dt className="type-body-sm text-muted-foreground">{label}</dt>
      <dd className="type-body-sm sm:text-right">{value}</dd>
    </div>
  );
}
