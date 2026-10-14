"use client";

import { CheckIcon, InfoIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { useCoachProfile, type CoachProfile } from "@/entities/coach-profile";
import { countryName } from "@/shared/lib/countries";
import { Badge } from "@/shared/ui/badge";
import { PageBody, PageHeader } from "@/shared/ui/page";
import { ApplicationSkeleton, FailureView } from "@/widgets/system-states";

/**
 * The Coach web dashboard (`web.app.coach`, WC1; Claude Design
 * 1791982482-71e3, reduced in SF-54 / CR-8), inside the Coach shell and
 * behind the Coach gate.
 *
 * Only real data is shown: the saved CoachProfile (SF-50). The setup
 * checklist marks the completed profile and lists the steps whose domains do
 * not exist yet (fighter invitations, sessions, the coach data rules) as not
 * available; the fighters, sessions and invitations figures are dashes, never
 * zeros, because no backend counts them yet. Nothing is invented.
 */
export function CoachHome() {
  const profile = useCoachProfile();
  if (profile.isError) {
    return <FailureView error={profile.error} onRetry={() => void profile.refetch()} />;
  }
  if (profile.data === undefined) return <ApplicationSkeleton />;
  return <CoachHomeView profile={profile.data} />;
}

const UNAVAILABLE_DOMAINS = ["fighters", "sessions", "invitations"] as const;
const LATER_STEPS = ["invite", "session", "dataRules"] as const;

export function CoachHomeView({ profile }: { profile: CoachProfile }) {
  const t = useTranslations("coachHome");
  const type = useTranslations("coachOnboarding.type");
  const languages = useTranslations("coachOnboarding.profile.languages.options");
  const locale = useLocale();
  const name = profile.display_name ?? "";
  const place = [
    profile.city,
    profile.country_code === null ? null : countryName(profile.country_code, locale),
  ]
    .filter(Boolean)
    .join(", ");
  const line = [profile.brand_name, place].filter(Boolean).join(" · ");
  const list = (items: string[]) => (items.length === 0 ? t("profile.none") : items.join(" · "));
  const rows: [string, ReactNode][] = [
    [
      t("profile.formats"),
      list(profile.coaching_formats.map((format) => type(`formats.options.${format}.label`))),
    ],
    [
      t("profile.competition"),
      list(profile.competition_levels.map((level) => type(`levels.options.${level}`))),
    ],
    [t("profile.languages"), list(profile.languages.map((language) => languages(language)))],
  ];
  if (profile.bio !== null) rows.push([t("profile.bio"), profile.bio]);

  return (
    <div data-coach-home className="flex min-h-full flex-col">
      <PageHeader>
        <div className="flex flex-col gap-0.5">
          <p className="type-label text-faint-foreground">{t("eyebrow")}</p>
          <h1 className="type-h3 font-display">{t("title", { name })}</h1>
        </div>
      </PageHeader>
      <PageBody className="grid content-start gap-4.5 pt-5.5 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <section
            aria-labelledby="coach-profile-heading"
            className="flex flex-col gap-3.5 rounded-3xl border bg-surface px-5 py-4.5"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="coach-profile-heading" className="type-label text-faint-foreground">
                {t("profile.title")}
              </h2>
              <Badge variant="accent">{t("profile.complete")}</Badge>
            </div>
            <div className="flex items-center gap-3.5">
              <span
                aria-hidden
                className="flex size-13 flex-none items-center justify-center rounded-full bg-warning type-body font-display font-bold text-warning-foreground"
              >
                {initials(name)}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <p className="type-title font-extrabold">{name}</p>
                {line === "" ? null : <p className="type-body-sm text-muted-foreground">{line}</p>}
              </div>
            </div>
            <dl className="flex flex-col">
              {rows.map(([label, value]) => (
                <div
                  key={label}
                  className="flex min-h-12 flex-col gap-1 border-t py-2 sm:flex-row sm:items-center sm:gap-3"
                >
                  <dt className="type-caption font-bold text-faint-foreground sm:w-35 sm:flex-none">
                    {label}
                  </dt>
                  <dd className="min-w-0 flex-1 type-body-sm font-bold whitespace-pre-line">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section
            aria-labelledby="coach-fills-heading"
            className="flex flex-col gap-3 rounded-3xl border bg-surface px-5 py-4.5"
          >
            <h2 id="coach-fills-heading" className="type-label text-faint-foreground">
              {t("fills.title")}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-3">
              {UNAVAILABLE_DOMAINS.map((domain) => (
                <li
                  key={domain}
                  className="flex flex-col gap-1 rounded-2xl border bg-background px-4 py-3.5"
                >
                  <span className="type-label text-faint-foreground">
                    {t(`fills.${domain}.label`)}
                  </span>
                  <span className="type-metric font-display text-faint-foreground">
                    <span aria-hidden>—</span>
                    <span className="sr-only">{t("fills.unavailable")}</span>
                  </span>
                  <span className="type-caption font-bold text-muted-foreground">
                    {t(`fills.${domain}.when`)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-3.5">
          <section
            aria-labelledby="coach-setup-heading"
            className="flex flex-col gap-1.5 rounded-3xl border border-border-strong bg-surface px-5 pt-4.5 pb-2"
          >
            <p className="type-label text-highlight">{t("setup.eyebrow")}</p>
            <h2 id="coach-setup-heading" className="pb-1.5 type-title font-display">
              {t("setup.title")}
            </h2>
            <ol className="flex flex-col">
              <li className="flex min-h-14 items-center gap-3 border-t py-1.5">
                <span className="flex size-6.5 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <CheckIcon aria-hidden className="size-3.5" strokeWidth={3} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="type-body-sm font-extrabold">{t("setup.profile.title")}</span>
                  <span className="type-caption text-faint-foreground">
                    {t("setup.profile.line")}
                  </span>
                </span>
                <span className="sr-only">{t("setup.done")}</span>
              </li>
              {LATER_STEPS.map((step) => (
                <li key={step} className="flex min-h-14 items-center gap-3 border-t py-1.5">
                  <span
                    aria-hidden
                    className="size-6.5 flex-none rounded-full border-2 border-dashed border-border-strong"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="type-body-sm font-extrabold text-muted-foreground">
                      {t(`setup.${step}.title`)}
                    </span>
                    <span className="type-caption text-faint-foreground">
                      {t(`setup.${step}.line`)}
                    </span>
                  </span>
                  <Badge variant="neutral">{t("setup.unavailable")}</Badge>
                </li>
              ))}
            </ol>
          </section>
          <div className="flex items-start gap-2.5 rounded-lg border bg-muted px-3.5 py-3 type-caption text-muted-foreground">
            <InfoIcon aria-hidden className="mt-0.5 size-4 flex-none text-faint-foreground" />
            <p className="flex flex-col gap-0.5">
              <span className="font-extrabold text-foreground">{t("note.title")}</span>
              <span>{t("note.body")}</span>
            </p>
          </div>
        </div>
      </PageBody>
    </div>
  );
}

/** "Alex Novak" → "AN". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = Array.from(parts[0] ?? "")[0] ?? "";
  const last = parts.length > 1 ? (Array.from(parts.at(-1) ?? "")[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}
