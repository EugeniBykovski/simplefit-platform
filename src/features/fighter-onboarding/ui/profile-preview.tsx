"use client";

import { LockIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { countryName } from "@/shared/lib/countries";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Notice } from "@/shared/ui/notice";

import type { BasicsValues, ProfileValues } from "../model/form-values";

/** "Alex K." → "AK"; nothing typed → "··" (the artboards' empty avatar). */
export function initialsOf(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toLocaleUpperCase() ?? "");
  return letters.join("") || "··";
}

function Avatar({ name, size }: { name: string; size: "lg" | "md" }) {
  const filled = name.trim() !== "";
  return (
    <span
      aria-hidden
      className={cn(
        "flex flex-none items-center justify-center rounded-full font-display font-bold",
        size === "lg" ? "size-13 type-title" : "size-11 type-body-sm",
        filled ? "bg-highlight text-highlight-foreground" : "bg-input text-faint-foreground",
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

/** "@alex_k · Warsaw", with the placeholders of the empty preview. */
function handleLine(
  username: string,
  city: string,
  placeholders: { username: string; city: string },
) {
  return `@${username.trim() || placeholders.username} · ${city.trim() || placeholders.city}`;
}

/** WF0 "Profile preview": the profile as it will be shown, updated as you type. */
export function BasicsPreview({ values }: { values: BasicsValues }) {
  const t = useTranslations("fighterOnboarding.preview");
  const locale = useLocale();
  const named = values.display_name.trim() !== "";
  return (
    <>
      <section
        aria-label={t("title")}
        data-profile-preview
        className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-4.5"
      >
        <p className="type-label text-faint-foreground">{t("title")}</p>
        <div className="flex items-center gap-3">
          <Avatar name={values.display_name} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p
              className={cn(
                "truncate type-body-lg font-extrabold",
                named ? "text-foreground" : "text-faint-foreground",
              )}
            >
              {named ? values.display_name.trim() : t("name")}
            </p>
            <p className="truncate type-caption text-muted-foreground">
              {handleLine(values.username, values.city, {
                username: t("username"),
                city: t("city"),
              })}
            </p>
          </div>
        </div>
        <p className="type-caption text-muted-foreground">
          {values.country_code ? countryName(values.country_code, locale) : t("country")}
        </p>
      </section>
      <Notice tone="olive" icon={LockIcon}>
        {t("private")}
      </Notice>
    </>
  );
}

/** WF1's summary: the saved basics, the chosen experience and stance, and the goals. */
export function ProfileSummary({
  basics,
  values,
}: {
  basics: BasicsValues;
  values: ProfileValues;
}) {
  const t = useTranslations("fighterOnboarding");
  const goals = values.goals.map((goal) => t(`profile.goals.options.${goal}`).toLocaleLowerCase());
  return (
    <>
      <section
        aria-label={t("preview.title")}
        data-profile-preview
        className="flex min-w-0 flex-col gap-3 rounded-3xl border bg-surface p-4.5"
      >
        <div className="flex items-center gap-3">
          <Avatar name={basics.display_name} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="truncate type-body-lg font-extrabold">
              {basics.display_name.trim() || t("preview.name")}
            </p>
            <p className="truncate type-caption text-muted-foreground">
              {handleLine(basics.username, basics.city, {
                username: t("preview.username"),
                city: t("preview.city"),
              })}
            </p>
          </div>
        </div>
        <ul className="flex flex-wrap items-center gap-1.5">
          <li>
            <Badge>
              {values.experience_level
                ? t(`profile.experience.options.${values.experience_level}`)
                : t("summary.experience")}
            </Badge>
          </li>
          <li>
            <Badge>
              {values.stance ? t(`profile.stance.options.${values.stance}`) : t("summary.stance")}
            </Badge>
          </li>
        </ul>
        <p className="type-caption text-muted-foreground">
          {goals.length > 0
            ? t("summary.goals", { goals: goals.join(", ") })
            : t("summary.noGoals")}
        </p>
      </section>
      <Notice tone="olive" icon={LockIcon}>
        {t("summary.private")}
      </Notice>
    </>
  );
}

/** WF6's profile card: the completed profile as others will see it. */
export function CompletedProfileCard({
  basics,
  values,
}: {
  basics: BasicsValues;
  values: ProfileValues;
}) {
  const t = useTranslations("fighterOnboarding.profile");
  const facts = [
    `@${basics.username}`,
    basics.city,
    values.experience_level ? t(`experience.options.${values.experience_level}`) : undefined,
    values.stance ? t(`stance.options.${values.stance}`) : undefined,
  ].filter((fact): fact is string => fact !== undefined && fact !== "");
  return (
    <div className="flex w-full items-center gap-3 rounded-3xl border bg-surface px-4.5 py-4">
      <Avatar name={basics.display_name} size="md" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate type-body-lg font-extrabold">{basics.display_name}</p>
        <p className="truncate type-caption text-muted-foreground">{facts.join(" · ")}</p>
      </div>
    </div>
  );
}
