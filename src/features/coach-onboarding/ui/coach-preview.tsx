"use client";

import { UserRoundIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { countryName } from "@/shared/lib/countries";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Notice } from "@/shared/ui/notice";

import type { ProfileValues, TypeValues } from "../model/form-values";

/** "Coach Yauheni" → "CY"; nothing typed → "··" (the artboards' empty avatar). */
export function initialsOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase() ?? "");
  return letters.join("") || "··";
}

/** The 52 px coach avatar: initials on amber once a name exists. */
function Avatar({ name }: { name: string }) {
  const filled = name.trim() !== "";
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-13 flex-none items-center justify-center rounded-lg type-body font-display font-bold",
        filled ? "bg-warning text-warning-foreground" : "bg-input text-faint-foreground",
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** "Brand · City, Country", from whatever is filled. */
function useIdentityLine(values: Pick<ProfileValues, "brand_name" | "city" | "country_code">) {
  const locale = useLocale();
  const place = [
    values.city.trim(),
    values.country_code ? countryName(values.country_code, locale) : "",
  ]
    .filter(Boolean)
    .join(", ");
  return [values.brand_name.trim(), place].filter(Boolean).join(" · ");
}

/** The avatar, the coach name and the identity line, as fighters will see them. */
function Identity({ values }: { values: ProfileValues }) {
  const t = useTranslations("coachOnboarding.preview");
  const line = useIdentityLine(values);
  const named = values.display_name.trim() !== "";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={values.display_name} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p
          className={cn(
            "truncate type-body-lg font-extrabold",
            named ? "text-foreground" : "text-faint-foreground",
          )}
        >
          {named ? values.display_name.trim() : t("name")}
        </p>
        <p className="truncate type-caption text-muted-foreground">{line || t("line")}</p>
      </div>
    </div>
  );
}

const cardClass = "flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-4.5";

/** WCR1 "Coach preview": the profile as it will be shown, updated as you type. */
export function CoachPreview({ values }: { values: ProfileValues }) {
  const t = useTranslations("coachOnboarding.preview");
  const bio = values.bio.trim();
  return (
    <>
      <section aria-label={t("title")} data-coach-preview className={cardClass}>
        <p className="type-label text-faint-foreground">{t("title")}</p>
        <Identity values={values} />
        {bio !== "" && (
          <p className="type-body-sm break-words whitespace-pre-line text-muted-foreground">
            {bio}
          </p>
        )}
        {values.languages.length > 0 && (
          <ul className="flex flex-wrap items-center gap-1.5">
            {values.languages.map((language) => (
              <li key={language}>
                <Badge>{language.toLocaleUpperCase()}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Notice tone="muted" icon={UserRoundIcon}>
        {t("separate")}
      </Notice>
    </>
  );
}

/** WCR2's preview: the saved coach identity and the chosen formats and levels. */
export function CoachTypePreview({
  profile,
  values,
}: {
  profile: ProfileValues;
  values: TypeValues;
}) {
  const t = useTranslations("coachOnboarding");
  const chosen = [
    ...values.coaching_formats.map((format) => t(`type.formats.options.${format}.label`)),
    ...values.competition_levels.map((level) => t(`type.levels.options.${level}`)),
  ];
  return (
    <section aria-label={t("preview.title")} data-coach-preview className={cardClass}>
      <p className="type-label text-faint-foreground">{t("preview.title")}</p>
      <Identity values={profile} />
      <p
        className={cn(
          "type-caption",
          values.coaching_formats.length > 0 ? "text-muted-foreground" : "text-faint-foreground",
        )}
      >
        {values.coaching_formats.length > 0 ? chosen.join(" · ") : t("preview.formats")}
      </p>
    </section>
  );
}

/** WCR7's "Your coach profile" card: the completed profile, row by row. */
export function CompletedCoachCard({
  profile,
  values,
}: {
  profile: ProfileValues;
  values: TypeValues;
}) {
  const t = useTranslations("coachOnboarding");
  const rows = [
    {
      key: "formats",
      label: t("done.formats"),
      value: values.coaching_formats
        .map((format) => t(`type.formats.options.${format}.label`))
        .join(" · "),
    },
    {
      key: "competition",
      label: t("done.competition"),
      value: values.competition_levels
        .map((level) => t(`type.levels.options.${level}`))
        .join(" · "),
    },
    {
      key: "languages",
      label: t("done.languages"),
      value: profile.languages
        .map((language) => t(`profile.languages.options.${language}`))
        .join(" · "),
    },
  ];
  return (
    <section aria-label={t("done.card")} data-coach-card className={cardClass}>
      <p className="type-label text-faint-foreground">{t("done.card")}</p>
      <Identity values={profile} />
      <dl className="flex min-w-0 flex-col">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex min-h-13 items-center gap-3 border-t border-border-subtle py-2"
          >
            <dt className="w-30 flex-none type-caption font-bold text-faint-foreground">
              {row.label}
            </dt>
            <dd className="min-w-0 flex-1 type-body-sm font-bold break-words">
              {row.value || t("done.none")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
