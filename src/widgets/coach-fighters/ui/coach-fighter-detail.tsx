"use client";

import { ChevronLeftIcon, ShieldIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { isUnavailable, useCoachRelationship } from "@/entities/coach-relationship";
import { EndRelationshipDialog } from "@/features/coach-relationship-end";
import type { CoachFighterRelationshipDisclosedFieldsItem as DisclosedField } from "@/shared/api/generated/model";
import { Link, useRouter } from "@/shared/i18n/navigation";
import { countryName } from "@/shared/lib/countries";
import { routeHref } from "@/shared/routes/routes";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { Skeleton } from "@/shared/ui/skeleton";

/*
 * One fighter the coach works with (`web.app.coach.fighters._fighter-id`,
 * WC4; Claude Design 1792056621-3707, reconciled in SF-58). The id is the
 * SF-56 relationship id, never a fighter or user id.
 *
 * Only the C1+C2 fields the fighter disclosed are shown; every other field
 * reads "Not shared". The backend answers `404` for an ended, foreign or
 * unknown relationship, and for Coach sharing switched off: one truthful
 * "not available" state, with no detail of which.
 */

const FIELDS: readonly DisclosedField[] = [
  "display_name",
  "username",
  "country_code",
  "city",
  "experience_level",
  "stance",
  "amateur_bout_count",
];

export function CoachFighterDetail({ relationshipId }: { relationshipId: string }) {
  const t = useTranslations("coachFighters");
  const level = useTranslations("fighterOnboarding.profile.experience.options");
  const stance = useTranslations("fighterOnboarding.profile.stance.options");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const query = useCoachRelationship(relationshipId);
  const relationship = query.data;
  const fighter = relationship?.fighter ?? null;
  const name = fighter?.display_name ?? t("detail.fallbackName");

  const back = (
    <Link
      href={routeHref("web.app.coach.fighters")}
      className="inline-flex items-center gap-1 type-body-sm font-bold text-muted-foreground hover:text-foreground"
    >
      <ChevronLeftIcon aria-hidden className="size-4" />
      {t("detail.back")}
    </Link>
  );

  if (query.isError) {
    const unavailable = isUnavailable(query.error);
    return (
      <div data-coach-fighter className="flex min-h-full flex-col">
        <PageHeader>{back}</PageHeader>
        <PageBody className="pt-5.5">
          <div
            role={unavailable ? "status" : "alert"}
            className="flex flex-col items-start gap-2.5 rounded-3xl border bg-surface px-5 py-8"
          >
            <h1 className="type-title font-display">
              {unavailable ? t("detail.unavailable.title") : t("failed.title")}
            </h1>
            <p className="max-w-130 type-body-sm text-muted-foreground">
              {unavailable ? t("detail.unavailable.body") : t("failed.body")}
            </p>
            {unavailable ? (
              <Button asChild variant="quiet">
                <Link href={routeHref("web.app.coach.fighters")}>
                  {t("detail.unavailable.back")}
                </Link>
              </Button>
            ) : (
              <Button variant="quiet" onClick={() => void query.refetch()}>
                {t("failed.retry")}
              </Button>
            )}
          </div>
        </PageBody>
      </div>
    );
  }

  if (relationship === undefined) {
    return (
      <div data-coach-fighter className="flex min-h-full flex-col">
        <PageHeader>{back}</PageHeader>
        <PageBody className="pt-5.5">
          <div role="status" aria-label={t("detail.loading")} className="flex flex-col gap-3">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-64 rounded-3xl" />
          </div>
        </PageBody>
      </div>
    );
  }

  const disclosed = new Set(relationship.disclosed_fields);
  const value = (field: DisclosedField): string | null => {
    if (!disclosed.has(field) || fighter === null) return null;
    switch (field) {
      case "country_code":
        return fighter.country_code ? countryName(fighter.country_code, locale) : null;
      case "experience_level":
        return fighter.experience_level ? level(fighter.experience_level) : null;
      case "stance":
        return fighter.stance ? stance(fighter.stance) : null;
      case "amateur_bout_count":
        return fighter.amateur_bout_count == null ? null : String(fighter.amateur_bout_count);
      case "username":
        return fighter.username ? `@${fighter.username}` : null;
      default:
        return fighter[field];
    }
  };
  const subline = [
    value("username"),
    [value("city"), value("country_code")].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div data-coach-fighter className="flex min-h-full flex-col">
      <PageHeader className="flex-wrap">{back}</PageHeader>
      <PageBody className="flex flex-col gap-5 pt-5.5">
        <header className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden
            className="flex size-14 flex-none items-center justify-center rounded-full bg-highlight type-title font-display font-bold text-highlight-foreground"
          >
            {initials(fighter?.display_name ?? null)}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate type-h3 font-display">{name}</h1>
            {subline && <p className="type-body-sm text-muted-foreground">{subline}</p>}
          </div>
          <Badge variant="accent">
            {t("detail.active", {
              date: format.dateTime(new Date(relationship.started_at), "date"),
            })}
          </Badge>
          <div className="ml-auto">
            <EndRelationshipDialog
              relationshipId={relationship.relationship_id}
              name={name}
              onEnded={() => {
                toast.success(t("endDialog.ended", { name }));
                router.replace(routeHref("web.app.coach.fighters"));
              }}
            />
          </div>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22.5rem]">
          <section
            aria-labelledby="shares-heading"
            className="rounded-3xl border bg-surface px-5 py-4.5"
          >
            <h2 id="shares-heading" className="pb-2 type-label text-faint-foreground">
              {t("detail.shares", { name })}
            </h2>
            <dl className="flex flex-col">
              {FIELDS.map((field) => {
                const shown = value(field);
                return (
                  <div
                    key={field}
                    className="flex items-center justify-between gap-4 border-t py-3 type-body-sm"
                  >
                    <dt className="text-muted-foreground">{t(`detail.fields.${field}`)}</dt>
                    <dd className={shown ? "font-bold" : "text-faint-foreground"}>
                      {shown ?? t("roster.notShared")}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
          <div className="flex flex-col gap-3.5">
            <section
              aria-labelledby="never-heading"
              className="rounded-3xl border bg-surface px-5 py-4.5"
            >
              <h2
                id="never-heading"
                className="flex items-center gap-2 pb-2 type-label text-faint-foreground"
              >
                <ShieldIcon aria-hidden className="size-4" />
                {t("detail.never.title")}
              </h2>
              <ul className="flex flex-col gap-1.5 type-body-sm text-muted-foreground">
                {t("detail.never.body")
                  .split("\n")
                  .map((line) => (
                    <li key={line}>{line}</li>
                  ))}
              </ul>
            </section>
            <section className="rounded-lg border bg-muted px-3.5 py-3">
              <p className="type-body-sm font-bold">{t("detail.later.title")}</p>
              <p className="type-caption text-muted-foreground">{t("detail.later.body")}</p>
            </section>
          </div>
        </div>
      </PageBody>
    </div>
  );
}

function initials(name: string | null) {
  const letters = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toUpperCase();
  return letters || "·";
}
