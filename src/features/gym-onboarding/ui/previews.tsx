"use client";

import { MapPinIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";

import type { GymSetupGymType } from "@/shared/api/generated/model";
import { cn } from "@/shared/lib/utils";
import { BrandMark } from "@/shared/ui/brand-mark";

/*
 * The asides of OG1–OG3: what the saved and typed values look like. Members
 * cannot see a gym yet (nothing is published), so every preview says so
 * instead of "How members see you"; there is no verified badge, trial offer,
 * cover photo or public address (approved SF-86 differences).
 */

/** The OG3 accent as a tile fill. The six swatches are light, so the ink is always graphite. */
export function accentStyle(accent: string | null): CSSProperties | undefined {
  return accent === null ? undefined : { backgroundColor: accent, color: "var(--graphite-950)" };
}

/** The gym's initials for the tile (no logo upload exists yet). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toLocaleUpperCase() ?? "")
    .join("");
}

export function PreviewCard({
  label,
  note,
  children,
  className,
}: {
  label: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      data-preview
      className={cn("flex min-w-0 flex-col gap-3.5 rounded-3xl border bg-surface p-4.5", className)}
    >
      <p className="type-label text-faint-foreground">{label}</p>
      {children}
      {note && <p className="type-caption text-faint-foreground">{note}</p>}
    </section>
  );
}

function GymTile({
  name,
  accent,
  size,
}: {
  name: string;
  accent: string | null;
  size: "md" | "lg";
}) {
  const initials = initialsOf(name);
  return (
    <span
      aria-hidden
      style={accentStyle(accent)}
      className={cn(
        "flex flex-none items-center justify-center font-display font-semibold",
        accent === null && "bg-accent-strong text-accent-foreground",
        size === "md" ? "size-14 rounded-lg type-title" : "size-13 rounded-lg type-title",
      )}
    >
      {initials === "" ? <BrandMark className="size-8" /> : initials}
    </span>
  );
}

/** OG1's aside: the gym card from the typed name and type (and the saved city, if any). */
export function GymCardPreview({
  name,
  gymType,
  city,
  accent,
}: {
  name: string;
  gymType: GymSetupGymType | null;
  city: string | null;
  accent: string | null;
}) {
  const t = useTranslations("gymOnboarding");
  const title = name.trim() === "" ? t("preview.namePlaceholder") : name.trim();
  const meta = [gymType && t(`gymTypes.${gymType}`), city].filter(Boolean).join(" · ");
  return (
    <PreviewCard label={t("preview.label")} note={t("preview.private")}>
      <div className="flex min-w-0 items-center gap-3.5">
        <GymTile name={name} accent={accent} size="md" />
        <div className="flex min-w-0 flex-col gap-1">
          <p className={cn("type-h3 break-words", name.trim() === "" && "text-faint-foreground")}>
            {title}
          </p>
          {meta && <p className="type-caption text-muted-foreground">{meta}</p>}
        </div>
      </div>
    </PreviewCard>
  );
}

/** OG2's aside: the address card and the single location. */
export function LocationPreview({
  gymName,
  city,
  countryName,
  address,
  note,
}: {
  gymName: string;
  city: string;
  countryName: string | null;
  address: string;
  note: string;
}) {
  const t = useTranslations("gymOnboarding");
  const place = [address.trim(), city.trim(), countryName].filter(Boolean).join(", ");
  return (
    <>
      <PreviewCard label={t("location.preview.label")} note={t("location.preview.note")}>
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex size-11 flex-none items-center justify-center rounded-md-lg bg-accent text-highlight"
          >
            <MapPinIcon className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <p className="type-body font-extrabold break-words">
              {city.trim() === "" ? gymName : `${gymName} · ${city.trim()}`}
            </p>
            <p className="type-body-sm break-words text-muted-foreground">
              {place === "" ? t("location.preview.empty") : place}
              {note.trim() !== "" && ` · ${note.trim()}`}
            </p>
          </div>
        </div>
      </PreviewCard>
      <PreviewCard label={t("location.list.label")} note={t("location.list.note")}>
        <div className="flex min-h-15 items-center gap-3">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="type-body font-extrabold break-words">
              {city.trim() === "" ? t("location.list.unnamed") : city.trim()}
            </span>
            <span className="type-caption break-words text-muted-foreground">
              {address.trim() === "" ? t("location.preview.empty") : address.trim()}
            </span>
          </span>
          <span className="flex-none rounded-sm bg-accent px-2.5 py-1 type-badge text-accent-foreground">
            {t("location.list.main")}
          </span>
        </div>
      </PreviewCard>
    </>
  );
}

/** OG3's live preview: the gym page on a phone, with the chosen accent and tagline. */
export function PhonePreview({
  name,
  city,
  gymType,
  tagline,
  accent,
}: {
  name: string;
  city: string | null;
  gymType: GymSetupGymType | null;
  tagline: string;
  accent: string | null;
}) {
  const t = useTranslations("gymOnboarding");
  return (
    <section
      aria-label={t("branding.preview.label")}
      data-preview
      className="flex flex-col items-center gap-3"
    >
      <p className="type-label text-faint-foreground">{t("branding.preview.label")}</p>
      <div className="flex h-125 w-62.5 flex-col overflow-hidden rounded-4xl border-6 border-border-subtle bg-background">
        <span aria-hidden className="h-32.5 flex-none bg-linear-160 from-accent to-background" />
        <div className="-mt-6.5 flex flex-col gap-1.5 px-4">
          <GymTile name={name} accent={accent} size="lg" />
          <p className="type-title break-words">{name}</p>
          {city && <p className="type-micro text-muted-foreground">{city}</p>}
          {tagline.trim() !== "" && (
            <p className="type-caption break-words text-muted-foreground">{tagline.trim()}</p>
          )}
          {gymType && (
            <span className="mt-1.5 flex">
              <span className="rounded-sm bg-accent px-2.5 py-1 type-badge text-accent-foreground">
                {t(`gymTypes.${gymType}`)}
              </span>
            </span>
          )}
          <span
            aria-hidden
            style={accentStyle(accent)}
            className={cn("mt-2 h-10 rounded-md", accent === null && "bg-primary")}
          />
          <span aria-hidden className="h-14.5 rounded-md bg-surface" />
          <span aria-hidden className="h-14.5 rounded-md bg-surface" />
        </div>
      </div>
      <p className="max-w-62.5 text-center type-caption text-faint-foreground">
        {t("preview.private")}
      </p>
    </section>
  );
}
